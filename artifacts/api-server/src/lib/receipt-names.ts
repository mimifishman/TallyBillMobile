/**
 * A second look at the item NAMES, and nothing else.
 *
 * gpt-4o reads the money on a Hebrew receipt right — 21 of 21 totals on the
 * fixtures — but it reads the names poorly: about a third exact. The cause is
 * mostly resolution. The model shrinks a whole receipt photo to 768 pixels
 * wide before it looks at it, and a Hebrew letter on a phone photo of a long
 * receipt is then about 15 pixels tall. Letters that differ by one stroke —
 * ר/ד, כ/ב, ו/ז — blur into each other, and the model fills the gap with a
 * word it knows. On the user's receipt of 2026-09-27 that turned שיפוד כרוב
 * (cabbage) into שיפוד כבד (liver) and פיקניה (picanha) into פרגית (chicken),
 * and the translation then faithfully translated the wrong dish.
 *
 * So the receipt is also sent as horizontal strips, each short enough that the
 * model keeps it at full resolution, and a second call copies each line's name
 * and its printed amount. The strips are horizontal only: a vertical cut would
 * separate a right-to-left name from its price at the far edge.
 *
 * NOTHING about money comes from this reading. Its amounts are used only to
 * find which of gpt-4o's lines a name belongs to; gpt-4o's quantity, price,
 * total, discount and printed total are never touched. A model reading names
 * may miss a line, repeat one from an overlap between strips, or invent a
 * figure (gpt-5.4 invented a printed total when it was the main reader — see
 * routes/ocr.ts). None of that can reach the bill: an unmatched line changes
 * nothing, and a matched line changes only its words.
 */
import type { LineItem } from "./receipt-line-items";

