---
name: React version pin tension (Expo vs Clerk)
description: Why the workspace react/react-dom catalog is pinned to a 19.1.x patch above 19.1.0
---

The workspace catalog pins react/react-dom to a 19.1.x patch >= 19.1.4 (currently 19.1.9).

**Why:** @clerk/* (clerk-react 6.13+, shared 4.27+) peer-require `^18.0.0 || ~19.0.3 || ~19.1.4 || ...`, while Expo SDK 54 "expects" exactly 19.1.0 and prints a compatibility warning at Metro startup. react-native 0.81's real peer range is `^19.1.0`, so any 19.1.x patch works — the Expo warning is cosmetic and safe to ignore.

Also keep catalog `@types/react`/`@types/react-dom` on ~19.1.x — letting them float to 19.2 creates duplicate React type packages and TS2322 ref-type errors in artifacts whose deps pin 19.1 types.

**How to apply:** Keep react/react-dom inside 19.1.x (don't jump to 19.2 without checking react-native/Expo support), and pick a patch inside Clerk's supported range so pnpm install stays free of @clerk peer warnings. Do not "fix" the Expo startup warning by downgrading to 19.1.0 — that reintroduces the Clerk unmet-peer noise.
