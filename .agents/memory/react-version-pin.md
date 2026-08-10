---
name: React version pins (mobile exact vs web patch)
description: Mobile react must EXACTLY match RN's bundled renderer (19.1.0); web can float within 19.1.x for Clerk peers. Metro must dedupe react to one copy.
---

**The rule:** The mobile app's `react`/`react-dom` must EXACTLY match the version of `react-native-renderer` bundled inside its `react-native` version (RN 0.81 → react 19.1.0). React enforces an exact match at runtime — any other patch (e.g. 19.1.9) crashes Expo Go at startup with a red "Uncaught Error: Incompatible React versions" screen. This is a hard crash, NOT a cosmetic warning (an earlier version of this note wrongly called it cosmetic).

**Why:** @clerk/* peers declare `^18.0.0 || ~19.0.3 || ~19.1.4 || ...`, which tempts a bump to 19.1.4+. Those peer ranges are install-time warnings only (`strict-peer-dependencies=false`); the RN renderer match is a runtime requirement. Bumping react to silence Clerk peer warnings caused the crash once already.

**How it's set up:**
- Default catalog `react`/`react-dom` = 19.1.9 (web apps, Clerk-happy).
- Named catalog `mobile` in pnpm-workspace.yaml = 19.1.0 exactly; the mobile app uses `"react": "catalog:mobile"`.
- `peerDependencyRules.allowedVersions` in pnpm-workspace.yaml silences the @clerk/*→react 19.1.0 peer warnings. Never "fix" a Clerk peer warning by moving mobile react off the renderer version.

**Second trap — transitive duplicate react:** Pinning the app alone is not enough in this pnpm monorepo. Shared workspace libs (e.g. the api-client lib depending on @tanstack/react-query) get their react peers resolved against the WEB catalog react, dragging a second react@19.1.9 into the Metro bundle and re-triggering the same crash. The mobile metro.config.js therefore forces singleton resolution of `react`, `react-dom`, and `@tanstack/react-query` to the app's own node_modules. Keep that resolver when touching metro.config.js; after any react-affecting dep change, verify by grepping the served iOS bundle for `react@` — exactly one version must appear.

Also keep catalog `@types/react`/`@types/react-dom` on ~19.1.x — letting them float to 19.2 creates duplicate React type packages and TS2322 ref-type errors in artifacts whose deps pin 19.1 types.
