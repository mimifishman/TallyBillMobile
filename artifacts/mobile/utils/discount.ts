/**
 * Working out discounts on a bill.
 *
 * A discount is held as MONEY off a line, never as a rate. Receipts round their
 * own discounts their own way — a "25% Happy Hour" on 57.00 prints as -14.00
 * where the arithmetic says 14.25 — so recomputing from a stored rate would
 * make the app disagree with the paper in someone's hand. A percent is what
 * gets typed; an amount is what gets kept.
 *
 * Because the line's `total` stays the amount actually charged, every other sum
 * on the bill keeps working untouched: a share is still the line total divided
 * by the people on it, and tax and tip still follow from those shares. Tipping
 * therefore happens on the discounted total, which is the number printed on the
 * receipt.
 */

export interface DiscountableLine {
  id: number;
  /** What is charged today — already discounted if this line is discounted. */
  total: number;
  /** What it cost before its discount. Null when it is not discounted. */
  originalTotal: number | null;
}

export interface LineDiscount {
  id: number;
  originalTotal: number | null;
  discountAmount: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What a line costs with no discount on it — the base every rate applies to. */
export function baseTotalOf(line: DiscountableLine): number {
  return line.originalTotal ?? line.total;
}

/** A rate typed by a person: 0-100, and 0 when it is not a usable number. */
export function parsePercent(raw: string): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 100);
}

/** Money off one line at a rate, rounded to the currency's smallest unit. */
export function discountAt(base: number, percent: number): number {
  return round2(base * (percent / 100));
}

/**
 * Applies a rate to one line, always measured against its undiscounted price so
 * that changing 20% to 25% does not compound onto the 20% already taken off.
 *
 * A rate of 0 clears the discount and puts the line back to its full price.
 */
export function applyPercent(line: DiscountableLine, percent: number, label?: string | null): LineDiscount & { discountLabel: string | null } {
  const base = baseTotalOf(line);
  if (percent <= 0) {
    return { id: line.id, originalTotal: null, discountAmount: 0, total: round2(base), discountLabel: null };
  }
  const discountAmount = discountAt(base, percent);
  return {
    id: line.id,
    originalTotal: round2(base),
    discountAmount,
    total: round2(base - discountAmount),
    discountLabel: label?.trim() ? label.trim() : `${round2(percent)}% off`,
  };
}

/**
 * Splits one discount amount across several lines in proportion to their price.
 *
 * Uses the largest remainder method: every share is rounded DOWN first, then the
 * pennies left over go to the lines whose fractions were biggest. Rounding each
 * share on its own instead would let the parts miss the printed total — 10.00
 * over three lines would come to 9.99 — and a bill that does not match the
 * receipt is the whole thing this feature exists to avoid.
 *
 * Ties go to the more expensive line, then to the earlier one, so the same
 * input always gives the same answer.
 */
export function apportion(amount: number, lines: DiscountableLine[]): Map<number, number> {
  const result = new Map<number, number>();
  const bases = lines.map((l) => ({ id: l.id, base: baseTotalOf(l) }));
  const totalBase = bases.reduce((sum, b) => sum + b.base, 0);
  if (amount <= 0 || totalBase <= 0) {
    for (const b of bases) result.set(b.id, 0);
    return result;
  }

  // Never take off more than there was to take. A discount that exceeds the
  // bill would otherwise drive every line negative, and a negative line is not
  // something the split, the tax or the tip can do anything sensible with.
  const capped = Math.min(amount, totalBase);

  // Work in whole cents so there is nothing left to drift.
  const targetCents = Math.round(capped * 100);
  const exact = bases.map((b) => ({ ...b, cents: (b.base / totalBase) * targetCents }));
  const floors = exact.map((e) => ({ ...e, floor: Math.floor(e.cents), rest: e.cents - Math.floor(e.cents) }));

  let remaining = targetCents - floors.reduce((sum, f) => sum + f.floor, 0);
  const order = [...floors].sort((a, b) => (b.rest - a.rest) || (b.base - a.base) || (a.id - b.id));
  const bonus = new Set<number>();
  for (const line of order) {
    if (remaining <= 0) break;
    bonus.add(line.id);
    remaining -= 1;
  }

  for (const f of floors) {
    result.set(f.id, (f.floor + (bonus.has(f.id) ? 1 : 0)) / 100);
  }
  return result;
}

/** Applies one discount amount across lines, splitting it by price. */
export function applyAmount(amount: number, lines: DiscountableLine[], label?: string | null): Array<LineDiscount & { discountLabel: string | null }> {
  const shares = apportion(amount, lines);
  return lines.map((line) => {
    const base = baseTotalOf(line);
    const discountAmount = shares.get(line.id) ?? 0;
    if (discountAmount <= 0) {
      return { id: line.id, originalTotal: null, discountAmount: 0, total: round2(base), discountLabel: null };
    }
    return {
      id: line.id,
      originalTotal: round2(base),
      discountAmount,
      total: round2(base - discountAmount),
      discountLabel: label?.trim() ? label.trim() : "Discount",
    };
  });
}

/** What comes off the bill in total, for showing back what was entered. */
export function totalDiscount(lines: Array<{ discountAmount?: number | null }>): number {
  return round2(lines.reduce((sum, l) => sum + (Number(l.discountAmount) || 0), 0));
}
