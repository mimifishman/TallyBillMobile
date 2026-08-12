---
name: Clerk Expo SSO module loading
description: Why Google/Apple SSO can fail instantly in @clerk/expo and how error handling is structured
---

# Clerk Expo SSO

**Rule:** Keep `@clerk/expo` at >= 4.0.0. Versions below 3.4.0 loaded `expo-auth-session`/`expo-web-browser` inside `useSSO` via dynamic `import()`, which fails under Metro's async-chunk resolution in pnpm monorepos. Versions 3.5.x–3.7.x crash on **Android in Expo Go** at import time with "Cannot find native module 'ClerkExpo'" — their Android spec calls `requireNativeModule("ClerkExpo")` unguarded, and Expo Go doesn't ship Clerk's native module (iOS/web specs use the optional loader, so it's Android-only). Fixed in 4.0.0 (`requireOptionalNativeModule`, per changelog). 4.0.0 breaking changes: drops Expo SDK 53; native Google Sign-In moved to optional `@clerk/expo-google-signin` (only matters if using `useSignInWithGoogle`).

**Why:** In this monorepo, `startSSOFlow` failed instantly on native (no browser ever opened) because the dynamic import threw, was swallowed, and rethrown as a misleading "install expo-auth-session" error — which the UI then mislabeled as a network problem. Upstream: clerk/javascript issue #8288, fixed by PR #8720 (require-based loading) in 3.4.0.

**How to apply:** If OAuth fails *instantly* with no browser opening, suspect client-side module/SDK issues, not network or Clerk config. Check the logged `[OAuth sign-in error]` / `[OAuth sign-up error]` JSON (utils/clerkErrors.ts in the mobile app logs full code/message/errors). OAuth user-cancellation returns normally (no session) — it must stay silent. On web inside the embedded workspace preview iframe, messaging points users to open the app in a new tab.

Note: `useSSO` in @clerk/expo 3.x still uses Clerk's legacy sign-in resource internally while the app's screens use the new hooks API (`signIn.password`, `signIn.mfa`) — the mix is fine; both worked in verification.

**iOS store builds:** `@clerk/expo` v4 requires its config plugin (`"@clerk/expo"` in app.json `plugins`) and therefore iOS 17 as the minimum version. Without the plugin, pod install fails during publish. Expo Go/dev is unaffected (plugins only apply at prebuild).
