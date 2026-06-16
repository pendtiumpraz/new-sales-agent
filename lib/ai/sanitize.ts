// AI output sanitation (doc 43). The UI must NEVER show raw markdown (##, **, _,
// backticks, bullets) and client messages (WA/email) must be clean plain text.
// Apply stripMarkdown to ALL AI text before display/send — platform + extension.

export function stripMarkdown(input: string | null | undefined): string {
  let s = input ?? "";
  if (!s) return "";
  // code fences + inline code
  s = s.replace(/```[\s\S]*?```/g, (b) => b.replace(/```[a-z]*\n?/gi, "").replace(/```/g, ""));
  s = s.replace(/`([^`]+)`/g, "$1");
  // headings (#, ##, …) at line start
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // blockquotes
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  // bold/italic: ***x*** **x** *x* __x__ _x_
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1$2");
  // list markers at line start (-, *, +, 1.) → keep text, drop the bullet
  s = s.replace(/^\s{0,4}([-*+]|\d+\.)\s+/gm, "");
  // links [text](url) → "text (url)"
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  // leftover stray markup chars
  s = s.replace(/[*_#`]{1,}/g, "");
  // collapse 3+ newlines
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// Strip any HTML tags/scripts too (for text shown in the UI or sent to channels).
export function stripUnsafe(input: string | null | undefined): string {
  return stripMarkdown((input ?? "").replace(/<[^>]*>/g, ""));
}
