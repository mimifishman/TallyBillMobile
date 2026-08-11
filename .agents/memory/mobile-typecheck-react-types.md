---
name: Mobile typecheck react types pin
description: Why mobile tsconfig maps 'react'/'react-dom' paths to the app's own @types, and how the TS2786 JSX-component error storm arises in this pnpm monorepo.
---

**Rule:** The mobile app's tsconfig must keep `paths` entries mapping `react` → `./node_modules/@types/react` (and `react-dom` likewise).

**Why:** In the pnpm virtual store, third-party RN libraries (react-native-svg, expo-linear-gradient, expo-blur, react-native-gesture-handler) do not get an `@types/react` link in their hashed `.pnpm/<hash>/node_modules` dirs (it's not their peer dep). Their `.d.ts` files then resolve `react` to the untyped react JS package, class components lose the `Component` base type, and tsc floods ~100 TS2786/TS2607 "'X' cannot be used as a JSX component" errors. Only one `@types/react` copy is actually installed — the errors look like a duplicate-types problem but are a missing-types-link problem.

**How to apply:** If TS2786/TS2607 errors reappear across many RN libs, check the `paths` mapping is still present before suspecting `@types/react` version skew; debug with `tsc --traceResolution` and look at what `react` resolves to from the library's `.d.ts`.
