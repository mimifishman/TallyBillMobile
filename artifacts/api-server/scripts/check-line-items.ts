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

// Dropped rows
const dropped = normalizeLineItems([
  { description: "", quantity: 1, unitPrice: 5, total: 5 },
  { description: "No price", quantity: 1, unitPrice: null, total: null },
  { description: "Zero", quantity: 1, unitPrice: 0, total: 0 },
]);
const okDrop = dropped.length === 0;
if (!okDrop) failed++;
console.log(`${okDrop ? "PASS" : "FAIL"}  rows with no description or no price are dropped`);

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

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
