---
name: Expo Metro applies tsconfig paths at runtime
description: tsconfig `paths` aliases in the mobile app are used by Metro for runtime module resolution, not just by tsc — directory aliases for react/react-dom break the bundle.
---

Expo's Metro (SDK 50+) resolves tsconfig `compilerOptions.paths` at runtime.
An alias like `"react": ["./node_modules/@types/react"]` (added so third-party
.d.ts files type-check) makes Metro bundle the types-only package and the app
500s with "package specifies a `main` module field that could not be resolved"
/ a JSON-MIME bundle error in the browser.

**Why it bites here specifically:** Expo skips tsconfig paths when the
*origin* module is inside node_modules, but our metro.config.js singleton
resolver re-origins `react` imports to the app's package.json — outside
node_modules — so the alias applies to almost every react import.

**The fix/rule:** point type-only aliases at the `.d.ts` FILE, e.g.
`"react": ["./node_modules/@types/react/index.d.ts"]`. Expo's tsconfig-paths
resolver explicitly skips alias targets ending in `.d.ts`, so tsc still uses
them but Metro ignores them.

**How to apply:** any time a `paths` entry is added to the mobile tsconfig for
type resolution, target a `.d.ts` file (or verify the alias is safe to resolve
at runtime). `tsc` passing says nothing about the bundle — load the app after
tsconfig/metro changes.
