/**
 * Randomised stress test for the money arithmetic.
 *
 *   pnpm run stress:discount            10000 cases
 *   pnpm run stress:discount -- 200000  more
 *
 * The hand-written checks cover the cases someone thought of. This covers the
 * ones nobody did: it generates bills at random and asserts the invariants that
 * must hold for EVERY bill, whatever the numbers. A failure prints the exact
 * bill that broke it, so it can be pasted straight into check-discount.ts.
 *
 * Deterministic: the seed is printed, and passing it back reproduces the run.
 */
import {
  applyPercent, applyAmount, apportion, baseTotalOf, parsePercent, totalDiscount,
  inferDiscountSelection, discountAt, type DiscountableLine,
} from "../../mobile/utils/discount.ts";
import {
  checkAgainstPrintedTotal, shouldApplyBillDiscount, normalizeLineItems,
} from "../src/lib/receipt-line-items.ts";

const seedArg = process.argv.find((a) => a.startsWith("--seed="));
const seed = seedArg ? Number(seedArg.split("=")[1]) : Math.floor(Math.random() * 2 ** 31);
const count = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 10000);

/** Small deterministic PRNG, so a failing run can be replayed exactly. */
let state = seed >>> 0;
function rnd(): number {
  state ^= state << 13; state >>>= 0;
  state ^= state >> 17;
  state ^= state << 5; state >>>= 0;
  return state / 2 ** 32;
}
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
/**
 * Prices skewed towards the awkward ones rather than the average ones: a single
 * agora, amounts that divide badly, and bills large enough that floating point
 * starts to show.
 *
 * Every value is valid money — exactly two decimals. An earlier version emitted
 * figures like 204.66666666666663 and "found" thousands of failures that were
 * all its own: a base with more decimals than money has cannot survive being
 * rounded to money, so the invariants could not hold for it. The column is
 * numeric(10,2) and every code path rounds, so no such value can reach this
 * code in life.
 */
const money = () => {
  const kind = rnd();
  if (kind < 0.12) return 0.01;
  if (kind < 0.24) return Math.round(rnd() * 300) / 100;
  if (kind < 0.34) return Math.round((rnd() * 900000 + 1000) * 100) / 100;
  // Divides badly by 3 and by 7, which is where apportionment has to work.
  if (kind < 0.44) return Math.round(rnd() * 100) + 0.01;
  return Math.round((rnd() * 400 + 0.01) * 100) / 100;
};

/** Guards the generator itself: a case built from invalid money proves nothing. */
const isMoney = (n: number) => Math.abs(Math.round(n * 100) / 100 - n) < 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;

let failures = 0;
function fail(name: string, detail: unknown) {
  failures++;
  if (failures <= 5) console.log(`FAIL  ${name}\n      ${JSON.stringify(detail)}`);
}

