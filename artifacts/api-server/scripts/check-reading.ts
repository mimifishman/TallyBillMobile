/**
 * Pins the second-opinion rules. Run: pnpm run check:reading
 *
 * gpt-4o reads first. o4-mini is asked only when the receipt says gpt-4o got it
 * wrong, and its answer is used only when the receipt agrees with it. These are
 * the rules that keep that from ever making a bill worse — and in particular
 * from touching Hebrew receipts, which gpt-4o already gets right.
 */
import {
  interpretReceipt,
  judgeReadings,
  combineReadings,
  wantsSecondOpinion,
  parseModelJson,
} from "../src/lib/receipt-reading.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) { failed++; console.log(`FAIL  ${name}`); if (got !== undefined) console.log("      got  " + JSON.stringify(got)); }
  else console.log(`PASS  ${name}`);
}

// The US layout-2 receipt, as the two models actually read it on 2026-09-24.
// gpt-4o ignores the "HAPPY HOUR 50% -8.00" line; o4-mini folds it in.
const rest = [
  { description: "APEROL SPRITZ", quantity: 1, total: 14 },
  { description: "BUFFALO WINGS", quantity: 1, total: 16 },
  { description: "CAESAR SALAD", quantity: 1, total: 13 },
  { description: "CHEESEBURGER", quantity: 1, total: 19 },
  { description: "FISH TACOS", quantity: 1, total: 18 },
  { description: "FRENCH FRIES", quantity: 2, total: 12 },
  { description: "NY CHEESECAKE", quantity: 1, total: 11 },
];
const gpt4o = interpretReceipt({
  items: [{ description: "DRAFT IPA", quantity: 2, total: 16 }, ...rest],
  printedTotal: 111, taxAmount: 9.85, tipAmount: null, currency: "USD",
});
const o4mini = interpretReceipt({
  items: [{ description: "DRAFT IPA", quantity: 2, total: 8, originalTotal: 16, discountLabel: "HAPPY HOUR 50%" }, ...rest],
  printedTotal: 111, taxAmount: 9.85, tipAmount: null, currency: "USD",
});

check("gpt-4o's reading does not reconcile (119 vs 111)",
  gpt4o.check.reconciled === false && gpt4o.check.itemsTotal === 119, gpt4o.check);
check("so it asks for a second opinion", wantsSecondOpinion(gpt4o));
check("o4-mini's reading reconciles", o4mini.check.reconciled === true, o4mini.check);

{
  const v = judgeReadings(gpt4o, o4mini);
  const bill = combineReadings(gpt4o, o4mini, v);
  check("the reconciling second reading is used", v.use === "second", v);
  check("and the bill now comes to the printed 111",
    bill.check.itemsTotal === 111 && bill.check.reconciled === true, bill.check);
  check("with the discount on the IPA line",
    bill.items[0]!.total === 8 && bill.items[0]!.originalTotal === 16, bill.items[0]);
}

// A reading that already agrees with the receipt is never second-guessed.
{
  const fine = interpretReceipt({ items: rest, printedTotal: 103, currency: "USD" });
  check("a reconciled first reading does not ask", !wantsSecondOpinion(fine));
  check("and would be kept even if a second were offered",
    judgeReadings(fine, o4mini).use === "first");
}

// No printed total means nothing to judge a second model against.
{
  const blind = interpretReceipt({ items: rest, printedTotal: null, currency: "USD" });
  check("no printed total: no second opinion", !wantsSecondOpinion(blind), blind.check);
}

// Everything that must fall back to the first reading, unchanged.
{
  check("no second reading (timed out, errored) keeps the first",
    judgeReadings(gpt4o, null).use === "first" && combineReadings(gpt4o, null, judgeReadings(gpt4o, null)) === gpt4o);

  const alsoWrong = interpretReceipt({
    items: [{ description: "DRAFT IPA", quantity: 2, total: 18 }, ...rest], printedTotal: 111, currency: "USD",
  });
  const v = judgeReadings(gpt4o, alsoWrong);
  check("a second reading that also fails to reconcile is not used",
    v.use === "first" && "why" in v && v.why === "second-not-reconciled", v);

  // "Reconciles" only because it misread the total itself: items 119, total 119.
  const misreadTotal = interpretReceipt({
    items: [{ description: "DRAFT IPA", quantity: 2, total: 16 }, ...rest], printedTotal: 119, currency: "USD",
  });
  const w = judgeReadings(gpt4o, misreadTotal);
  check("a second reading that agrees with a DIFFERENT printed total is not used",
    misreadTotal.check.reconciled === true && w.use === "first" && "why" in w && w.why === "second-read-a-different-total", w);
}

// Tax, tip and currency always come from the first reading. This is the rule
// that protects Israeli receipts: o4-mini added VAT to one three times in three.
{
  const hebrewFirst = interpretReceipt({
    items: [{ description: "טורטליני", quantity: 1, total: 60 }, { description: "סלט", quantity: 1, total: 45 }],
    printedTotal: 100, taxAmount: null, tipAmount: null, currency: "ILS",
  });
  const secondWithVat = interpretReceipt({
    items: [{ description: "טורטליני", quantity: 1, total: 55 }, { description: "סלט", quantity: 1, total: 45 }],
    printedTotal: 100, taxAmount: 14.53, tipAmount: 10, currency: "USD",
  });
  const v = judgeReadings(hebrewFirst, secondWithVat);
  const bill = combineReadings(hebrewFirst, secondWithVat, v);
  check("the second reading's items are used", v.use === "second" && bill.check.itemsTotal === 100, bill.check);
  check("but NOT its VAT", bill.taxAmount === null, bill.taxAmount);
  check("nor its tip", bill.tipAmount === null, bill.tipAmount);
  check("nor its currency", bill.currency === "ILS", bill.currency);
}

// Parsing a model reply.
check("JSON inside prose is found", parseModelJson('here: {"items":[]} done')?.items?.length === 0);
check("no JSON is null, not a throw", parseModelJson("sorry, I cannot read that") === null);
check("broken JSON is null, not a throw", parseModelJson("{ items: [ }") === null);

console.log(failed === 0 ? "\nall good" : `\n${failed} failing`);
process.exit(failed === 0 ? 0 : 1);
