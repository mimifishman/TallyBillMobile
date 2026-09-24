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
  const itemsTotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

  // A footer discount is only passed on when taking it off is what agrees with
  // the receipt's own total. Otherwise it is the receipt restating a saving
  // already inside the line totals, and applying it would undercharge.
  const claimedDiscount = normalizeBillDiscount(parsed.billDiscount);
  const billDiscount = shouldApplyBillDiscount(itemsTotal, printedTotal, claimedDiscount) ? claimedDiscount : null;

  return {
    items,
    billDiscount,
    // The receipt's own total, checked against what was read. It cannot fix a
    // bad scan, but it can say one happened.
    check: checkAgainstPrintedTotal(items, printedTotal, billDiscount),
    // The app adds these to the bill and formats them with .toFixed(2).
    taxAmount: normalizeReceiptAmount(parsed.taxAmount),
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
  return first.check.reconciled === false;
}

export type Verdict =
  | { use: "first"; why: "first-reconciled" | "no-second" | "second-not-reconciled" | "second-read-a-different-total" }
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
  return { use: "second" };
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
