#!/usr/bin/env node
/**
 * Guard against a second React copy sneaking into the mobile bundle.
 *
 * Background: Expo Go hard-crashes at startup ("Incompatible React versions"
 * red screen) if the Metro bundle contains more than one react copy, or if
 * react != the renderer version compiled into react-native (RN 0.81 ->
 * 19.1.0). In this pnpm monorepo, workspace libs can peer-resolve
 * @tanstack/react-query against the WEB catalog react (19.1.9), dragging a
 * second react into the graph. The mobile metro.config.js compensates by
 * forcing singleton resolution of react/react-dom/@tanstack/react-query to
 * the app's own node_modules.
 *
 * Checks performed (in dependency order):
 *  1. The react/react-dom the app itself resolves (what Metro bundles after
 *     the singleton redirect) must EXACTLY equal react-native's bundled
 *     renderer version, and react-dom must match react.
 *  2. artifacts/mobile/metro.config.js must still contain the singleton
 *     resolver (resolveRequest override covering react, react-dom,
 *     @tanstack/react-query).
 *  3. The full pnpm dependency graph of @workspace/mobile is scanned for
 *     extra react/react-dom versions. Duplicates are FATAL when the Metro
 *     singleton resolver is missing or incomplete (they would be bundled);
 *     with the resolver intact they are reported as a warning only, since
 *     Metro redirects every `react` import to the app's own copy.
 *
 * On failure, fix via the "mobile" named catalog in pnpm-workspace.yaml and
 * the singleton resolver in artifacts/mobile/metro.config.js.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOBILE_DIR = path.join(ROOT, "artifacts", "mobile");
const SINGLETON_PACKAGES = ["react", "react-dom", "@tanstack/react-query"];
const HINT = `
How to fix:
  - Keep the mobile app's react/react-dom pinned via the "mobile" named
    catalog in pnpm-workspace.yaml (must EXACTLY equal the react-native
    renderer version; RN 0.81 -> 19.1.0). Never bump it to silence
    @clerk/* peer warnings.
  - Keep the singleton resolver for react/react-dom/@tanstack/react-query
    in artifacts/mobile/metro.config.js -- it prevents workspace libs from
    dragging the web-catalog react (19.1.9) into the Metro bundle.
  - Background: .agents/memory/react-version-pin.md
`;

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`FAIL: ${msg}`);
};
const ok = (msg) => console.log(`ok: ${msg}`);
const warn = (msg) => console.warn(`warn: ${msg}`);

// ---------------------------------------------------------------------------
// 1. The react the app itself resolves must match the RN renderer exactly.
// ---------------------------------------------------------------------------
function rendererVersion() {
  // The renderer's compiled version is embedded as a semver string literal in
  // react-native's renderer bundles; React compares it against the react
  // package version at runtime and throws on any mismatch.
  const implDir = path.join(
    MOBILE_DIR,
    "node_modules",
    "react-native",
    "Libraries",
    "Renderer",
    "implementations",
  );
  const found = new Set();
  for (const f of readdirSync(implDir).filter((f) => /^ReactNativeRenderer-.*\.js$/.test(f))) {
    const src = readFileSync(path.join(implDir, f), "utf8");
    for (const m of src.matchAll(/"(\d+\.\d+\.\d+(?:-[\w.]+)?)"/g)) found.add(m[1]);
  }
  if (found.size !== 1) {
    throw new Error(
      `expected exactly one semver literal in react-native's renderer bundles, found: ${[...found].join(", ") || "none"}`,
    );
  }
  return [...found][0];
}

let appReact;
try {
  const appRequire = createRequire(path.join(MOBILE_DIR, "package.json"));
  appReact = appRequire("react/package.json").version;
  const appReactDom = appRequire("react-dom/package.json").version;
  const renderer = rendererVersion();
  const rnVersion = appRequire("react-native/package.json").version;

  if (appReact === renderer) {
    ok(`app react ${appReact} exactly matches react-native ${rnVersion}'s bundled renderer`);
  } else {
    fail(
      `the mobile app resolves react ${appReact}, but react-native ${rnVersion}'s bundled renderer is ` +
        `${renderer}. React enforces an EXACT match at runtime -- Expo Go will red-screen at startup. ` +
        `Pin react in the "mobile" named catalog in pnpm-workspace.yaml to ${renderer}.`,
    );
  }
  if (appReactDom === appReact) {
    ok(`app react-dom ${appReactDom} matches react`);
  } else {
    fail(
      `the mobile app resolves react-dom ${appReactDom} but react ${appReact}. ` +
        `Pin both to the same version in the "mobile" named catalog in pnpm-workspace.yaml.`,
    );
  }
} catch (err) {
  fail(`could not resolve react/react-dom/react-native from artifacts/mobile: ${err.message}`);
}

// ---------------------------------------------------------------------------
// 2. The Metro singleton resolver must actually redirect singleton imports.
//
// Instead of grepping the config text (comments would pass), load the real
// metro.config.js and invoke its resolveRequest with a controlled context:
// an import of each singleton package originating from OUTSIDE the app dir
// (a workspace lib) must be re-resolved with originModulePath moved inside
// artifacts/mobile, so node_modules lookup starts at the app's own copy.
// ---------------------------------------------------------------------------
let resolverIntact = false;
try {
  const appRequire = createRequire(path.join(MOBILE_DIR, "package.json"));
  const metroConfig = appRequire(path.join(MOBILE_DIR, "metro.config.js"));
  const resolveRequest = metroConfig?.resolver?.resolveRequest;
  if (typeof resolveRequest !== "function") {
    throw new Error("config.resolver.resolveRequest is not a function");
  }

  const libOrigin = path.join(ROOT, "lib", "api-client-react", "src", "index.ts");
  const broken = [];
  for (const pkg of SINGLETON_PACKAGES) {
    let redirectedOrigin = null;
    const context = {
      originModulePath: libOrigin,
      resolveRequest: (ctx) => {
        redirectedOrigin = ctx.originModulePath;
        return { type: "sourceFile", filePath: "/dev/null" };
      },
    };
    try {
      resolveRequest(context, pkg, "ios");
    } catch {
      // A throw from the default resolver chain means our singleton branch
      // was NOT taken (the stub context.resolveRequest never throws).
    }
    const redirectedIntoApp =
      typeof redirectedOrigin === "string" &&
      redirectedOrigin !== libOrigin &&
      !path.relative(MOBILE_DIR, redirectedOrigin).startsWith("..");
    if (!redirectedIntoApp) broken.push(pkg);
  }

  if (broken.length === 0) {
    resolverIntact = true;
    ok(
      "metro.config.js resolver verified: imports of react, react-dom and @tanstack/react-query from a " +
        "workspace lib are redirected to resolve from artifacts/mobile",
    );
  } else {
    fail(
      `artifacts/mobile/metro.config.js does NOT redirect imports of ${broken.join(", ")} from workspace ` +
        `libs to the app's own node_modules. Without that singleton redirect, libs peer-resolved against ` +
        `the web-catalog react bundle a second copy and Expo Go crashes at startup. Restore the ` +
        `resolveRequest override in artifacts/mobile/metro.config.js.`,
    );
  }
} catch (err) {
  fail(
    `could not load/verify the singleton resolver in artifacts/mobile/metro.config.js: ${err.message}. ` +
      `The resolveRequest override there must redirect react/react-dom/@tanstack/react-query imports to ` +
      `the app's own node_modules.`,
  );
}

// ---------------------------------------------------------------------------
// 3. Scan the full pnpm graph for extra react / react-dom versions.
// ---------------------------------------------------------------------------
const TARGETS = ["react", "react-dom"];
const versions = { react: new Map(), "react-dom": new Map() }; // version -> sample path

function walk(node, trail) {
  if (!node || typeof node !== "object") return;
  for (const groupName of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const group = node[groupName];
    if (!group || typeof group !== "object") continue;
    for (const [name, dep] of Object.entries(group)) {
      if (!dep || typeof dep !== "object") continue;
      const nextTrail = [...trail, `${name}@${dep.version ?? "?"}`];
      if (TARGETS.includes(name) && dep.version && !versions[name].has(dep.version)) {
        versions[name].set(dep.version, nextTrail.join(" > "));
      }
      walk(dep, nextTrail);
    }
  }
}

try {
  const out = execFileSync(
    "pnpm",
    ["--filter", "@workspace/mobile", "list", ...TARGETS, "--depth", "Infinity", "--json"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  const listJson = JSON.parse(out);
  for (const project of Array.isArray(listJson) ? listJson : [listJson]) {
    walk(project, [project.name ?? "@workspace/mobile"]);
  }

  for (const name of TARGETS) {
    const found = versions[name];
    if (found.size === 0) {
      fail(`no ${name} found in the @workspace/mobile dependency graph -- cannot verify the singleton constraint.`);
      continue;
    }
    const extras = [...found.entries()].filter(([v]) => v !== appReact);
    if (extras.length === 0) {
      ok(`exactly one ${name} version in the mobile dependency graph: ${[...found.keys()][0]}`);
    } else {
      const detail = extras.map(([v, via]) => `    ${name}@${v} via ${via}`).join("\n");
      if (resolverIntact) {
        // Metro redirects every `react`/`react-dom` import to the app's own
        // copy, so graph-level duplicates never reach the bundle. Surface
        // them anyway -- they are the exact hazard that crashes the app the
        // moment the resolver is weakened.
        warn(
          `${extras.length} extra ${name} version(s) exist in the pnpm graph (neutralized by the Metro ` +
            `singleton resolver, so not bundled):\n${detail}`,
        );
      } else {
        fail(
          `${extras.length} extra ${name} version(s) resolve in the mobile dependency graph and the Metro ` +
            `singleton resolver is not intact -- a second copy will be bundled and crash Expo Go:\n${detail}`,
        );
      }
    }
  }
} catch (err) {
  fail(`could not inspect the mobile dependency graph via pnpm list: ${err.message}`);
}

if (failed) {
  console.error(HINT);
  process.exit(1);
}
console.log("\nAll mobile React singleton checks passed.");
