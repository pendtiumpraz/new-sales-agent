// Bahasa Indonesia date/time formatting (build.md §3.5), Asia/Jakarta semantics.
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { id } from "date-fns/locale";

/** "15 Mei 2026" */
export function formatDateID(date: string | Date): string {
  return format(toDate(date), "d MMMM yyyy", { locale: id });
}

/** "15 Mei" (no year) */
export function formatDayMonthID(date: string | Date): string {
  return format(toDate(date), "d MMM", { locale: id });
}

/** "14:30 WIB" — 24-hour */
export function formatTimeID(date: string | Date): string {
  return `${format(toDate(date), "HH:mm")} WIB`;
}

/** "15 Mei 2026, 14:30 WIB" */
export function formatDateTimeID(date: string | Date): string {
  return `${formatDateID(date)}, ${formatTimeID(date)}`;
}

/** Smart conversation timestamp: "14:30", "Kemarin", or "15 Mei". */
export function formatConversationTime(date: string | Date): string {
  const d = toDate(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Kemarin";
  return format(d, "d MMM", { locale: id });
}

/** "5 menit lalu", "2 jam lalu" */
export function formatRelativeID(date: string | Date): string {
  return `${formatDistanceToNowStrict(toDate(date), { locale: id })} lalu`;
}

function toDate(date: string | Date): Date {
  return typeof date === "string" ? new Date(date) : date;
}
