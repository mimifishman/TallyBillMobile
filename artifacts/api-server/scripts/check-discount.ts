/**
 * Pins the discount arithmetic, including the two things that are easy to get
 * silently wrong: a rate must always measure against the undiscounted price so
 * it cannot compound, and a split amount must add back to exactly what was
 * entered. Run: pnpm run check:discount
 */
import {
  applyPercent, applyAmount, apportion, baseTotalOf, parsePercent, totalDiscount,
  inferDiscountSelection,
  type DiscountableLine,
} from "../../mobile/utils/discount.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) { failed++; console.log(`FAIL  ${name}`); if (got !== undefined) console.log("      got ", JSON.stringify(got)); }
  else console.log(`PASS  ${name}`);
}

const line = (id: number, total: number, originalTotal: number | null = null): DiscountableLine => ({ id, total, originalTotal });

// --- Back Yard 51: the real receipt this was designed against. -------------
// 20% off five of seven items comes to exactly the printed 94.00 discount.
const backyard = [
  line(1, 124), line(2, 80), line(3, 69), line(4, 113), line(5, 84),
  line(6, 51), line(7, 51),
];
const discounted = backyard.slice(0, 5).map((l) => applyPercent(l, 20));
const untouched = backyard.slice(5);
const off = totalDiscount(discounted);
check("Back Yard: 20% off five items comes to the printed 94.00", off === 94, off);
check("Back Yard: each discounted line is 20% off its printed price",
  discounted.map((d) => d.total).join(",") === "99.2,64,55.2,90.4,67.2",
  discounted.map((d) => d.total));
// Summed the way the totals route sums: rounded at the end, because adding many
// two-decimal floats drifts (477.99999999999994) long before anyone sees it.
const newBillTotal = Math.round(
  (discounted.reduce((s, d) => s + d.total, 0) + untouched.reduce((s, l) => s + l.total, 0)) * 100,
) / 100;
check("Back Yard: bill lands on the printed 478.00", newBillTotal === 478, newBillTotal);

// --- A rate must not compound when it is changed. --------------------------
const once = applyPercent(line(1, 100), 20);
const again = applyPercent({ id: 1, total: once.total, originalTotal: once.originalTotal }, 25);
check("changing 20% to 25% measures against the full price, not the discounted one",
  again.total === 75 && again.originalTotal === 100, again);

// --- A rate of zero puts the line back. ------------------------------------
const cleared = applyPercent({ id: 1, total: 80, originalTotal: 100 }, 0);
check("a rate of 0 restores the full price and clears the discount",
  cleared.total === 100 && cleared.originalTotal === null && cleared.discountAmount === 0, cleared);

check("the base of a discounted line is its original price", baseTotalOf(line(1, 80, 100)) === 100);

// --- Splitting an amount must add back exactly. ----------------------------
const three = [line(1, 10), line(2, 10), line(3, 10)];
const shares = apportion(10, three);
const sum = [...shares.values()].reduce((a, b) => a + b, 0);
check("10.00 split three ways adds back to 10.00, not 9.99", Math.abs(sum - 10) < 1e-9, [...shares.values()]);
check("the leftover penny lands on exactly one line",
  [...shares.values()].filter((v) => v === 3.34).length === 1, [...shares.values()]);

// A lopsided split, where proportional shares are nowhere near round.
const lopsided = [line(1, 0.03), line(2, 99.94), line(3, 0.03)];
const lop = [...apportion(7.77, lopsided).values()];
check("a lopsided split still adds back exactly", Math.abs(lop.reduce((a, b) => a + b, 0) - 7.77) < 1e-9, lop);

// The awkward case from the design note: 94.00 over the five Back Yard items.
const spread = applyAmount(94, backyard.slice(0, 5), "Happy Hour");
const spreadSum = totalDiscount(spread);
check("94.00 spread across the five items adds back to 94.00", spreadSum === 94, spreadSum);
check("spreading by price matches 20% on every line",
  spread.every((s, i) => s.total === discounted[i]!.total), spread.map((s) => s.total));

// --- The review screen's job: a receipt-level discount spread over the items.
// Back Yard prints 572.00 of items, a -94.00 guest discount, and 478.00 to pay.
const reviewLines = [
  line(1, 124), line(2, 80), line(3, 69), line(4, 113),
  line(5, 84), line(6, 51), line(7, 51),
];
const spreadAcross = applyAmount(94, reviewLines, "Discount on the receipt");
const spreadOff = totalDiscount(spreadAcross);
check("Back Yard: a 94.00 receipt discount spreads to exactly 94.00", spreadOff === 94, spreadOff);
const paid = Math.round(spreadAcross.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
check("Back Yard: the lines then come to the printed 478.00", paid === 478, paid);
check("Back Yard: every line keeps its full price for display",
  spreadAcross.every((l, i) => l.originalTotal === reviewLines[i]!.total), spreadAcross.map((l) => l.originalTotal));
check("Back Yard: the receipt's own wording is carried",
  spreadAcross.every((l) => l.discountLabel === "Discount on the receipt"));

// A discount bigger than the bill must not push any line negative, and must not
// take more off than there was to take.
const overshoot = applyAmount(500, [line(1, 10), line(2, 20)]);
check("a discount larger than the bill leaves no negative line",
  overshoot.every((l) => l.total >= 0), overshoot.map((l) => l.total));
check("a discount larger than the bill takes off at most the bill",
  totalDiscount(overshoot) === 30, totalDiscount(overshoot));

// --- Percent parsing ------------------------------------------------------
check("a rate above 100 is capped", parsePercent("150") === 100);
check("rubbish reads as no discount", parsePercent("abc") === 0 && parsePercent("-5") === 0);

// --- Labels ---------------------------------------------------------------
check("an unlabelled discount describes itself", applyPercent(line(1, 100), 20).discountLabel === "20% off");
check("a receipt's own wording wins", applyPercent(line(1, 100), 25, "25% Happy Hour").discountLabel === "25% Happy Hour");

// --- Working out which items a printed discount came off. -----------------
const inferred = inferDiscountSelection(reviewLines, 94);
check("Back Yard: the 94.00 is recognised as 20% off five of the seven lines",
  inferred !== null && inferred.percent === 20 && inferred.lineIds.join(",") === "1,2,3,4,5", inferred);

// Two answers means the receipt does not say which is right, so say nothing.
const ambiguous = inferDiscountSelection([line(1, 100), line(2, 100)], 20);
check("an amount that fits more than one set of items is not guessed at", ambiguous === null, ambiguous);

// An amount that is not a round percentage of anything is not guessed at.
const odd = inferDiscountSelection(reviewLines, 37.13);
check("an amount matching no round rate is not guessed at", odd === null, odd);

// A whole-bill discount resolves to every line, where nothing else fits.
// Chosen carefully: 20.00 off lines of 50 and 150 is BOTH 10% of everything and
// 40% of the first line, so that pair is ambiguous and correctly refused.
const wholeBill = inferDiscountSelection([line(1, 30), line(2, 70)], 10);
check("10% off everything resolves to every line",
  wholeBill !== null && wholeBill.percent === 10 && wholeBill.lineIds.join(",") === "1,2", wholeBill);

const twoWays = inferDiscountSelection([line(1, 50), line(2, 150)], 20);
check("20.00 off 50 and 150 is refused — it is 10% of both or 40% of one", twoWays === null, twoWays);

check("no discount, no guess", inferDiscountSelection(reviewLines, 0) === null);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
