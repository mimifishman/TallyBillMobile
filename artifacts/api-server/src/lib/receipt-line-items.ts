/**
 * Turns the model's raw line items into the shape the app stores.
 *
 * Two things here exist because getting them wrong puts a wrong number in front
 * of a person paying:
 *
 * 1. The printed amount on a receipt line is the amount charged for that whole
 *    line — it already includes the quantity. Multiplying it by the quantity
 *    again is what made multi-quantity lines come out doubled (quantity 2) or
 *    tripled (quantity 3). So the line total is taken as printed and never
 *    re-multiplied; unitPrice is derived from it instead.
 *
 * 2. `total` is the amount actually charged, after any discount printed for
 *    that line. The prompt is what applies the discount, so that exactly one
 *    number counts and nothing can be subtracted twice. `originalTotal` carries
 *    the pre-discount amount purely so the app can show where the number came
 *    from, and is kept only when it really is higher than what was charged.
 */

export interface RawLineItem {
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  total?: number | null;
  originalTotal?: number | null;
  discountLabel?: string | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  originalTotal: number | null;
  discountLabel: string | null;
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Like positiveNumber but keeps an exact zero, for a line that was comped.
 *
 * Absence has to be rejected explicitly: Number(null) is 0 and Number("") is 0,
 * so a missing total would otherwise read as a free item and quietly wipe the
 * line's price.
 */
function nonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeLineItems(items: RawLineItem[] | undefined | null): LineItem[] {
  return (items ?? []).reduce<LineItem[]>((acc, item) => {
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) return acc;

    const quantity = positiveNumber(item.quantity) ?? 1;

    const originalTotal = positiveNumber(item.originalTotal);

    // The line total as charged wins. When the model reports only one amount it
    // is that printed line amount, whichever field it landed in — so use it as
    // the line total rather than as a per-unit price to multiply up.
    //
    // Zero is a real charge when the line was comped: a "100% הנחה" leaves an
    // item that was genuinely ordered and is genuinely free, and dropping it
    // both hides it from the people splitting and, worse, silently loses the
    // discount that made it free. Zero with no original price behind it is just
    // a line with no price, and still goes.
    const charged = nonNegativeNumber(item.total) ?? positiveNumber(item.unitPrice);
    const total = charged === 0 && originalTotal === null ? null : charged;
    if (total === null) return acc;
    const wasDiscounted = originalTotal !== null && originalTotal > total;
    const label = typeof item.discountLabel === "string" ? item.discountLabel.trim() : "";

    acc.push({
      description,
      quantity,
      unitPrice: total === 0 ? 0 : round2(total / quantity),
      total: round2(total),
      originalTotal: wasDiscounted ? round2(originalTotal) : null,
      discountLabel: wasDiscounted && label ? label : null,
    });
    return acc;
  }, []);
}

/** A discount printed against the whole bill rather than against one item. */
export function normalizeBillDiscount(value: unknown): number | null {
  const n = positiveNumber(typeof value === "number" ? Math.abs(value) : Math.abs(Number(value)));
  return n === null ? null : round2(n);
}

/**
 * The receipt's own total for the items, if it printed one.
 *
 * Kept separate from anything computed here on purpose: it is only useful as an
 * independent check, so the moment it is derived from the items it stops being
 * evidence of anything.
 */
export function normalizePrintedTotal(value: unknown): number | null {
  const n = positiveNumber(value);
  return n === null ? null : round2(n);
}

/**
 * Decides whether a bill-level discount should be taken off, or is only the
 * receipt restating one already inside the item totals.
 *
 * A receipt that prices each line twice — full price in one column, charged
 * price in another — often also totals the saving at the foot. Read literally
 * that line looks like money still to come off, and taking it twice undercharges
 * the bill: the DejaVoo fixture prints five lines summing to 208.00 and a
 * "-110.00 Happy Hour" beneath them, and applying it again gives 98.00 against
 * a receipt that says 208.00 is due.
 *
 * The receipt settles it. Whichever reading lands on the printed total is the
 * right one, and the model does not have to get it right for this to work.
 * Where there is no printed total to check against, the discount is dropped
 * rather than guessed at — a bill that is too high is visible to everyone
 * paying, while one that is too low is not, and the printed-total warning has
 * nothing to fire on either way.
 */
export function shouldApplyBillDiscount(
  itemsTotal: number,
  printedTotal: number | null,
  billDiscount: number | null,
): boolean {
  if (billDiscount === null || billDiscount <= 0) return false;
  if (printedTotal === null) return false;

  const tolerance = Math.max(0.02, printedTotal * 0.01);
  const withDiscount = Math.abs(round2(itemsTotal - billDiscount) - printedTotal) <= tolerance;
  const withoutDiscount = Math.abs(round2(itemsTotal) - printedTotal) <= tolerance;

  // Only when taking it off is what agrees with the receipt, and leaving it on
  // does not. If both readings land on the total the discount is 0 in all but
  // name, and if neither does the receipt has not told us which is meant.
  return withDiscount && !withoutDiscount;
}

export interface ReceiptCheck {
  /** What the returned items add up to, after their own discounts. */
  itemsTotal: number;
  /** The receipt's own figure, or null when it did not print one. */
  printedTotal: number | null;
  /**
   * True when the two agree, false when they do not, null when the receipt
   * printed no total to check against. Null is not a pass — it means unknown.
   */
  reconciled: boolean | null;
  /** Signed gap, items minus receipt. Negative means items are missing. */
  difference: number | null;
}

/**
 * Compares what was read against what the receipt says it should come to.
 *
 * This is the cheap half of reconciliation: one subtraction, no second model
 * call, so it adds nothing to the scan budget. It cannot fix a bad read, but it
 * can say that one happened — which is the difference between a wrong number
 * shown confidently and a wrong number flagged for a human to look at.
 *
 * A bill-level discount is subtracted first, because it is the one thing the
 * receipt applies to its own total that the line items do not carry.
 *
 * The tolerance allows two cents for rounding, or 1% on larger bills where a
 * receipt's own rounding of percentage discounts can legitimately drift further
 * than that.
 */
export function checkAgainstPrintedTotal(
  items: LineItem[],
  printedTotal: number | null,
  billDiscount: number | null = null,
): ReceiptCheck {
  const itemsTotal = round2(items.reduce((sum, item) => sum + item.total, 0));
  const expected = round2(itemsTotal - (billDiscount ?? 0));

  if (printedTotal === null) {
    return { itemsTotal, printedTotal: null, reconciled: null, difference: null };
  }

  const difference = round2(expected - printedTotal);
  const tolerance = Math.max(0.02, printedTotal * 0.01);
  return {
    itemsTotal,
    printedTotal,
    reconciled: Math.abs(difference) <= tolerance,
    difference,
  };
}
