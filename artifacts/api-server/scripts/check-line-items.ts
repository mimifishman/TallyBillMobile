// Pins how multi-quantity receipt lines are normalized, so the doubling bug
// cannot come back. Run: pnpm run check:line-items
import { normalizeLineItems } from "../src/lib/receipt-line-items.ts";

const cases = [
  // name, input, expected {quantity, unitPrice, total}
  ["one printed amount, qty 2 (the doubling bug)",
    { description: "Beer", quantity: 2, unitPrice: 12.0, total: null },
    { quantity: 2, unitPrice: 6.0, total: 12.0 }],
  ["one printed amount, qty 3 (tripling)",
    { description: "Pita", quantity: 3, unitPrice: 15.0, total: null },
    { quantity: 3, unitPrice: 5.0, total: 15.0 }],
  ["qty 1 unchanged",
    { description: "Salad", quantity: 1, unitPrice: 9.5, total: null },
    { quantity: 1, unitPrice: 9.5, total: 9.5 }],
  ["both amounts printed, model correct",
    { description: "Wine", quantity: 2, unitPrice: 6.0, total: 12.0 },
    { quantity: 2, unitPrice: 6.0, total: 12.0 }],
  ["total only",
    { description: "Soup", quantity: 2, unitPrice: null, total: 11.0 },
    { quantity: 2, unitPrice: 5.5, total: 11.0 }],
  ["missing quantity defaults to 1",
    { description: "Coffee", quantity: null, unitPrice: null, total: 8.0 },
    { quantity: 1, unitPrice: 8.0, total: 8.0 }],
  ["Hebrew description preserved",
    { description: "בירה", quantity: 2, unitPrice: 12.0, total: null },
    { quantity: 2, unitPrice: 6.0, total: 12.0 }],
  ["uneven split keeps printed total",
    { description: "Mezze", quantity: 3, unitPrice: null, total: 10.0 },
    { quantity: 3, unitPrice: 3.33, total: 10.0 }],
];

