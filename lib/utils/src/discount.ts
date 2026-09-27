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
 *
 * Nothing here carries a label for the discount, and nothing stores one. How a
 * discount reads to a person is worked out from `originalTotal` and `total`
 * where it is shown, so it cannot go stale when a price is edited and cannot be
 * lost by a write that forgets to send it.
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

/**
 * A discount rate as a label: a whole number. The exact rate is kept for the
 * money — 14.00 off 57.00 is 24.56% — but "24.6% off" on a receipt row reads
 * as noise. A real discount never shows as 0% or as a free item's 100%.
 */
export function percentLabel(percent: number): string {
  const whole = Math.round(percent);
  if (whole <= 0 && percent > 0) return "<1";
  if (whole >= 100 && percent < 100) return "99";
  return String(whole);
}

/**
 * The same rate for an edit box: the whole number the label shows, so the two
 * never disagree. Only a rate that would round to 0 or 100 keeps a decimal,
 * because the box must hold a number, not "<1".
 */
export function percentInput(percent: number): string {
  const whole = Math.round(percent);
  if ((whole <= 0 && percent > 0) || (whole >= 100 && percent < 100)) {
    return String(Math.round(percent * 10) / 10);
  }
  return String(whole);
}

/**
 * The rate a discount was taken at, as the receipt would print it.
 *
 * Restaurants round the money off, not the rate. An Israeli receipt printed
 * "25% Happy Hour" under 57.00 and under 74.00, and took 14.00 and 19.00:
 * 25% is 14.25 and 18.50, rounded to whole shekels. Worked backwards, those
 * are 24.6% and 25.7%, and rounding them says 25% and 26%. Neither matches
 * the paper.
 *
 * So the discount is read at the precision it was printed to. A whole-number
 * discount could have come from any rate within half a unit of it. Among the
 * whole-number rates that fit, a round one (a multiple of 5, as promotions
 * are) wins, then the one nearest the exact rate. Money is never touched:
 * this only decides the label.
 */
export function discountRate(original: number, charged: number): number {
  if (!(original > 0)) return 0;
  const off = Math.round((original - charged) * 100) / 100;
  if (!(off > 0)) return 0;
  const exact = (off / original) * 100;
  const cents = Math.round(off * 100);
  const half = cents % 100 === 0 ? 0.5 : cents % 10 === 0 ? 0.05 : 0.005;
  const fits: number[] = [];
  if (!(charged > 0)) return 100;
  for (let rate = 1; rate < 100; rate++) {
    if (Math.abs((original * rate) / 100 - off) <= half + 1e-9) fits.push(rate);
  }
  if (fits.length === 0) return exact;
  const round = fits.filter((rate) => rate % 5 === 0);
  const pool = round.length > 0 ? round : fits;
  return pool.reduce((best, rate) => (Math.abs(rate - exact) < Math.abs(best - exact) ? rate : best));
}

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

/**
 * Money off one line at a rate, rounded to the currency's smallest unit.
 *
 * Worked out in whole agorot as `base * percent`, not as `base * (percent/100)`
 * then scaled back up. The two disagree by an agora whenever the exact answer
 * lands on a half — 427.75 at 30% is exactly 128.325 — because a percentage
 * divided by 100 is rarely exact in binary. inferDiscountSelection searches
 * using the first form, so using the second here would have it announce a rate
 * and then apply a figure an agora away from the one it matched.
 */
export function discountAt(base: number, percent: number): number {
  return Math.round(base * percent) / 100;
}

/**
 * Applies a rate to one line, always measured against its undiscounted price so
 * that changing 20% to 25% does not compound onto the 20% already taken off.
 *
 * A rate of 0 clears the discount and puts the line back to its full price.
 */
export function applyPercent(line: DiscountableLine, percent: number): LineDiscount {
  const base = baseTotalOf(line);
  if (percent <= 0) {
    return { id: line.id, originalTotal: null, discountAmount: 0, total: round2(base) };
  }
  const discountAmount = discountAt(base, percent);
  return {
    id: line.id,
    originalTotal: round2(base),
    discountAmount,
    total: round2(base - discountAmount),
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
export function applyAmount(amount: number, lines: DiscountableLine[]): LineDiscount[] {
  const shares = apportion(amount, lines);
  return lines.map((line) => {
    const base = baseTotalOf(line);
    const discountAmount = shares.get(line.id) ?? 0;
    if (discountAmount <= 0) {
      return { id: line.id, originalTotal: null, discountAmount: 0, total: round2(base) };
    }
    return {
      id: line.id,
      originalTotal: round2(base),
      discountAmount,
      total: round2(base - discountAmount),
    };
  });
}

/** What comes off the bill in total, for showing back what was entered. */
export function totalDiscount(lines: Array<{ discountAmount?: number | null }>): number {
  return round2(lines.reduce((sum, l) => sum + (Number(l.discountAmount) || 0), 0));
}

/** Rates a receipt actually prints. Anything else is not worth guessing at. */
const COMMON_RATES = [5, 10, 12.5, 15, 20, 25, 30, 33, 40, 50, 60, 75, 100];

/** Above this the subset search is not worth doing; 2^16 is already 65k. */
const MAX_LINES_TO_INFER = 16;

export interface InferredDiscount {
  /** Ids of the lines the discount appears to have applied to. */
  lineIds: number[];
  percent: number;
}

/**
 * Works out which items a printed discount came off, when it can be known.
 *
 * A receipt says "-94.00" but not what it applied to, and on the fixture that
 * prompted this it applied to five lines of seven. Guessing wrong is worse than
 * not guessing — it would silently discount the wrong person's dish — so this
 * only answers when the answer is unambiguous.
 *
 * The search is over subsets: for each one, is the printed discount a round
 * percentage of that subset's total? On the Back Yard receipt exactly one
 * combination works, 20% off 470.00 of the 572.00, and the two 51.00 lines are
 * left out. Where several combinations work, or none does, this returns null
 * and the choice stays with the person holding the receipt.
 *
 * Subsets are enumerated rather than solved cleverly because a bill has a
 * handful of lines, not thousands, and a plain loop is easier to be sure of.
 */
export function inferDiscountSelection(
  lines: DiscountableLine[],
  discountAmount: number,
): InferredDiscount | null {
  if (discountAmount <= 0 || lines.length === 0 || lines.length > MAX_LINES_TO_INFER) return null;

  const bases = lines.map((line) => ({ id: line.id, base: baseTotalOf(line) }));
  const target = Math.round(discountAmount * 100);

  let found: InferredDiscount | null = null;
  for (let mask = 1; mask < 1 << bases.length; mask++) {
    // Rounded to money before comparing. Adding a handful of two-decimal values
    // as raw floats drifts in the last bits, and that drift is enough to flip
    // the rounding of subtotal * percent — so a subset that genuinely produces
    // the printed amount could be missed, or one that does not could match.
    let raw = 0;
    for (let i = 0; i < bases.length; i++) if (mask & (1 << i)) raw += bases[i]!.base;
    const subtotal = round2(raw);
    if (subtotal <= 0) continue;

    for (const percent of COMMON_RATES) {
      if (Math.round(subtotal * percent) !== target) continue;
      // A second answer means the receipt does not say which is right.
      if (found) return null;
      found = {
        lineIds: bases.filter((_, i) => mask & (1 << i)).map((b) => b.id),
        percent,
      };
      break;
    }
  }
  return found;
}
