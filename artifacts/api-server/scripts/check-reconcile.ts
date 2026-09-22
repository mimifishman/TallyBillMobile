/**
 * Pins the printed-total check. Run: pnpm run check:reconcile
 *
 * The cases that matter are the ones where a scan is wrong but looks fine: a
 * dropped line item, a dropped discount, and a bill-level discount that the
 * items legitimately do not carry.
 */
import {
  checkAgainstPrintedTotal,
  normalizePrintedTotal,
  shouldApplyBillDiscount,
  type LineItem,
} from "../src/lib/receipt-line-items.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) { failed++; console.log(`FAIL  ${name}`); if (got !== undefined) console.log("      got ", JSON.stringify(got)); }
  else console.log(`PASS  ${name}`);
}
const item = (total: number): LineItem =>
  ({ description: "x", quantity: 1, unitPrice: total, total, originalTotal: null, discountLabel: null });

// Kirsh: three items, printed 177.00.
const kirsh = checkAgainstPrintedTotal([item(75), item(85), item(17)], 177);
check("a clean receipt reconciles", kirsh.reconciled === true && kirsh.difference === 0, kirsh);

// Back Yard with the top cropped off: one item lost. This is the exact failure
// the crop risks, and the whole reason this check exists.
const cropped = checkAgainstPrintedTotal([item(124), item(80), item(69), item(113), item(84), item(51)], 572);
check("a dropped line item is caught", cropped.reconciled === false && cropped.difference === -51, cropped);

// Holy with the happy hour missed: items come out too high.
const missedDiscount = checkAgainstPrintedTotal([item(15), item(15), item(57), item(74)], 128);
check("a dropped discount is caught", missedDiscount.reconciled === false && missedDiscount.difference === 33, missedDiscount);

// Back Yard proper: items 572.00, a 94.00 bill discount, receipt total 478.00.
// The discount is the one thing the receipt applies that the items do not.
const withBillDiscount = checkAgainstPrintedTotal(
  [item(124), item(80), item(69), item(113), item(84), item(51), item(51)], 478, 94);
check("a bill-level discount is allowed for", withBillDiscount.reconciled === true, withBillDiscount);

// Without allowing for it, the same bill would look broken.
const ignoringBillDiscount = checkAgainstPrintedTotal(
  [item(124), item(80), item(69), item(113), item(84), item(51), item(51)], 478);
check("ignoring a bill discount would have raised a false alarm", ignoringBillDiscount.reconciled === false);

// No printed total is unknown, not a pass.
const none = checkAgainstPrintedTotal([item(10)], null);
check("no printed total reports unknown, not success",
  none.reconciled === null && none.difference === null && none.itemsTotal === 10, none);

// Rounding: a receipt's own rounding of a percentage discount can drift a cent.
const rounding = checkAgainstPrintedTotal([item(43), item(55), item(15), item(15)], 128.01);
check("a one-cent drift still reconciles", rounding.reconciled === true, rounding);

// A real miss on a small bill must not hide inside the percentage tolerance.
const smallMiss = checkAgainstPrintedTotal([item(10)], 14);
check("a real gap on a small bill is caught", smallMiss.reconciled === false, smallMiss);

// A whole shekel adrift on a 208.00 bill must be caught. This is the DejaVoo
// receipt with one line's 30.00 read as the 29.00 from the discount sub-line
// beneath it; an earlier 1% tolerance came to 2.08 here and let it pass.
const oneShekelOut = checkAgainstPrintedTotal(
  [item(29), item(31), item(51), item(45), item(51)], 208);
check("a single shekel adrift on a 208.00 bill is caught",
  oneShekelOut.reconciled === false && oneShekelOut.difference === -1, oneShekelOut);

// The proportional part only exists so a very large bill is not flagged for a
// receipt's own rounding — it is not a licence to miss whole items.
const largeOk = checkAgainstPrintedTotal([item(1000)], 1000.5);
check("half a shekel on a 1000.00 bill still reconciles", largeOk.reconciled === true, largeOk);
const largeMiss = checkAgainstPrintedTotal([item(1000)], 1005);
check("five shekels on a 1000.00 bill is caught", largeMiss.reconciled === false, largeMiss);

check("a zero or negative printed total is treated as absent",
  normalizePrintedTotal(0) === null && normalizePrintedTotal(-5) === null && normalizePrintedTotal("177.00") === 177);

// --- Whether a footer discount is real, or the receipt restating one. ------
// DejaVoo prices every line twice and totals the saving at the foot: five lines
// summing to 208.00, "-110.00 Happy Hour" beneath them, and 208.00 due. Taking
// the 110.00 again gives 98.00 and undercharges the bill by the whole saving.
check("a footer discount already inside the item totals is not applied again",
  shouldApplyBillDiscount(208, 208, 110) === false);

// Back Yard is the opposite: its items are full price and the discount has not
// been applied to them, so it must be.
check("a footer discount the items do not carry is applied",
  shouldApplyBillDiscount(572, 478, 94) === true);

check("no printed total to check against means the discount is not applied",
  shouldApplyBillDiscount(208, null, 110) === false);
check("no discount, nothing to apply",
  shouldApplyBillDiscount(208, 208, null) === false && shouldApplyBillDiscount(208, 208, 0) === false);

// Neither reading lands on the printed total: the receipt has not said which is
// meant, so the discount is left off and the mismatch is shown to the user.
check("an unexplained gap does not get a discount applied to it",
  shouldApplyBillDiscount(300, 250, 94) === false);

// A cent of rounding must not flip the decision.
check("a rounding drift still counts as agreeing",
  shouldApplyBillDiscount(572, 478.01, 94) === true);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
