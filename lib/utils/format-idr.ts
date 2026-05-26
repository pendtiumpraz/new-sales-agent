// Indonesian Rupiah formatting (build.md §3.5).
// Full form: "Rp 1.250.000" — dots as thousand separators, no decimals.

const idrFull = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** "Rp 1.250.000" — normalized to a regular space after the symbol. */
export function formatIDR(amount: number): string {
  return idrFull.format(amount).replace(/ /g, " ");
}

/**
 * Compact form for dense surfaces (kanban cards, KPIs):
 * 2_000_000_000 -> "Rp 2 M", 250_000_000 -> "Rp 250 jt", 1_250_000 -> "Rp 1,25 jt".
 */
export function formatIDRCompact(amount: number): string {
  if (amount >= 1_000_000_000) {
    const v = amount / 1_000_000_000;
    return `Rp ${trim(v)} M`;
  }
  if (amount >= 1_000_000) {
    const v = amount / 1_000_000;
    return `Rp ${trim(v)} jt`;
  }
  if (amount >= 1_000) {
    const v = amount / 1_000;
    return `Rp ${trim(v)} rb`;
  }
  return formatIDR(amount);
}

function trim(v: number): string {
  // up to 2 decimals, Indonesian comma separator, no trailing zeros
  const s = v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0);
  return s.replace(/\.?0+$/, "").replace(".", ",");
}
