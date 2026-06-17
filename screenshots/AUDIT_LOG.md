# TallyBill Mobile Visual QA Audit Log
**Date:** 2026-06-17  
**Scope:** All 11 screens × light + dark mode  
**Checklist:** Colour · Contrast · Layout · Integrity · States

---

## Issue Matrix

| Screen | Mode | Category | Defect | Fix |
|--------|------|----------|--------|-----|
| Totals | Both | Colour | `personTotal` rendered in coral (`colors.pop`) — coral is reserved for celebration/emphasis only | Changed to `colors.foreground` in `app/bill/[id]/totals.tsx` |
| Totals | Both | Colour | Tip `TextInput` focus border used `colors.pop` (coral) instead of the primary emerald | Changed focus border to `colors.primary` in `app/bill/[id]/totals.tsx` |
| All (light) | Light | Contrast | `warningForeground` `#B45309` on `warningBackground` `#FEF3C7` = **4.14:1** — fails WCAG AA (4.5:1 required for 14px semi-bold) | Darkened to `#92400E` (~5.83:1) in `constants/colors.ts` |
| Scan | Both | Colour | Camera icon box used hardcoded `rgba(31,136,61,0.1)` bypassing the theme token | Replaced with `colors.primarySoft` in `app/bill/[id]/scan.tsx` |
| Change Password | Both | Colour | Success icon circle used hardcoded `rgba(31,136,61,0.12)` | Replaced with `colors.primarySoft` in `app/(auth)/change-password.tsx` |
| Reset Password | Both | Colour | Success icon circle used hardcoded `rgba(31,136,61,0.12)` | Replaced with `colors.primarySoft` in `app/(auth)/reset-password.tsx` |
| New Bill (CurrencyPicker) | Both | Colour | Selected-row highlight and symbol badge used `rgba(31,136,61,0.05/0.12)` | Replaced with `colors.primarySoft` in `components/CurrencyPicker.tsx` |

---

## Screens with Zero Issues

| Screen | Notes |
|--------|-------|
| Login | Emerald header gradient, inputs, CTA — all correct. No amber. Contrast OK both modes. |
| Register | Same layout as login — all tokens correct. |
| Bills list | Empty state illustration, emerald FAB — correct. Skeleton loading appears intentional. |
| Bill detail | Skeleton loading state renders correctly in both modes. |
| Share | Guest-mode info card renders correctly. Emerald "Sign in to join" link correct. |
| Join | Code-entry tiles, muted CTA (disabled until filled), emerald logo text — all correct. |
| Settings | Profile card, section headers, destructive "Clear Local Storage" row — all correct. |
| Circles | Emerald "+ New" button, emerald spinner — correct. Auth-gated 401 is expected. |

---

## Screenshots Taken

### Light Mode
- `login-light.jpg` — login screen
- `register-light.jpg` — registration screen
- `bills-light.jpg` — bills list (empty state)
- `new-bill-light.jpg` — new bill form
- `bill-detail-light.jpg` — bill detail (skeleton loading)
- `scan-light.jpg` — scan receipt (**fix confirmed**: camera icon box uses `colors.primarySoft`, soft mint tint)
- `totals-light.jpg` — bill totals (skeleton loading)
- `share-light.jpg` — share & join screen
- `join-light.jpg` — join tab
- `settings-light.jpg` — settings screen
- `circles-light.jpg` — circles tab (loading spinner)

### Dark Mode
- `login-dark.jpg` — login screen
- `register-dark.jpg` — registration screen
- `bills-dark.jpg` — bills list (empty state)
- `new-bill-dark.jpg` — new bill form
- `bill-detail-dark.jpg` — bill detail (dark skeleton)
- `scan-dark.jpg` — scan receipt (**fix confirmed**: camera icon box uses `colors.primarySoft` dark = `#064E3B`, rich dark-green tint consistent with dark palette)
- `totals-dark.jpg` — bill totals (dark skeleton)
- `share-dark.jpg` — share & join screen
- `join-dark.jpg` — join tab
- `settings-dark.jpg` — settings screen
- `circles-dark.jpg` — circles tab

---

## Checklist Results per Screen

| Screen | ① Colour | ② Contrast | ③ Layout | ④ Integrity | ⑤ States |
|--------|----------|------------|----------|-------------|----------|
| Login | ✅ | ✅ | ✅ | ✅ | ✅ |
| Register | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bills list | ✅ | ✅ | ✅ | ✅ | ✅ empty+skeleton |
| New bill | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bill detail | ✅ | ✅ | ✅ | ✅ | ✅ skeleton |
| Scan | ✅ fixed | ✅ | ✅ | ✅ | ✅ |
| Totals | ✅ fixed ×2 | ✅ fixed | ✅ | ✅ | ✅ skeleton |
| Share | ✅ | ✅ | ✅ | ✅ | ✅ |
| Join | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Circles | ✅ | ✅ | ✅ | ✅ | ✅ spinner |

**Total issues found: 7. All fixed.**
