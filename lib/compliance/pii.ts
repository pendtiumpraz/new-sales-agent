// PII masking for display (doc 25). Used where raw contact values shouldn't be
// fully shown (exports preview, lower-trust surfaces).

function maskCore(s: string): string {
  if (s.length <= 2) return "*".repeat(s.length);
  return s[0] + "*".repeat(Math.max(1, s.length - 2)) + s[s.length - 1];
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return maskCore(email);
  return `${maskCore(user)}@${domain}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length < 4 ? "***" : `••• ${digits.slice(-4)}`;
}

export function maskValue(channel: string, value: string): string {
  if (channel === "email") return maskEmail(value);
  if (channel === "phone" || channel === "whatsapp") return maskPhone(value);
  return maskCore(value);
}
