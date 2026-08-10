---
name: Previewing the receipt-scan Review step
description: How to visually verify the mobile Review Items UI without a camera or a real receipt scan.
---

The Review Items step only renders after a real OCR round-trip, so it cannot be
reached by navigating or by screenshotting alone (the image picker needs a
native file dialog).

**How to preview it:** temporarily change the `ScanProvider` initial state to
`status: "ready"` with a hand-written array of parsed items, then screenshot the
scan route directly. The bill route group has no auth guard, so any bill id
works — the bill query just 403s and currency-dependent UI falls back to no
symbol. Revert the seeded state afterwards.

**Why:** there is no fixture/mock layer for the scan flow, and the OCR call is
made inside the provider rather than behind an injectable client.

**How to apply:** any change to the review list, its summary, or the confirm
action. Force dark mode for the same pass by temporarily short-circuiting the
palette choice in the colors hook — `useColorScheme` on Expo web follows the OS
media query, which the screenshot tool cannot set.

Note the first screenshot after an Expo restart is often blank (bundle still
building); take a second one.
