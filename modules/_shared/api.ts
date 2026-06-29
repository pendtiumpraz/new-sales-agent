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
