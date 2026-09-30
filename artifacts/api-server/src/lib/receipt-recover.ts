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
import { amountFits, foldForVote, similarity, type NameLine } from "./receipt-names";

/** More than this and it is a different reading of the receipt, not a missed line. */
const MAX_RECOVERED = 3;
const CENT = 0.005;

const fits = amountFits;

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

/**
 * gpt-4o's lines put in the order both names readers saw them, when gpt-4o put
 * a price on the wrong line.
 *
 * On the same photo gpt-4o read מרגז 58.00 / טרטר פילה 68.00 as מרגז 68.00 /
 * a 58.00 line: right amounts, wrong rows. The total still matched, so no
 * check caught it, and the names vote could not fix it either, because names
 * are matched to lines by amount in order. Both names readers had the rows
 * right.
 *
 * So when one names reader lists exactly gpt-4o's amounts in a different
 * order, and every other reader that answered — at least one — has those same
 * amounts in that same order, gpt-4o's lines are put in that order. Each line
 * keeps all of gpt-4o's money (quantity, price, total, discount); only its
 * place changes, so the names that follow attach to the right price. One
 * reader alone is not enough to move anything. "Has them in that order" allows
 * extra lines in between, because gpt-5.4 at times lists a run of lines twice
 * where two strips overlap (it did on this very photo); what it may not do is
 * put two of the amounts the other way round.
 */
export function reorderByReaders(items: LineItem[], readings: NameLine[][]): LineItem[] | null {
  if (readings.length < 2 || items.length < 2) return null;
  const order = readings.find((r) => r.length === items.length);
  if (!order) return null;
  // Is `seq` a subsequence of `r`, by amount?
  const within = (seq: NameLine[], r: NameLine[]) => {
    let k = 0;
    for (const l of r) if (k < seq.length && Math.abs(l.amount - seq[k]!.amount) < CENT) k++;
    return k === seq.length;
  };
  if (!readings.every((r) => r === order || within(order, r))) return null;
  // The readers' names for each row, from the readers that listed it once.
  const rowNames = readings.filter((r) => r.length === order.length);

  const used = new Array<boolean>(items.length).fill(false);
  const out: LineItem[] = [];
  for (let k = 0; k < order.length; k++) {
    // Among gpt-4o's lines with this amount, the one whose name is most like
    // the readers' name for this row, so equal prices do not trade names.
    let best = -1, bestLike = -1;
    items.forEach((item, i) => {
      if (used[i] || !fits(item, order[k]!.amount)) return;
      const like = Math.max(...rowNames.map((r) => similarity(foldForVote(item.description), foldForVote(r[k]!.name))));
      if (like > bestLike) { best = i; bestLike = like; }
    });
    if (best < 0) return null;
    used[best] = true;
    // A line that moved takes the readers' name for its new row: its old name
    // came with the wrong price, and the names vote protects the main
    // reading's name against a lone reader that looks nothing like it.
    const name = rowNames[0]?.[k]?.name;
    out.push(best !== k && name ? { ...items[best]!, description: name } : items[best]!);
  }
  return out.every((item, i) => item === items[i]) ? null : out;
}
