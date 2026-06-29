import { randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike } from "node:crypto";

/**
 * Password hashing for the auth domain.
 *
 * No bcrypt/argon2 dependency is installed and infra must not be touched, so we
 * use Node's built-in scrypt (salted, memory-hard) — cryptographically sound and
 * dependency-free in the `nodejs` runtime. Plain text is NEVER stored.
 *
 * Stored format (single column `app_user.password_hash`):
 *   scrypt$<N>$<saltHex>$<hashHex>
 * where N is the cost parameter; the salt + cost travel with the hash so the
 * parameters can evolve without a schema change.
 */

/** Promise wrapper over the callback form so the scrypt `options` (cost N) can
 *  be passed — util.promisify's typed overload omits the options argument. */
function scrypt(password: BinaryLike, salt: BinaryLike, keylen: number, cost: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password, salt, keylen, { N: cost }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

const KEYLEN = 64;
const COST = 16384; // 2^14 — standard scrypt cost for interactive logins
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN, COST);
  return `scrypt$${COST}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(cost) || cost <= 1) return false;
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = await scrypt(password, salt, expected.length, cost);
  // Constant-time compare; lengths already match by construction (expected.length).
  return timingSafeEqual(derived, expected);
}
