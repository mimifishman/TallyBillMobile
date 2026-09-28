---
name: Static Vite build environment
description: Runtime-only Vite configuration requirements should not block static asset builds
---

When a React/Vite artifact is built for static hosting, PORT is not needed to compile assets. For a root-mounted artifact, `/` is also the correct base-path default. Do not require runtime server variables during `vite build`; keep the dev server's explicit env validation.

**Why:** The static production build loaded the same Vite config as the dev server and aborted before bundling when PORT was absent, even though no server runs in the static output.

**How to apply:** In this project's root-mounted web artifact, use build-only defaults for PORT and BASE_PATH, while keeping missing/invalid values as errors when launching the development server. Revisit the defaults if the artifact's mount path changes.