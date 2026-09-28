/**
 * Pins the names reading's one promise: it changes WORDS, never money.
 * Run: pnpm run check:names
 *
 * Built from the user's 16-line Hebrew receipt of 2026-09-27, as gpt-4o really
 * read it, and from what a names reading on strips can plausibly send back:
 * lines repeated by the strip overlap, lines missed, a quantity left in the
 * name, an invented amount.
 */
import { applyNames, parseNameLines } from "../src/lib/receipt-names.ts";
import { normalizeLineItems } from "../src/lib/receipt-line-items.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) { failed++; console.log(`FAIL  ${name}`); if (got !== undefined) console.log("      got  " + JSON.stringify(got)); }
  else console.log(`PASS  ${name}`);
}

// gpt-4o's reading, 2026-09-28 on dev: money right, 6 names wrong.
const gpt4o = normalizeLineItems([
  { description: "עוגת קסם", quantity: 1, total: 210 },
  { description: "PAIN KILLER", quantity: 1, total: 62 },
  { description: "מזטים", quantity: 1, total: 54 },
  { description: "לחמחה נג'ין", quantity: 1, total: 32 },
  { description: "אנטריק מופרק", quantity: 1, total: 64 },
  { description: "מרגז", quantity: 1, total: 58 },
  { description: "טרטר פילה", quantity: 1, total: 68 },
  { description: "שיפוד פטריות", quantity: 1, total: 55 },
  { description: "שיפוד כבד", quantity: 1, total: 58 },
  { description: "שיפוד פרגית", quantity: 1, total: 68 },
  { description: "סמאש בורגר", quantity: 2, total: 124 },
  { description: "שניצל עגל", quantity: 1, total: 105 },
  { description: "פרגית צלויה פרוסה", quantity: 1, total: 136 },
  { description: "צ'יפס", quantity: 2, total: 64 },
  { description: "שטורית ירוקה", quantity: 2, total: 56 },
  { description: "פירה תפו\"א", quantity: 2, total: 56 },
]);
const truth = [
  "עגור קסם", "PAIN KILLER", "מזטים", "לחמה בעג'ין", "ארנטריב מפורק", "מרגז", "טרטר פילה",
  "שיפוד פטריות", "שיפוד כרוב", "שיפוד פרגית", "סמאש בורגר", "שניצל עגל", "פיקניה צלויה פרוסה",
  "צ'יפס", "שעועית ירוקה", "פירה תפו\"א",
];
const money = (items: typeof gpt4o) => JSON.stringify(items.map(({ description: _d, ...rest }) => rest));

{
  const lines = truth.map((name, i) => ({ name, amount: gpt4o[i]!.total }));
  const out = applyNames(gpt4o, lines);
  check("a full, correct names reading fixes every name",
    out.items.every((it, i) => it.description === truth[i]), out.items.map((i) => i.description));
  check("and changes exactly the six wrong ones", out.changed === 6 && out.matched === 16, out);
  check("and not one amount", money(out.items) === money(gpt4o));
}

{
  // Strip overlap repeats lines 6-7; line 9 is missed entirely; quantity left in a name.
  const lines = [
    ...truth.slice(0, 7).map((name, i) => ({ name, amount: gpt4o[i]!.total })),
    { name: "מרגז", amount: 58 }, { name: "טרטר פילה", amount: 68 },
    { name: "שיפוד פטריות", amount: 55 },
    { name: "שיפוד פרגית", amount: 68 },
    { name: "2 סמאש בורגר", amount: 124 },
    ...truth.slice(11).map((name, k) => ({ name, amount: gpt4o[11 + k]!.total })),
  ];
  const out = applyNames(gpt4o, lines);
  check("a repeated overlap does not shift the names below it",
    out.items[9]!.description === "שיפוד פרגית" && out.items[12]!.description === "פיקניה צלויה פרוסה",
    out.items.map((i) => i.description));
  check("a missed line keeps gpt-4o's name (58.00 twice, only one sent)",
    out.items[8]!.description === "שיפוד כבד" && out.items[5]!.description === "מרגז",
    [out.items[5]!.description, out.items[8]!.description]);
  check("the item's own quantity is taken out of a name", out.items[10]!.description === "סמאש בורגר", out.items[10]);
  check("green beans and mashed potatoes, both 56.00, each get their own name",
    out.items[14]!.description === "שעועית ירוקה" && out.items[15]!.description === "פירה תפו\"א",
    [out.items[14]!.description, out.items[15]!.description]);
  check("money is still untouched", money(out.items) === money(gpt4o));
}

{
  // A names reading that invents amounts, or reads a line as another script.
  const lines = [
    { name: "Magic cake", amount: 210 },
    { name: "עוגת גבינה", amount: 999 },
    { name: "12.00", amount: 62 },
  ];
  const out = applyNames(gpt4o, lines);
  check("an amount that is none of the line's figures pairs with nothing",
    out.items.every((it, i) => it.description === gpt4o[i]!.description), out.items.slice(0, 3));
  check("a name in a different script, or with no letters, is not used", out.changed === 0, out);
  check("and money is untouched", money(out.items) === money(gpt4o));
}

{
  // A discounted line may be printed at its full price.
  const items = normalizeLineItems([{ description: "IPA", quantity: 2, total: 8, originalTotal: 16 }]);
  const out = applyNames(items, [{ name: "DRAFT IPA", amount: 16 }]);
  check("a line printed at its full price still gets its name",
    out.items[0]!.description === "DRAFT IPA" && out.items[0]!.total === 8 && out.items[0]!.originalTotal === 16, out.items[0]);
}

check("no names -> the bill unchanged", applyNames(gpt4o, []).items === gpt4o);
check("parse: reads lines, amounts as text, drops blanks",
  JSON.stringify(parseNameLines('{"lines":[{"name":" מרגז ","amount":"58.00"},{"name":"","amount":1},{"name":"x","amount":"n/a"}]}'))
    === JSON.stringify([{ name: "מרגז", amount: 58 }]),
  parseNameLines('{"lines":[{"name":" מרגז ","amount":"58.00"},{"name":"","amount":1},{"name":"x","amount":"n/a"}]}'));
check("parse: no JSON -> null", parseNameLines("sorry") === null);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
