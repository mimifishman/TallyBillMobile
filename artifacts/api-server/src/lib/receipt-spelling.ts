/**
 * The closest real word, for a Hebrew item name that came out as no word.
 *
 * The names readers copy letters, never guessing a familiar word, because a
 * guess swaps one real dish for another: gpt-4o read שיפוד כרוב (cabbage) as
 * שיפוד כבד (liver). But a misread letter then leaves a name that is no word at
 * all — עגוך קסחם for עגור קסם, מזוגז for מרגז — and the translation invents
 * an English name for it ("Agon Kashem"). The user saw exactly that on
 * 2026-09-28.
 *
 * A person reading a smudged receipt does both in turn: letter shapes first,
 * then the menu word the shapes fit — a restaurant, bar or cafe menu, which is
 * what TallyBill splits. This is the second step. It is one short
 * text-only call — no photo — given every reading of each Hebrew line, and it
 * may only:
 *   - keep a name that is already a real word, or pick a real one among the
 *     readings, or
 *   - change a name that is no word by at most two look-alike letters.
 *
 * The limit is enforced here, not trusted to the model: an answer further than
 * that from EVERY reading is thrown away and the voted name stays. Money is
 * never part of the request, so it cannot change.
 *
 * The prompt's example words are on no fixture receipt, on purpose: a real
 * fixture name in a prompt gets copied back and inflates the score. The OCR
 * prompt once held real fixture names, and the model copied a typo from it.
 */
import type { LineItem } from "./receipt-line-items";
import { editDistance, foldForVote } from "./receipt-names";

export const SPELLING_PROMPT = `You fix OCR misreadings of item names on the receipt of an Israeli restaurant, bar or cafe. Every name is something on its menu: a dish, a side, a drink, a dessert, or an extra such as a sauce or a topping.

Each line gives one or more readings of the SAME printed name, made by different OCR readers. The first reading is the current best guess. The readers confuse Hebrew letters that look alike in receipt fonts — ר and ד and ך, ב and כ, ו and ז and ן and י, ה and ח and ת, ס and ם, ט and מ, ע and צ, ג and נ — and sometimes add or drop a ו or a י.

For each line, return the name that was most likely printed:
- If a reading is already a real, sensible menu item — words a restaurant, bar or cafe in Israel would print, including dishes from other cuisines written in Hebrew letters (ניוקי, ברוסקטה, אנטרקוט) and names in Latin letters — return it exactly as written. When more than one reading is, prefer the earlier one.
- If no reading is a real menu item, return the real menu item closest to the readings, changing at most two letters, and only look-alike letters as above, or adding or dropping one ו or י.
- If you are not sure, return the first reading unchanged.
- Never translate. Never add or remove a word. Never turn one real dish into a different real dish.

The input is JSON: {"lines":[{"id":0,"readings":["...","..."]}]}
Return ONLY valid JSON: {"names":[{"id":0,"name":"..."}]}`;

const HEBREW = /[֐-׿]/;

export interface SpellingLine {
  /** Index of the line on the bill. */
  id: number;
  /** Every reading of the line, the voted one first. */
  readings: string[];
}

/** The Hebrew lines worth checking, with their readings. Other lines are left alone. */
export function spellingRequest(items: LineItem[], candidates: string[][]): SpellingLine[] {
  const lines: SpellingLine[] = [];
  items.forEach((item, id) => {
    if (!HEBREW.test(item.description)) return;
    const readings = candidates[id]?.length ? candidates[id]! : [item.description];
    lines.push({ id, readings: [item.description, ...readings.filter((r) => r !== item.description)] });
  });
  return lines;
}

/** id -> name from the model's reply, or null when there is nothing to use. */
export function parseSpelling(raw: string): Map<number, string> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const names = (parsed as { names?: unknown }).names;
  if (!Array.isArray(names)) return null;
  const out = new Map<number, string>();
  for (const n of names) {
    const id = typeof n?.id === "number" ? n.id : Number(n?.id);
    const name = typeof n?.name === "string" ? n.name.replace(/\s+/g, " ").trim() : "";
    if (Number.isInteger(id) && name) out.set(id, name);
  }
  return out;
}

/** How many letters a correction may differ from the nearest reading. */
function allowedChange(name: string): number {
  const letters = [...foldForVote(name).replace(/[\s'"]/g, "")].length;
  if (letters <= 3) return 1;
  return 2;
}

/**
 * Put the checked names on the bill, keeping only answers within the limit of
 * some reading. The same number of words is required too: "never add or
 * remove a word" is a rule the model is told, and checked.
 */
export function applySpelling(
  items: LineItem[],
  lines: SpellingLine[],
  answers: Map<number, string>,
): { items: LineItem[]; changed: number; refused: number } {
  let changed = 0, refused = 0;
  const out = items.slice();
  for (const line of lines) {
    const answer = answers.get(line.id);
    const item = out[line.id];
    if (!answer || !item || answer === item.description) continue;
    const words = (s: string) => s.trim().split(/\s+/).length;
    const near = line.readings.some(
      (r) => words(r) === words(answer) && editDistance(foldForVote(r), foldForVote(answer)) <= allowedChange(answer),
    );
    if (!near || !HEBREW.test(answer)) { refused++; continue; }
    out[line.id] = { ...item, description: answer };
    changed++;
  }
  return { items: out, changed, refused };
}