let failed = 0;
for (const [name, input, want] of cases) {
  const [got] = normalizeLineItems([input]);
  const ok = got && got.quantity === want.quantity && got.unitPrice === want.unitPrice && got.total === want.total;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`);
}

// A discounted line: total is what was charged, originalTotal is what it was
// before, and unitPrice follows the charged amount — never the original.
const discounted = normalizeLineItems([
  { description: "סלט קיסר", quantity: 1, unitPrice: null, total: 43.0, originalTotal: 57.0, discountLabel: "25% Happy Hour" },
]);
const d = discounted[0];
const okDiscount = d && d.total === 43.0 && d.originalTotal === 57.0 && d.unitPrice === 43.0 && d.discountLabel === "25% Happy Hour";
if (!okDiscount) { failed++; console.log("      got ", JSON.stringify(d)); }
console.log(`${okDiscount ? "PASS" : "FAIL"}  a discounted line keeps the charged total and the original`);

// An originalTotal that is not actually higher is noise, not a discount.
const notDiscounted = normalizeLineItems([
  { description: "Cola", quantity: 1, unitPrice: null, total: 15.0, originalTotal: 15.0, discountLabel: "25% Happy Hour" },
]);
const n = notDiscounted[0];
const okNoDiscount = n && n.originalTotal === null && n.discountLabel === null;
if (!okNoDiscount) { failed++; console.log("      got ", JSON.stringify(n)); }
console.log(`${okNoDiscount ? "PASS" : "FAIL"}  an originalTotal equal to the total is not treated as a discount`);

// A discounted multi-quantity line must not be re-multiplied either.
const both = normalizeLineItems([
  { description: "Beer", quantity: 2, unitPrice: null, total: 18.0, originalTotal: 24.0, discountLabel: "Happy Hour" },
])[0];
const okBoth = both && both.total === 18.0 && both.unitPrice === 9.0 && both.originalTotal === 24.0;
if (!okBoth) { failed++; console.log("      got ", JSON.stringify(both)); }
console.log(`${okBoth ? "PASS" : "FAIL"}  a discounted quantity-2 line stays at its charged total`);

// A line comped to nothing is still a line. Dropping it hides an item people
// actually ordered, and takes the discount that made it free with it.
const comped = normalizeLineItems([
  { description: "שיק פאי", quantity: 1, unitPrice: null, total: 0, originalTotal: 36.0, discountLabel: "הנחה 100.00%" },
])[0];
const okComped = comped && comped.total === 0 && comped.unitPrice === 0 && comped.originalTotal === 36.0
  && comped.discountLabel === "הנחה 100.00%";
if (!okComped) { failed++; console.log("      got ", JSON.stringify(comped)); }
console.log(`${okComped ? "PASS" : "FAIL"}  an item comped to nothing is kept, with its discount`);

// Dropped rows
const dropped = normalizeLineItems([
  { description: "", quantity: 1, unitPrice: 5, total: 5 },
  { description: "No price", quantity: 1, unitPrice: null, total: null },
  { description: "Zero", quantity: 1, unitPrice: 0, total: 0 },
  { description: "Zero, no original", quantity: 1, unitPrice: null, total: 0, originalTotal: null },
  { description: "25% Happy Hour", quantity: 1, unitPrice: null, total: -14 },
  { description: "הנחה 100.00%", quantity: 1, unitPrice: null, total: -36 },
]);
const okDrop = dropped.length === 0;
if (!okDrop) failed++;
console.log(`${okDrop ? "PASS" : "FAIL"}  rows with no description, no price at all, or a negative price are dropped`);

// Whole-receipt total
const receipt = normalizeLineItems([
  { description: "Beer", quantity: 2, unitPrice: 12.0, total: null },
  { description: "Pita", quantity: 3, unitPrice: 15.0, total: null },
  { description: "Salad", quantity: 1, unitPrice: 9.5, total: null },
]);
const sum = receipt.reduce((s, i) => s + i.total, 0);
const okSum = Math.abs(sum - 36.5) < 0.005;
if (!okSum) failed++;
console.log(`${okSum ? "PASS" : "FAIL"}  receipt sums to printed 36.50 (got ${sum.toFixed(2)})`);


/** A plain assertion, for the checks that are not about the four money fields. */
function check(name: string, ok: boolean, got?: unknown): void {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && got !== undefined) console.log(`      got  ${JSON.stringify(got)}`);
}

// Square prints the quantity as a suffix on the name — "Pork Dumplings x 2
// $18.00" — and the scan hands it back with quantity 1 and the count still in
// the description. The money is already right; what is wrong is that two
// portions look like one and cannot be split between two people.
{
  const [dumplings] = normalizeLineItems([{ description: "Pork Dumplings x 2", quantity: 1, total: 18 }]);
  check("a trailing x 2 becomes a quantity",
    dumplings?.description === "Pork Dumplings" && dumplings?.quantity === 2, dumplings);
  check("and the line total is untouched by it",
    dumplings?.total === 18 && dumplings?.unitPrice === 9, dumplings);

  const [tight] = normalizeLineItems([{ description: "Tsingtao x2", quantity: 1, total: 14 }]);
  check("with or without a space", tight?.description === "Tsingtao" && tight?.quantity === 2, tight);

  const [times] = normalizeLineItems([{ description: "Tsingtao × 2", quantity: 1, total: 14 }]);
  check("a real multiplication sign works too", times?.description === "Tsingtao" && times?.quantity === 2, times);

  const [glued] = normalizeLineItems([{ description: "Tsingtao×2", quantity: 1, total: 14 }]);
  check("a × needs no space, since no word contains one",
    glued?.description === "Tsingtao" && glued?.quantity === 2, glued);
}

// THE NAME ALWAYS LOSES THE COUNT; THE QUANTITY IS ONLY FILLED IN.
// A count is never part of what was ordered, so it comes off the name either
// way. But a quantity the scan read from a real column beats one guessed from
// the end of a string, even where the two disagree.
{
  const [agree] = normalizeLineItems([{ description: "Pork Dumplings x 2", quantity: 2, total: 18 }]);
  check("a correctly read quantity still gets a clean name",
    agree?.description === "Pork Dumplings" && agree?.quantity === 2, agree);

  const [disagree] = normalizeLineItems([{ description: "Pork Dumplings x 2", quantity: 3, total: 27 }]);
  check("and wins when the two disagree",
    disagree?.description === "Pork Dumplings" && disagree?.quantity === 3, disagree);

  const [one] = normalizeLineItems([{ description: "Jasmine Tea x 1", quantity: 1, total: 11 }]);
  check("x 1 leaves the name clean and the quantity at 1",
    one?.description === "Jasmine Tea" && one?.quantity === 1, one);
}

// THE CASE THAT WAS BROKEN: an "x" that is simply the last letter of a word,
// with digits after it. Every one of these mangled the name and invented a
// quantity until the x was required to be a token of its own. The earlier guard
// here used "Xiao Long Bao", which has no trailing digits, so it never reached
// the comparison at all and passed against the broken version.
{
  for (const [name, total] of [["Lunch Box 2", 18], ["Bento Box 2", 22], ["Phoenix 5", 30], ["Chateau Margaux 2", 90], ["Bordeaux 201", 60]] as [string, number][]) {
    const [got] = normalizeLineItems([{ description: name, quantity: 1, total }]);
    check(`"${name}" keeps its name and its quantity of 1`,
      got?.description === name && got?.quantity === 1, got);
  }
}

// Other names that must survive untouched.
{
  const [word] = normalizeLineItems([{ description: "Beef Chow Fun", quantity: 1, total: 19 }]);
  check("an ordinary name is left alone", word?.description === "Beef Chow Fun" && word?.quantity === 1, word);

  const [size] = normalizeLineItems([{ description: "Pinot Noir 6x175ml", quantity: 1, total: 30 }]);
  check("a pack size mid-name is not a count",
    size?.description === "Pinot Noir 6x175ml" && size?.quantity === 1, size);

  const [bare] = normalizeLineItems([{ description: "x 2", quantity: 1, total: 8 }]);
  check("a line that is only a count keeps its name", bare?.description === "x 2" && bare?.quantity === 1, bare);

  const [year] = normalizeLineItems([{ description: "Bordeaux 2019", quantity: 1, total: 60 }]);
  check("a four-digit year is not a count", year?.description === "Bordeaux 2019" && year?.quantity === 1, year);
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
