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
  looksCutOff,
  closerToReceipt,
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
    items: [{ description: "טורטליני", quantity: 1, total: 55, originalTotal: 60, discountLabel: "הנחה" }, { description: "סלט", quantity: 1, total: 45 }],
    printedTotal: 100, taxAmount: 14.53, tipAmount: 10, currency: "USD",
  });
  const v = judgeReadings(hebrewFirst, secondWithVat);
  const bill = combineReadings(hebrewFirst, secondWithVat, v);
  check("the second reading's items are used", v.use === "second" && bill.check.itemsTotal === 100, bill.check);
  check("but NOT its VAT", bill.taxAmount === null, bill.taxAmount);
  check("nor its tip", bill.tipAmount === null, bill.tipAmount);
  check("nor its currency", bill.currency === "ILS", bill.currency);
}


// THE HEBREW CARD SLIP. he-dejavoo-twocolumn, as gpt-4o reads it on dev: every
// item right, 208.00, and the 90.00 from the card-terminal slip taken as the
// total. No discount explains a 57% gap and no second model can fix it, so it
// must not be asked — it made this Hebrew scan take 19 seconds instead of 8.
{
  const slip = interpretReceipt({
    items: [
      { description: "TROPICAL BLUSH", quantity: 1, total: 30, originalTotal: 59 },
      { description: "HONEY POT", quantity: 1, total: 31, originalTotal: 62 },
      { description: "טורטליני קאצ'ו אה פפה", quantity: 1, total: 51, originalTotal: 68 },
      { description: "סלט שורשים", quantity: 1, total: 45, originalTotal: 61 },
      { description: "מקלות פולנטה", quantity: 1, total: 51, originalTotal: 68 },
    ],
    printedTotal: 90, taxAmount: null, currency: "ILS",
  });
  check("the card-slip reading does not reconcile", slip.check.reconciled === false, slip.check);
  check("but a 57% gap is not a missed discount: no second opinion", !wantsSecondOpinion(slip), slip.check);

  // And even if one were asked, a reading that shrinks correct items to fit
  // the wrong total must be refused.
  const shrunk = interpretReceipt({
    items: [{ description: "TROPICAL BLUSH", quantity: 1, total: 45 }, { description: "HONEY POT", quantity: 1, total: 45 }],
    printedTotal: 90, taxAmount: null, currency: "ILS",
  });
  const v = judgeReadings(slip, shrunk);
  check("a second reading that shrinks the items to fit is refused",
    shrunk.check.reconciled === true && v.use === "first" && "why" in v && v.why === "second-changed-the-items", v);
}

// Items LOWER than the receipt is a missing line, not a missed discount.
{
  const short = interpretReceipt({ items: rest, printedTotal: 120, currency: "USD" });
  check("items below the printed total: no second opinion", !wantsSecondOpinion(short), short.check);
}

// Square's check-level discount now reconciles on the FIRST reading, because
// the printed total includes tax. So it never needs a second opinion at all.
{
  const square = interpretReceipt({
    items: [
      { description: "Pork Dumplings x 2", quantity: 1, total: 18 }, { description: "Scallion Pancake", quantity: 1, total: 9 },
      { description: "Dan Dan Noodles", quantity: 1, total: 17 }, { description: "Beef Chow Fun", quantity: 1, total: 19 },
      { description: "Mapo Tofu", quantity: 1, total: 16 }, { description: "Tsingtao x 2", quantity: 1, total: 14 },
      { description: "Jasmine Tea", quantity: 1, total: 11 },
    ],
    billDiscount: 15.6, printedTotal: 96.25, taxAmount: 7.85, currency: "USD",
  });
  check("US layout 3 keeps its 15.60 bill discount", square.billDiscount === 15.6, square.billDiscount);
  check("and reconciles without any second opinion",
    square.check.reconciled === true && !wantsSecondOpinion(square), square.check);
}

// The case the second opinion exists for must still be let through.
{
  check("US layout 2's full prices match, so its fix is still used",
    judgeReadings(gpt4o, o4mini).use === "second");
}


// US layout 2 as a JPEG, 2 scans in 6 on dev: gpt-4o applied the happy hour
// BACKWARDS — IPA 16.00 with an invented originalTotal of 24.00. o4-mini read
// it right, and the same-items check, measuring against the invented 24.00,
// threw the right answer away.
{
  const backwards = interpretReceipt({
    items: [{ description: "DRAFT IPA", quantity: 2, total: 16, originalTotal: 24, discountLabel: "HAPPY HOUR 50%" }, ...rest],
    printedTotal: 111, taxAmount: 9.85, currency: "USD",
  });
  check("gpt-4o's backwards reading asks for a second opinion", wantsSecondOpinion(backwards), backwards.check);
  const v = judgeReadings(backwards, o4mini);
  check("and o4-mini's correct reading is used despite the invented original", v.use === "second", v);
}


// A photo framed tight on the items: the header crop took the top quarter,
// which was items. On dev it came back with 2 of the 8 lines, every time.
{
  const cropped = interpretReceipt({
    items: [{ description: "FRENCH FRIES", quantity: 2, total: 12 }, { description: "NY CHEESECAKE", quantity: 1, total: 11 }],
    printedTotal: 111, taxAmount: 9.85, currency: "USD",
  });
  check("items far BELOW the printed total look cut off", looksCutOff(cropped), cropped.check);
  check("and are not mistaken for a missed discount", !wantsSecondOpinion(cropped));

  const whole = interpretReceipt({
    items: [{ description: "DRAFT IPA", quantity: 2, total: 16 }, ...rest],
    printedTotal: 111, taxAmount: 9.85, currency: "USD",
  });
  check("the whole photo's reading is kept, being closer to the receipt",
    closerToReceipt(cropped, whole) === whole, whole.check);
  check("and it then goes on to ask about the missed happy hour", wantsSecondOpinion(whole));

  check("items HIGHER than the total (a missed discount) are not a cut-off", !looksCutOff(gpt4o));
  check("a reading that matches is not a cut-off", !looksCutOff(o4mini));

  const worse = interpretReceipt({ items: [{ description: "FRIES", quantity: 1, total: 5 }], printedTotal: 111, currency: "USD" });
  check("a whole-photo reading further from the receipt is not taken", closerToReceipt(cropped, worse) === cropped);
  check("a tie keeps the cropped reading", closerToReceipt(cropped, cropped) === cropped);
}

// Parsing a model reply.
check("JSON inside prose is found", parseModelJson('here: {"items":[]} done')?.items?.length === 0);
check("no JSON is null, not a throw", parseModelJson("sorry, I cannot read that") === null);
check("broken JSON is null, not a throw", parseModelJson("{ items: [ }") === null);

console.log(failed === 0 ? "\nall good" : `\n${failed} failing`);
process.exit(failed === 0 ? 0 : 1);
