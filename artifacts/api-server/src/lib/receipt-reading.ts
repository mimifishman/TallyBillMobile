/**
 * Turning a model's answer into a bill, and deciding between two answers.
 *
 * Kept out of the route so every rule here can be tested without a model call.
 */
import {
  checkAgainstPrintedTotal,
  normalizeBillDiscount,
  normalizeLineItems,
  normalizePrintedTotal,
  normalizeReceiptAmount,
  reconcileTolerance,
  shouldApplyBillDiscount,
  type LineItem,
  type RawLineItem,
  type ReceiptCheck,
} from "./receipt-line-items";

/** What a model returns, before anything is trusted. */
export interface AIReceiptResponse {
  items?: RawLineItem[];
  billDiscount?: number | null;
  printedTotal?: number | null;
  taxAmount?: unknown;
  tipAmount?: unknown;
  currency?: string | null;
}

/** One model's reading of a receipt, normalised and checked against itself. */
export interface Reading {
  items: LineItem[];
  billDiscount: number | null;
  check: ReceiptCheck;
  taxAmount: number | null;
  tipAmount: number | null;
  currency: string | null;
}

/** The JSON object in a model's reply, or null when there is none to read. */
export function parseModelJson(raw: string): AIReceiptResponse | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as AIReceiptResponse;
  } catch {
    return null;
  }
}

export function interpretReceipt(parsed: AIReceiptResponse): Reading {
  const items = normalizeLineItems(parsed.items);
  const printedTotal = normalizePrintedTotal(parsed.printedTotal);
  const taxAmount = normalizeReceiptAmount(parsed.taxAmount);
  const itemsTotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

  // A footer discount is only passed on when taking it off is what agrees with
  // the receipt's own total. Otherwise it is the receipt restating a saving
  // already inside the line totals, and applying it would undercharge.
  const claimedDiscount = normalizeBillDiscount(parsed.billDiscount);
  const billDiscount = shouldApplyBillDiscount(itemsTotal, printedTotal, claimedDiscount, taxAmount)
    ? claimedDiscount
    : null;

  return {
    items,
    billDiscount,
    // The receipt's own total, checked against what was read. It cannot fix a
    // bad scan, but it can say one happened.
    check: checkAgainstPrintedTotal(items, printedTotal, billDiscount, taxAmount),
    // The app adds these to the bill and formats them with .toFixed(2).
    taxAmount,
    tipAmount: normalizeReceiptAmount(parsed.tipAmount),
    currency: parsed.currency ?? null,
  };
}

/**
 * Whether a first reading is worth a second opinion.
 *
 * ONLY when the receipt itself says it is wrong: a printed total that the items
 * do not add up to. A reading that agrees with the receipt is never second-
 * guessed, and one with no printed total to check has nothing a second model
 * could be judged against.
 *
 * On the 2026-09-24 sweep gpt-4o reconciled 21 of 21 Hebrew scans, so for the
 * Hebrew receipts most users send this is almost never true and they go out
 * exactly as before.
 */
export function wantsSecondOpinion(first: Reading): boolean {
  const { reconciled, difference, itemsTotal } = first.check;
  if (reconciled !== false || difference === null || itemsTotal <= 0) return false;
  // A missed discount always leaves the items HIGHER than the receipt.
  if (difference <= 0) return false;
  return difference / itemsTotal <= MAX_DISCOUNT_GAP;
}

/**
 * The largest share of a bill a missed discount is believed to account for.
 *
 * Every real missed discount measured is well under it: US layout 2 is 6.7% of
 * the items, 306 is 9.8%, the French happy hour 9.8%, Holy 20.5%. A 50%-off
 * everything happy hour would sit exactly on it.
 *
 * Above it the printed total is almost certainly not the bill at all. On the
 * Hebrew DejaVoo receipt gpt-4o reads every item right — 208.00 — and takes
 * the 90.00 on the card-terminal slip below it as the total. That is a 57% gap.
 * No discount explains it and no second model can fix it, because the items
 * were never wrong; asking o4-mini anyway made a Hebrew scan take 19 seconds
 * instead of 8, for nothing, every time.
 */
