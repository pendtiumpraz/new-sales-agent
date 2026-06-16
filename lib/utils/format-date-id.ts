// Bahasa Indonesia date/time formatting (build.md §3.5), Asia/Jakarta semantics.
import { format, formatDistanceToNowStrict, isToday, isValid, isYesterday } from "date-fns";
import { id } from "date-fns/locale";

/** "15 Mei 2026" */
export function formatDateID(date: string | Date | null | undefined): string {
  const d = toDate(date);
  return d ? format(d, "d MMMM yyyy", { locale: id }) : "";
}

/** "15 Mei" (no year) */
export function formatDayMonthID(date: string | Date | null | undefined): string {
  const d = toDate(date);
  return d ? format(d, "d MMM", { locale: id }) : "";
}

/** "14:30 WIB" — 24-hour */
export function formatTimeID(date: string | Date | null | undefined): string {
  const d = toDate(date);
  return d ? `${format(d, "HH:mm")} WIB` : "";
}

/** "15 Mei 2026, 14:30 WIB" */
export function formatDateTimeID(date: string | Date | null | undefined): string {
  const d = toDate(date);
  return d ? `${formatDateID(d)}, ${formatTimeID(d)}` : "";
}

/** Smart conversation timestamp: "14:30", "Kemarin", or "15 Mei". */
export function formatConversationTime(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return "";
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Kemarin";
  return format(d, "d MMM", { locale: id });
}

/** "5 menit lalu", "2 jam lalu" */
export function formatRelativeID(date: string | Date | null | undefined): string {
  const d = toDate(date);
  return d ? `${formatDistanceToNowStrict(d, { locale: id })} lalu` : "";
}

/** Parse to a valid Date, or null — so date-fns never gets an Invalid Date
 *  (which throws "Invalid time value" and would crash the render). */
function toDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return isValid(d) ? d : null;
}
