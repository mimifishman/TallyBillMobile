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

// A COUNT IN AN ITEM'S NAME IS LEFT ALONE. This pins a decision, not a feature.
//
// Square prints its quantity as a suffix — "Pork Dumplings x 2  $18.00" — and
// it is tempting to split that off so two portions can go to two people. It
// cannot be done safely: a menu name carries the same shape for a different
// reason, and nothing in the text tells them apart.
//
//   "Pork Dumplings x 2"   Square's quantity: two orders.
//   "Chicken Wings x 10"   the dish itself: one order, ten wings.
//
// Guessing wrong is SILENT — the line total stays correct, so no check fires —
// and it turns a 15.00 plate into ten claimable portions at 1.50. The quantity
// has to come from the receipt's own column, read by the scan.
{
  for (const name of [
    "Pork Dumplings x 2",
    "Chicken Wings x 10",
    "Oysters x6",
    "Gyoza x 5",
    "Coke Zero ×330",
    "Pizza 12 x 16",
    "Lunch Box 2",
    "Bordeaux 201",
  ]) {
    const [got] = normalizeLineItems([{ description: name, quantity: 1, total: 18 }]);
    check(`"${name}" keeps its name and its quantity of 1`,
      got?.description === name && got?.quantity === 1, got);
  }

  // A quantity the scan read from a real column is used, as it always was.
  const [column] = normalizeLineItems([{ description: "Pork Dumplings", quantity: 2, total: 18 }]);
  check("a quantity from the receipt's own column is kept",
    column?.quantity === 2 && column?.unitPrice === 9, column);
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
