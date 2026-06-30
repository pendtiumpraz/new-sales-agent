import { NextResponse } from "next/server";

/**
 * Consistent API response envelope for ALL rebuild module routes:
 *   { ok: true, data }  |  { ok: false, error }
 *
 * Routes stay THIN — they parse input, call the domain service, and wrap the
 * result with these helpers. Domain logic + DB access live in the service/repo.
 */

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResult<T> = ApiOk<T> | ApiErr;

/**
 * One page of a keyset-paginated list. `items` is the slice; `nextCursor` is the
 * opaque cursor to pass back as `?cursor=` to fetch the NEXT (older) page, or
 * `null` when the list is exhausted. Keyset (not offset) so deep pages stay
 * O(log n) and don't skip/duplicate rows under concurrent writes.
 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Inclusive cap on a single page so one big tenant can't ship its whole table. */
export const MAX_PAGE_LIMIT = 200;
export const DEFAULT_PAGE_LIMIT = 50;

/** Clamp a client-supplied `?limit=` into `[1, MAX_PAGE_LIMIT]` (default 50). */
export function parseLimit(raw: string | null | undefined, fallback = DEFAULT_PAGE_LIMIT): number {
  const n = raw == null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_PAGE_LIMIT);
}

/**
 * Encode/decode a keyset cursor. The cursor pins the last seen row by its sort
 * keys `(created_at, id)` so the next page resumes strictly after it. Encoded as
 * base64url JSON — opaque to the client, no `as any`, round-trips cleanly.
 */
export interface KeysetCursor {
  createdAt: string; // ISO timestamp of the last row on the previous page
  id: string; // tie-breaker (stable order when timestamps collide)
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): KeysetCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<KeysetCursor>;
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // Malformed cursor → treat as "from the start" rather than 500.
  }
  return undefined;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: string, status = 400, code?: string): NextResponse<ApiErr> {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/** Domain error a service can throw; routes turn it into a typed `fail()`. */
export class ServiceError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Parse a request JSON body, throwing a typed `ServiceError(400,"bad_json")` on a
 * malformed/empty body instead of letting the raw `SyntaxError` bubble into a 500
 * with a leaky message. Pair with `handle()` so the thrown error becomes a clean
 * `{ ok:false, error, code:"bad_json" }` envelope.
 */
export async function parseJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ServiceError("Malformed JSON body", 400, "bad_json");
  }
}

/** Wrap a route body so thrown ServiceErrors become consistent error envelopes
 *  and anything unexpected becomes a 500 — no stack leaks to the client. */
export async function handle<T>(
  fn: () => Promise<NextResponse<ApiResult<T>>>,
  tag = "api",
): Promise<NextResponse<ApiResult<T>>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ServiceError) {
      return fail(err.message, err.status, err.code);
    }
    console.error(`[${tag}]`, err);
    return fail("Internal error", 500, "internal");
  }
}