for (let i = 0; i < count; i++) {
  const n = 1 + Math.floor(rnd() * (rnd() < 0.1 ? 40 : 8));
  const lines: DiscountableLine[] = Array.from({ length: n }, (_, id) => ({
    id, total: money(), originalTotal: null,
  }));
  if (lines.some((l) => !isMoney(l.total))) { fail("generator produced invalid money", lines.map((l) => l.total)); continue; }
  const gross = round2(lines.reduce((s, l) => s + l.total, 0));

  // --- apportion: the parts must add back to what was asked for, exactly, and
  // no share may exceed the line it comes off.
  const wanted = round2(rnd() * gross * 1.5);
  const shares = [...apportion(wanted, lines).entries()];
  const paid = round2(shares.reduce((s, [, v]) => s + v, 0));
  const capped = Math.min(wanted, gross);
  if (Math.abs(paid - capped) > 0.005) fail("apportion does not add back", { wanted, gross, paid, capped });
  for (const [id, share] of shares) {
    if (share < 0) fail("apportion produced a negative share", { id, share });
    const base = baseTotalOf(lines[id]!);
    if (share - base > 0.005) fail("apportion took more than the line costs", { id, share, base });
  }

  // --- applyAmount: no line may go negative, and the bill must drop by exactly
  // what was taken off.
  const applied = applyAmount(wanted, lines);
  const after = round2(applied.reduce((s, l) => s + l.total, 0));
  const off = totalDiscount(applied);
  if (applied.some((l) => l.total < -0.005)) fail("applyAmount produced a negative line", applied.map((l) => l.total));
  if (Math.abs(round2(gross - off) - after) > 0.005) fail("applyAmount: gross minus discount is not the new total", { gross, off, after });

  // --- applyPercent: never compounds, and 0 always restores the full price.
  const line = pick(lines);
  const p1 = Math.round(rnd() * 100);
  const p2 = Math.round(rnd() * 100);
  const once = applyPercent(line, p1);
  const twice = applyPercent({ id: line.id, total: once.total, originalTotal: once.originalTotal }, p2);
  const direct = applyPercent(line, p2);
  if (p2 > 0 && Math.abs(twice.total - direct.total) > 0.005) {
    fail("applyPercent compounded", { base: line.total, p1, p2, twice: twice.total, direct: direct.total });
  }
  const cleared = applyPercent({ id: line.id, total: once.total, originalTotal: once.originalTotal }, 0);
  if (Math.abs(cleared.total - baseTotalOf(line)) > 0.005 || cleared.originalTotal !== null) {
    fail("a rate of 0 did not restore the full price", { base: baseTotalOf(line), cleared });
  }
  if (once.discountAmount < -0.005 || once.total < -0.005) fail("applyPercent went negative", once);

  // --- parsePercent never escapes 0..100.
  const raw = pick([String(rnd() * 500), "abc", "", "-7", "1e3", "50.5", "١٢", String(-rnd() * 50)]);
  const parsed = parsePercent(raw);
  if (!(parsed >= 0 && parsed <= 100)) fail("parsePercent escaped 0..100", { raw, parsed });

  // --- shouldApplyBillDiscount must never produce a bill that disagrees with
  // its receipt more than leaving the discount off would.
  const printed = pick([gross, round2(gross * 0.8), round2(gross - money()), null]);
  const claimed = pick([round2(rnd() * gross), 0, null]);
  const apply = shouldApplyBillDiscount(gross, printed, claimed);
  if (apply && printed !== null && claimed !== null) {
    const gapWith = Math.abs(round2(gross - claimed) - printed);
    const gapWithout = Math.abs(gross - printed);
    if (gapWith > gapWithout + 0.005) {
      fail("applied a discount that made the bill agree LESS with the receipt", { gross, printed, claimed, gapWith, gapWithout });
    }
  }

  // --- the reconcile check must agree with plain arithmetic.
  const items = lines.map((l) => ({
    description: "x", quantity: 1, unitPrice: l.total, total: l.total,
    originalTotal: null, discountLabel: null,
  }));
  const chk = checkAgainstPrintedTotal(items, printed, apply ? claimed : null);
  if (Math.abs(chk.itemsTotal - gross) > 0.005) fail("itemsTotal disagrees with the sum of the items", { gross, chk });
  if (printed === null && chk.reconciled !== null) fail("no printed total should report unknown", chk);

  // --- inferDiscountSelection must only ever claim a subset that really works.
  if (n <= 6 && n >= 1) {
    const amount = round2(rnd() * gross);
    const guess = inferDiscountSelection(lines, amount);
    if (guess) {
      const subtotal = round2(guess.lineIds.reduce((s, id) => s + baseTotalOf(lines[id]!), 0));
      // Asserted through the function the app actually applies, not a second
      // copy of the arithmetic — the whole point is that the two agree.
      const implied = discountAt(subtotal, guess.percent);
      if (Math.abs(implied - amount) > 0.005) {
        fail("inferred a selection whose percentage does not produce the amount", { amount, guess, subtotal, implied });
      }
    }
  }

  // --- normalizeLineItems must never invent money.
  const norm = normalizeLineItems([{
    description: "x", quantity: pick([1, 2, 3, null]) as number | null,
    unitPrice: pick([money(), null]) as number | null,
    total: pick([money(), null, 0]) as number | null,
    originalTotal: pick([money(), null]) as number | null,
  }]);
  for (const item of norm) {
    if (item.total < 0) fail("normalizeLineItems produced a negative total", item);
    if (item.originalTotal !== null && item.originalTotal <= item.total) {
      fail("kept an originalTotal that is not above the total", item);
    }
    if (item.quantity <= 0) fail("produced a non-positive quantity", item);
  }
}

console.log(`\nseed ${seed}, ${count} cases`);
console.log(failures === 0 ? "All invariants held." : `${failures} failure(s). Replay with --seed=${seed}`);
process.exit(failures === 0 ? 0 : 1);
