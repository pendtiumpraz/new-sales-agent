import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for tenant BYOK API keys (doc 24). Key derived from a server
// secret — never store the raw key. Platform keys live in env, not here.
function key(): Buffer {
  const secret = process.env.AI_KEY_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("AI_KEY_SECRET / AUTH_SECRET required to encrypt AI credentials");
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

/** Returns `iv:tag:ciphertext`, all base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, encB] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}
