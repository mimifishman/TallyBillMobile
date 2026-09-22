# Receipt scanning: what we learned

Written 2026-09-22, from about a week of measuring TallyBill's scan against six
real Hebrew receipts. Everything here is something that was *measured* or that
*broke in front of a user*, not something that sounded right.

---

## 1. The single biggest win was a correctness bug, not tuning

Every fixture photo carries **EXIF orientation 6** — "rotate this to display
it". The vision model does not honour that tag, so it was reading the receipts
**sideways**. Applying the rotation server-side took one receipt from 1 correct
run in 3 to 3 in 3, and fixed another that had *never* been right.

**`sips -g orientation` reports `nil` for these files.** That is what hid it for
days. Use `sharp(...).metadata().orientation`.

> Before reaching for a model or a prompt, check the bytes you are actually
> sending.

## 2. Cropping the header off beat every image-processing idea

The model scales whatever it is sent down to a fixed size, so **every pixel
spent on a shop name and VAT number is a pixel not spent on an item**. Dropping
the top 25%:

| | before | after |
|---|---|---|
| Totals correct | 9/15 | **18/18** |
| Item counts correct | 6/9 | **12/12** |

Nothing else came close. What was tried and **rejected, with evidence**:

- **Resizing to 1024px** — fixes a dim creased receipt, *breaks* a clean one. It
  adds a second lossy resample before the model's own downscale. Send full
  resolution and let the model's be the only one.
- **A contrast stretch** — changed nothing. These photos are well lit; the
  computed stretch was 1.1x–1.4x.
- **Cropping tight to the receipt's edges** — *worse* than doing nothing.
- **A detector for where the item table starts** (first row with ink at both
  margins, on the theory that headers are centred) — put the table between 42%
  and 89% down across six fixtures. 89% would have thrown away the whole
  receipt. A crude fraction that is right beats a clever rule that is not.

## 3. Test an image change without deploying

This is the trick that made four variants testable in an afternoon:

```bash
pnpm run prep:fixtures -- --out /tmp/variant
OCR_FIXTURES=/tmp/variant OCR_BASE=<a deployment> pnpm run eval:ocr -- --repeat 3
```

The preparation runs locally; the prepared photo goes to whichever `/api/ocr` is
already running. **The image is then the only thing that differs between runs.**

## 4. Measure what you claim, or you will not see the bug

The eval scored item counts and totals — and nothing else. So when a user
reported the app showing "Caesar Toast" for a line printed `סלט קיסר`, every
measurement had called that receipt a pass. 128.00 is 128.00 whether the item is
salad or toast.

It now also scores **run-to-run agreement on item names**, which needs no
ground truth and is the sharper signal: *a name that changes between two runs of
the same bytes was not read off the receipt, it was guessed.* Three runs of one
photo produced `פיצה מרגריטה`, `פיצה רומא` and `שיק פאי` — the last of which is
an item from a **different receipt**.

Item names remain unreliable on Hebrew thermal paper. Four image variants were
tried; none helped. The next lever is a different model, not more image work.

## 5. Undercharging is the failure that matters

A bill that is **too high** is visible to everyone paying it. One that is **too
low** is not — the person who put the card down quietly absorbs it.

Two real bugs, both undercharging, both found by a user rather than a test:

- **A discount applied twice.** A receipt prices each line twice (full price,
  charged price) and then totals the saving at the foot. Read literally that
  footer line looks like money still to come off. Taking it again made a 208.00
  bill come out at **98.00**.
- **A discount read as a price.** `TROPICAL BLUSH 1 ₪59 ₪30` with `HH 29`
  indented beneath. The 29 is the *saving*. It was returned as the item's total.

## 6. Let the receipt settle it, not the prompt

The prompt already warned about the double-discount. It did not prevent it.
**Prompts are a request; code is a rule.**

The receipt says what the answer is. A footer discount is now passed on **only
when taking it off is what agrees with the printed total, and leaving it on does
not**:

| receipt | items | printed | claimed discount | decision |
|---|---|---|---|---|
| DejaVoo | 208 | 208 | 110 | items already match → **ignore** |
| Back Yard | 572 | 478 | 94 | only matches *with* it → **apply** |

Same rule, opposite answers, both right — and it does not depend on the model
reading the footer correctly.

## 7. Read the receipt's own total, and keep the tolerance tight

Every receipt prints a total. Comparing it to what was read costs **one
subtraction and no second model call**, and it is what makes a crude crop safe:
the total sits at the *foot* of a receipt, so a crop at the top can never remove
the evidence that the crop went wrong.

An early 1% tolerance came to **₪2.08** on a 208.00 bill and silently swallowed
a whole shekel — the scan reported itself reconciled while disagreeing with the
paper in the user's hand. **Every fixture reconciles exactly**, because the
figures are read off the receipt rather than recomputed. A gap is evidence of a
misread, not of rounding. It is now a few agorot plus 0.1%.