const MAX_DISCOUNT_GAP = 0.5;

export type Verdict =
  | {
      use: "first";
      why:
        | "first-reconciled"
        | "no-second"
        | "second-not-reconciled"
        | "second-read-a-different-total"
        | "second-changed-the-items";
    }
  | { use: "second" };

/**
 * Which reading goes on the bill.
 *
 * The second is taken only when it agrees with the receipt AND read the same
 * printed total as the first. Both models reading one figure off the paper is
 * the evidence; a second model that "reconciles" by misreading the total would
 * otherwise look exactly like one that got the items right.
 */
export function judgeReadings(first: Reading, second: Reading | null): Verdict {
  if (first.check.reconciled !== false) return { use: "first", why: "first-reconciled" };
  if (!second) return { use: "first", why: "no-second" };
  if (second.check.reconciled !== true) return { use: "first", why: "second-not-reconciled" };
  const a = first.check.printedTotal;
  const b = second.check.printedTotal;
  if (a === null || b === null || Math.abs(a - b) > reconcileTolerance(a)) {
    return { use: "first", why: "second-read-a-different-total" };
  }
  if (!sameFullPrices(first, second)) return { use: "first", why: "second-changed-the-items" };
  return { use: "second" };
}

/**
 * How far apart two readings' full prices may be and still be the same items.
 *
 * One misread price on a normal bill is well inside it — the IPA read as 18.00
 * against 16.00 is 1.7% of that receipt. Items shrunk to fit a wrong total are
 * nowhere near: 208.00 squeezed to the 90.00 card slip is 57%.
 */
const SAME_ITEMS_TOLERANCE = 0.05;

/** What the items come to BEFORE any of their own discounts. */
function fullPrice(reading: Reading): number {
  return reading.items.reduce((sum, item) => sum + (item.originalTotal ?? item.total), 0);
}

/**
 * The second opinion is there to find a discount the first missed, and may only
 * lower the bill by one. So it must describe the same items at the same full
 * prices — the difference showing up only as an originalTotal, or as a
 * billDiscount — and not simply different, smaller numbers.
 *
 * Two models agreeing on the printed total is not enough on its own. If both
 * read a wrong one, a second reading that shrank correct items to fit it would
 * pass every other check here and undercharge the table.
 */
function sameFullPrices(first: Reading, second: Reading): boolean {
  const b = fullPrice(second);
  const close = (a: number) => a > 0 && Math.abs(a - b) / a <= SAME_ITEMS_TOLERANCE;
  // Either description of the first reading will do. Its charged total is what
  // it believed the items cost; its full price adds the originalTotals it
  // claimed. Those can disagree because the FIRST reading is the one in doubt:
  // on US layout 2 as a JPEG, gpt-4o sometimes applies the happy hour
  // backwards and invents an original of 24.00 for a 16.00 beer. Measured
  // against that invention, o4-mini's correct reading looked 6% off and was
  // thrown away — 2 scans in 6 on dev. A reading that shrinks items to fit a
  // wrong total matches neither description.
  return close(first.check.itemsTotal) || close(fullPrice(first));
}

/**
 * The bill, from the reading that won.
 *
 * Tax, tip and currency ALWAYS come from the first reading. The second model is
 * brought in to read items and discounts; it is not trusted with tax. o4-mini
 * added VAT to an Israeli receipt three times in three on the 2026-09-24 sweep,
 * where gpt-4o was 21 for 21 — so borrowing its tax would overcharge exactly
 * the users this app mostly serves.
 */
export function combineReadings(first: Reading, second: Reading | null, verdict: Verdict): Reading {
  if (verdict.use === "first" || !second) return first;
  return {
    ...first,
    items: second.items,
    billDiscount: second.billDiscount,
    check: second.check,
  };
}
