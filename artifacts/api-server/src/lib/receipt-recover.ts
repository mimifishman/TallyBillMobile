/**
 * A line gpt-4o missed, put back — only when the receipt's own total proves it.
 *
 * gpt-4o is the only reader of money, and on 2026-09-29 it missed one line of
 * the user's 16-line receipt (שיפוד כרוב, 58.00) on every one of four scans of a
 * photo with a shadow across it. The bill came to 1212.00 against a printed
 * 1270.00. Both names readers, reading the same photo from full-resolution
 * strips, had all 16 lines, and their amounts came to exactly 1270.00.
 *
 * The names readers are kept away from money for a reason: gpt-5.4, as the main
 * reader, once invented a printed total to match its items. So a line comes
 * back only under all of these:
 *   - gpt-4o's items fall SHORT of the printed total gpt-4o itself read;
 *   - one names reader has a line for every one of gpt-4o's amounts, so it read
 *     the same receipt, and its other lines are the candidates;
 *   - at most three of them; and
 *   - with them added, the bill agrees with the printed total to the cent, tax
 *     and bill discount included, by the same check every scan already runs.
 * The printed total is never taken from the names reader, so a reader cannot
 * make its own lines agree with a total it made up.
 */
import {
  checkAgainstPrintedTotal,
  normalizeLineItems,
  type LineItem,
  type ReceiptCheck,
} from "./receipt-line-items";
import type { NameLine } from "./receipt-names";

/** More than this and it is a different reading of the receipt, not a missed line. */
const MAX_RECOVERED = 3;
const CENT = 0.005;

/** Could this printed amount be this item's line? */
function fits(item: LineItem, amount: number): boolean {
  const near = (v: number | null) => v !== null && Math.abs(v - amount) < CENT;
  return near(item.total) || near(item.originalTotal) || (item.quantity > 1 && near(item.unitPrice));
}

export interface Recovery {
  items: LineItem[];
  check: ReceiptCheck;
  added: number;
}

/**
 * The bill's items with the missed lines put back from `lines`, or null when
 * the receipt does not prove them. Money on gpt-4o's own lines never changes.
 */
export function recoverMissedLines(
  items: LineItem[],
  check: ReceiptCheck,
  billDiscount: number | null,
  taxAmount: number | null,
  lines: NameLine[],
): Recovery | null {
  if (check.reconciled !== false || check.difference === null || check.difference >= 0) return null;
  if (lines.length <= items.length) return null;

  // Match every one of gpt-4o's lines to one of the reader's, by amount. Order
  // is not trusted: on the photo above gpt-4o also read two lines in the wrong
  // order. A gpt-4o line with no match means the reader saw a different receipt.
  const used = new Array<boolean>(lines.length).fill(false);
  for (const item of items) {
    const j = lines.findIndex((l, k) => !used[k] && fits(item, l.amount));
    if (j < 0) return null;
    used[j] = true;
  }
  const missing = lines.map((l, k) => ({ l, k })).filter(({ k }) => !used[k]);
  if (missing.length === 0 || missing.length > MAX_RECOVERED) return null;

  // Each goes back where the reader saw it: after as many of gpt-4o's lines as
  // the reader had matched above it.
  const out = items.slice();
  let inserted = 0;
  for (const { l, k } of missing) {
    const above = used.slice(0, k).filter(Boolean).length;
    const [line] = normalizeLineItems([{ description: l.name, quantity: 1, total: l.amount }]);
    if (!line) return null;
    out.splice(above + inserted, 0, line);
    inserted++;
  }

  // To the cent: the everyday check allows a little rounding slack, and a line
  // that only nearly closes the gap is not proof.
  const recheck = checkAgainstPrintedTotal(out, check.printedTotal, billDiscount, taxAmount);
  if (recheck.reconciled !== true || Math.abs(recheck.difference ?? Infinity) >= CENT) return null;
  return { items: out, check: recheck, added: missing.length };
}
