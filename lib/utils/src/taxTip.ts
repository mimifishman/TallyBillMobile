export type MoneyMode = "percent" | "amount";

/**
 * The rate to store for a tax or tip the user gave us.
 *
 * A bill holds a rate, not a sum, so an amount has to be divided by the
 * subtotal — which means an amount can only be offered where a subtotal
 * exists. Three decimals keeps the money shown back rounding to the cents
 * that were typed, checked against awkward subtotals: 249.90 with 42.48 of
 * tax gives 16.999%, and reads back as 42.48 exactly.
 */
export function toPercent(mode: MoneyMode, raw: string, subtotal: number): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (mode === "percent") return value;
  if (subtotal <= 0) return 0;
  return Math.round((value / subtotal) * 100000) / 1000;
}

export function amountFromPercent(percent: number, subtotal: number): number {
  return Math.round(subtotal * (percent / 100) * 100) / 100;
}

/**
 * A rate for a label. A rate converted from an amount is rarely round, so
 * 16.999% reads as 17% — the money beside it is still worked out from the
 * stored rate, not from this.
 */
export function fmtPct(n: number): string {
  return String(Math.round(n * 100) / 100);
}