export const NAMES_PROMPT = `You are copying item names off a restaurant receipt, letter by letter.

The receipt is shown as several horizontal strips, in order from top to bottom. Neighbouring strips overlap, so a line near the edge of one strip is repeated at the top of the next.

For every purchased item line, return the item's name exactly as it is printed and the amount printed on that same line.

Return ONLY valid JSON with this exact structure:
{"lines": [{"name": "item name as printed", "amount": 12.50}]}

Rules:
- Copy the letters that are printed. Do not correct the spelling, do not replace a word with a similar dish you know, and do not translate or transliterate. A name you do not recognise is still copied letter by letter.
- When a letter is unclear, choose the letter whose SHAPE matches the ink best, not the letter that makes a more familiar word. Hebrew letters that look alike — ר and ד, כ and ב, ו and ז and ן, ה and ח and ת, ס and ם — must be told apart by looking at the stroke.
- Keep the original script and the visual character order as printed (Hebrew stays Hebrew, Latin stays Latin).
- Never put the quantity or a price in "name".
- "amount" is the money printed at the end of that line, as a number. Never move an amount to the line above or below it.
- Options printed under an item — indented, or marked ">>" — are part of that item, not lines of their own. Leave them out, even when they show a small price inside their text such as ".10 (0.10)".
- List the lines from top to bottom. Leave out the shop header, subtotals, totals, tax, service, payment and change lines.
- A line that appears in two strips because of the overlap may be listed twice; that is fine.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

/** One line of the names reading: a name, and the amount that places it. */
export interface NameLine {
  name: string;
  amount: number;
}

/** The lines from a names reply, or null when there is nothing to use. */
export function parseNameLines(raw: string): NameLine[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const lines = (parsed as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return null;
  const out: NameLine[] = [];
  for (const line of lines) {
    const name = typeof line?.name === "string" ? line.name.replace(/\s+/g, " ").trim() : "";
    const amount = typeof line?.amount === "number" ? line.amount : Number(String(line?.amount ?? "").replace(",", "."));
    if (!name || !Number.isFinite(amount)) continue;
    out.push({ name, amount });
  }
  return out;
}

const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;

/** Which script a name is mostly written in, for a like-for-like check. */
function scriptOf(name: string): "hebrew" | "latin" | "other" {
  let he = 0, la = 0;
  for (const c of name) {
    if (HEBREW.test(c)) he++;
    else if (LATIN.test(c)) la++;
  }
  if (he === 0 && la === 0) return "other";
  return he >= la ? "hebrew" : "latin";
}

/** Edit distance by code point. */
function editDistance(a: string, b: string): number {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length]!;
}

function similarity(a: string, b: string): number {
  const longest = Math.max([...a].length, [...b].length);
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

const CENT = 0.005;

/** Could this printed amount be this item's line? Any of its own figures will do. */
function amountFits(item: LineItem, amount: number): boolean {
  const near = (v: number | null) => v !== null && Math.abs(v - amount) < CENT;
  return near(item.total) || near(item.originalTotal) || (item.quantity > 1 && near(item.unitPrice));
}

/**
 * A quantity the model left in the name, as a separate number at either end.
 * Only the item's own quantity is removed, so a name like "Coke 330" survives.
 */
function withoutQuantity(name: string, quantity: number): string {
  const q = String(quantity);
  const words = name.split(" ");
  if (words.length > 1 && words[0] === q) words.shift();
  if (words.length > 1 && words[words.length - 1] === q) words.pop();
  return words.join(" ");
}

export interface NamesOutcome {
  items: LineItem[];
  /** Lines of the bill that found a line in the names reading. */
  matched: number;
  /** Lines whose name actually changed. */
  changed: number;
}

/**
 * Put the names reading's words on the bill's lines. Money is never changed.
 *
 * The two readings are lined up in order, top to bottom, pairing a bill line
 * with a names line only when the names line's printed amount is one of that
 * bill line's own figures. This is a longest-common-subsequence alignment, so a
 * line the names reading missed, or repeated from a strip overlap, is simply
 * skipped rather than shifting every name below it by one.
 *
 * Receipts repeat prices — this one has two lines at 58.00, two at 68.00, two
 * at 56.00 — so among alignments with the SAME number of pairs, the one whose
 * names are most alike wins. The weight on likeness is kept below what one
 * extra pair is worth, so it can only break ties, never trade a matched line
 * away for a more similar one.
 *
 * A name is only replaced by one in the same script. gpt-4o returning Latin
 * letters where the names reading returns Hebrew (or the other way round) is a
 * disagreement about what the line IS, not about its spelling, and is left alone.
 */
export function applyNames(items: LineItem[], lines: NameLine[]): NamesOutcome {
  const n = items.length, m = lines.length;
  if (n === 0 || m === 0) return { items, matched: 0, changed: 0 };

  const tie = 1 / (2 * (Math.min(n, m) + 1));
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const pairValue = (i: number, j: number): number | null => {
    const item = items[i]!, line = lines[j]!;
    if (!amountFits(item, line.amount)) return null;
    return 1 + tie * similarity(item.description, withoutQuantity(line.name, item.quantity));
  };
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Math.max(score[i - 1]![j]!, score[i]![j - 1]!);
      const pair = pairValue(i - 1, j - 1);
      if (pair !== null) best = Math.max(best, score[i - 1]![j - 1]! + pair);
      score[i]![j] = best;
    }
  }

  const pairedWith = new Array<number | null>(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const pair = pairValue(i - 1, j - 1);
    if (pair !== null && Math.abs(score[i]![j]! - (score[i - 1]![j - 1]! + pair)) < 1e-9) {
      pairedWith[i - 1] = j - 1;
      i--; j--;
    } else if (score[i - 1]![j]! >= score[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  let matched = 0, changed = 0;
  const out = items.map((item, i) => {
    const j = pairedWith[i];
    if (j === null || j === undefined) return item;
    matched++;
    const name = withoutQuantity(lines[j]!.name, item.quantity);
    if (!/\p{L}/u.test(name)) return item;
    if (scriptOf(name) !== scriptOf(item.description)) return item;
    if (name === item.description) return item;
    changed++;
    return { ...item, description: name };
  });
  return { items: out, matched, changed };
}
