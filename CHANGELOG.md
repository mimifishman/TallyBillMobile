# Changelog

What changed for people using the TallyBill iOS app, release by release.

Server changes reach every installed copy of the app the moment they are
deployed, not when a new build ships. They are listed under the release they
landed beside and marked **(server)** — a 1.0.1 user already has them.

The build number is assigned by EAS (`appVersionSource: remote` with
`autoIncrement`); only the version lives in `artifacts/mobile/app.json`.

---

## 1.1.0 — unreleased

### Discounts

Receipts carry discounts — happy hour, 1+1, a percentage off one dish — and
until now TallyBill dropped them, so a scanned bill always came out **too high**.
On two real receipts that was 33.00 and 36.00 too much.

- Discounts printed on a receipt are read instead of silently dropped. **(server)**

  **Not working yet (2026-09-23), and 1.1.0 is held until it is.** Two common
  US layouts are still missed, on production as well as dev: a minus line
  printed under the item at full price (`HAPPY HOUR 50%  -8.00`), and one
  discount for the whole check above the tax. Both overcharge. A `COMP` line
  and happy-hour prices printed with no discount line are read correctly.
  Fixtures: `en-ny-item-discount`, `en-ny-bottom-discount`, `fr-marche-happyhour`.
- The review screen offers the receipt's discount and lets you pick which items
  it comes off.
- A discount is entered as a percentage, with room to read it.
- One bill can hold several discounts; they are applied in rounds.
- Every discounted item says its rate — "20% off" — on the review screen and on
  the bill, whichever way the discount arrived.
- Editing a discounted item keeps the discount instead of throwing it away.
- A discount larger than the item is refused rather than quietly capped.
- A discount the receipt has already taken off is not applied a second time. **(server)**
- An item a discount takes down to nothing is kept on the bill. **(server)**

### Tax filled in from the receipt

- The tax printed on a receipt is now filled in for you on the review screen.
  The scan had been reading it all along and the app was dropping it. It is
  entered as an **amount**, because that is what the receipt prints; a rate
  already set on the bill still wins.

### Scanning accuracy — all **(server)**, on production since 2026-09-23

- **Multi-quantity lines are no longer multiplied twice.** A printed line
  `2  Beer  12.00` is a 12.00 charge; it was being read as 24.00. This was the
  single worst money bug, and it always overcharged.
- Receipt photos are turned the right way up before they are read. Phone photos
  carry a rotation tag the model ignores, so it was reading receipts sideways.
- The shop header is cropped off before reading, leaving the model more of the
  photo to spend on the items. Totals correct went from 9/15 to 18/18.
- The scan is checked against the receipt's own printed total, and a bill that
  is out by a shekel is caught.
- A discount is no longer misread as a price.
- Tax is no longer read as an item. On a US receipt every amount had shifted up
  a row, the tax landed on the last dish, and adding tax on top would have
  **charged it twice**. The printed-total check caught it and warned.
- The card-terminal slip printed under many receipts is ignored: its lower
  "cash price" is not a discount, and `TIP/CHNG` is change, not a gratuity.

### Fixes

- **Circles** can be pulled down to refresh, and refresh by themselves when you
  come back to the tab — so a member count is right straight after you edit a
  circle.
- Saving an edited item works the first time **Save** is tapped.
- The bill's summary card always adds up. Two places that rounded to the
  agora differently now agree.
- The scan screen asks for a photo of the **whole** receipt, top to bottom, so
  discounts and the printed total are in the picture.

---

## 1.0.1 — 2026-09-16 · build 9

- Google and Apple sign-in work on the first tap. The buttons were live before
  Clerk had loaded, so the first tap failed for every new user.
- New Google and Apple accounts are asked for a name, so they appear correctly
  on shared bills instead of as the start of their email address.
- Tax and tip are asked on the review screen, right after a scan, while the
  receipt is still in hand.
- Tax and tip can be typed as an **amount**, not only a percentage. Most
  receipts print the amount.
- Tax and tip are changed from the bill's summary card, where they are read,
  instead of from the bill details sheet. An unset one reads "Add tax".
- New Bill no longer asks for tax and tip before there is anything to apply
  them to.
- The bill's menu no longer disappears on a cold start.
- Failures say what actually went wrong instead of "something went wrong".
- A list that fails to load offers to try again instead of looking empty.
- Circle members are checked against a real TallyBill account when linked by
  email.

## 1.0.0 · build 8

First App Store release.
