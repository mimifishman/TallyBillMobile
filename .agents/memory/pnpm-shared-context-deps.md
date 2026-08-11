---
name: Sharing React contexts with expo-router's transitive deps in pnpm
description: How to add a direct dep (e.g. @react-navigation/bottom-tabs) that must resolve to the SAME instance expo-router uses, or its React context reads undefined.
---

# Sharing React contexts with expo-router's transitive deps

Rule: when mobile code needs a React context provided by one of expo-router's transitive dependencies (e.g. `BottomTabBarHeightContext` from `@react-navigation/bottom-tabs`), add the package as a direct dep **pinned to the exact version expo-router already resolves** (check `node_modules/.pnpm`), then verify both resolve to the same path:

```
node -e "console.log(require.resolve('<pkg>/package.json',{paths:['artifacts/mobile']}) === require.resolve('<pkg>/package.json',{paths:[require.resolve('expo-router/package.json',{paths:['artifacts/mobile']})]}))"
```

**Why:** pnpm isolates per-version+peer-hash instances. A range like `^7.4.0` can resolve to a newer version than expo-router's, giving a second module instance whose context object differs from the one the navigator provides — `useContext` then silently returns `undefined` and any fallback path masks the bug.

**How to apply:** any time a hook/context from `@react-navigation/*` (or another expo-router transitive dep) is imported directly in the mobile app. Also note: `useBottomTabBarHeight` throws outside a bottom-tab navigator (e.g. iOS liquid-glass NativeTabs layout) — read `BottomTabBarHeightContext` via `useContext` with a fallback instead; the app has `hooks/useTabContentBottomPadding` for tab-screen bottom padding.