## 8. Discounts: one rate per item

Not a list of discount rules. **Every item holds exactly one rate**, with a
default and per-item exceptions, applied in rounds (tick some items, set a rate,
apply; repeat).

If an item can only ever hold one rate, two discounts can never collide and
there is no order-of-application question to get wrong. That is where the big
systems come unstuck: [Shopify POS][shopify] allows one cart discount and no
stacking, and [Square users report][square] that ringing up two groups and
tapping two discount buttons does the wrong thing. [Toast][toast] arrives at the
same place from the other side, with an "applies to everything except" list.

**Store the money, not the rate.** A receipt rounds its own discounts its own
way: a "25% Happy Hour" prints as **-14.00** on a 57.00 salad where the
arithmetic says 14.25. A stored rate recomputes to a number the paper disagrees
with. The percentage is what someone *types*; the amount is what is *kept*, and
it is only recomputed when the rate or the price is actually edited.

**Put the discount on the line.** Then nothing downstream has to learn about it —
a share is still the line total divided by the people on it, and tax and tip
follow from that. This is also what Square and Toast do internally: both resolve
a check-level discount into per-line amounts anyway.

[shopify]: https://community.shopify.com/t/how-to-apply-different-discounts-to-different-items-at-checkout/121012
[square]: https://community.squareup.com/t5/Payments-Troubleshooting/Different-discounts-for-different-items/td-p/675283
[toast]: https://support.toasttab.com/en/article/Basic-Discount-Configuration

## 9. Bugs that only running the app will find

Every one of these passed the type checker and every unit check:

- **Save did nothing until tapped twice.** The bill screen's scroll view was the
  only one in the app without `keyboardShouldPersistTaps="handled"`, so while a
  keyboard was up the first tap anywhere was spent dismissing it.
- **The sheet reset itself mid-edit.** Its seeding effect listed `lines` as a
  dependency, and the parent rebuilds that array on every render — so typing
  re-ran the effect and wiped the discount just applied.
- **Editing an item silently removed its discount.** Both editors sent a new
  price without a discount, and the server rewrites the two together.
- **The summary card did not add up.** Subtotal was post-discount while the
  Discount row was shown as a further deduction: 269.92 − 79.98 + 45.88 = 235.82,
  beside a Total of 315.80. The Total was right; the card was unreadable.
- **A typo made an item free.** 150% was clamped to the full price rather than
  rejected, producing a 0.00 line labelled "100% off" — a figure nobody typed.

## 10. A test that lies is worse than no test

Two of our own tests were wrong in ways that hid bugs:

- One read `x === false || x` — **always true**. It proved nothing. Made real, it
  failed instantly: a discount larger than the bill was driving every line
  negative (−156.67 and −313.33).
- The randomised stress test's first run "found" **11,188 failures** that were
  all its own — it was generating prices like `204.66666666666663`. An invariant
  about money cannot hold for a value money cannot represent. It now asserts its
  own output is valid money before trusting a failure.

## 11. Derive what can be derived

A stored label goes stale, gets lost by a write that forgets it, and differs
between items depending on where it came from — a bill reading "20% off" on one
line and "Discount on the receipt" on the next looks like two different things
when it is one.

**The rate is derivable from the two prices.** Deriving it means it is always
right, always the same shape, and cannot be lost. The `discountLabel` column is
now written by four call sites and read by none; it should be removed.

## 12. Money arithmetic needs integer agorot

Two functions that had to agree disagreed by an agora, found only by the
randomised stress test:

- `base * (percent / 100)` and `base * percent` differ whenever the exact answer
  lands on a half — 427.75 at 30% is exactly 128.325 — because a percentage
  divided by 100 is rarely exact in binary.
- Summing a handful of two-decimal values as raw floats drifts in the last bits,
  and that drift is enough to flip a rounding.

Work in whole agorot, and round a subtotal to money before comparing it.

Apportioning one amount across lines uses the **largest remainder method**:
round every share down, then give the leftover agorot to the largest fractions.
Rounding each share on its own turns 10.00 into 9.99.

---

## Where it stands

**Reliable receipts: 2 of 6 → 6 of 6** on totals and item counts. Scans run
6–9 seconds against a 20-second budget.

**Still open:** item names on Hebrew receipts, and the dead `discountLabel`
column.

## How to run any of this

```bash
cd artifacts/api-server
pnpm run eval:ocr -- --repeat 3     # score the fixtures against a deployment
pnpm run prep:fixtures -- --out DIR # prepare photos locally, no deploy needed
pnpm run check:line-items           # parsing
pnpm run check:discount             # discount arithmetic
pnpm run check:reconcile            # the printed-total check
pnpm run stress:discount 200000     # randomised invariants, prints its seed
```

Fixtures are real receipts with real personal data. The photos stay gitignored;
only the hand-checked counts and totals are committed.
