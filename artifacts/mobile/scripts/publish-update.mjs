#!/usr/bin/env node
// Publish an over-the-air (EAS Update) JavaScript update, safely.
//
//   node scripts/publish-update.mjs --channel production --message "Fix X" [--dry-run]
//
// Why this script instead of a bare `eas update`:
// 1. An update is bundled on THIS machine, not on EAS. The EXPO_PUBLIC_* values
//    in eas.json are applied only to EAS builds, and the gitignored .env lives
//    only on Replit. A bare `eas update` on the Mac would ship a bundle with no
//    server address and no Clerk key: every user's app would open on "This build
//    is misconfigured". So the values are taken from eas.json and checked in the
//    finished bundle before anything is uploaded.
// 2. runtimeVersion is the app version. An update reaches every installed build
//    of that version, so it must not depend on native code those builds lack.
//    It refuses when app.json or the dependencies changed since those builds.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(appDir, "dist-update");

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const channel = flag("--channel");
const message = flag("--message");
const dryRun = argv.includes("--dry-run");
// Only for checking the bundle before any update-capable build exists.
const skipBuildCheck = argv.includes("--skip-build-check");
if (skipBuildCheck && !dryRun) die("--skip-build-check is only allowed with --dry-run");
if (!["production", "preview"].includes(channel)) die("--channel must be production or preview");
if (!message) die('--message "what changed" is required (users never see it; it is the update\'s label on expo.dev)');

const appJson = JSON.parse(fs.readFileSync(path.join(appDir, "app.json"), "utf8")).expo;
const easJson = JSON.parse(fs.readFileSync(path.join(appDir, "eas.json"), "utf8"));
const version = appJson.version;
if (appJson.runtimeVersion?.policy !== "appVersion") die("this script assumes runtimeVersion.policy = appVersion in app.json");

// The same values the store builds get: build.base.env, then the profile's own env.
const profile = easJson.build[channel];
const env = { ...easJson.build.base?.env, ...profile?.env };
for (const name of ["EXPO_PUBLIC_DOMAIN", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]) {
  if (!env[name]) die(`eas.json build.${channel} has no ${name}`);
}

const repo = run("git", ["rev-parse", "--show-toplevel"]).trim();
if (run("git", ["status", "--porcelain", "--untracked-files=no"]).trim()) {
  die("the working tree has uncommitted changes; publish only committed code");
}
const head = run("git", ["rev-parse", "HEAD"]).trim();
console.log(`Update for TallyBill ${version} on channel "${channel}", from commit ${head.slice(0, 12)}`);

// --- 1. Which installed builds would receive it, and is it safe for them? ---
function easJsonOut(args) {
  const out = run("npx", ["-y", "eas-cli", ...args, "--json", "--non-interactive"], { stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.slice(out.indexOf("[")));
}
const builds = skipBuildCheck ? [] : easJsonOut([
  "build:list", "--channel", channel, "--app-version", version, "--status", "finished", "--limit", "50",
]).filter((b) => b.gitCommitHash);
if (skipBuildCheck) {
  console.log("! build check skipped (dry run)");
} else if (builds.length === 0) {
  die(`no finished "${channel}" build of ${version} has update support, so nobody would get this update. Make a store build first.`);
}

const nativeDeps = (commit) => {
  const pkg = JSON.parse(run("git", ["show", `${commit}:artifacts/mobile/package.json`]));
  return JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies }, Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort());
};
const headDeps = nativeDeps("HEAD");
for (const b of builds) {
  const c = b.gitCommitHash;
  try {
    run("git", ["cat-file", "-e", `${c}^{commit}`]);
  } catch {
    die(`build ${b.id} was made from ${c.slice(0, 12)}, which this checkout does not have. git fetch, then retry.`);
  }
  const appJsonChanged = run("git", ["diff", "--name-only", c, "HEAD", "--", "artifacts/mobile/app.json"], { cwd: repo }).trim();
  if (appJsonChanged || nativeDeps(c) !== headDeps) {
    die(
      `app.json or the app's dependencies changed since the ${b.platform} ${version} build (${c.slice(0, 12)}).\n` +
        `  That can be a native change the installed apps do not have. Raise the version and make a store build instead.\n` +
        `  Compare: git diff ${c.slice(0, 12)} HEAD -- artifacts/mobile/app.json artifacts/mobile/package.json`,
    );
  }
}
if (!skipBuildCheck) console.log(`✓ ${builds.length} installed build(s) of ${version} on "${channel}"; no native change since them`);

// --- 2. Bundle with the store builds' values ---
// --clear every time: Metro caches transformed files WITH the inlined env values,
// so a cached run can hide a missing value (seen 2026-10-07: a bundle made with
// no env still showed the live key, from the previous run's cache).
const bundleEnv = { ...process.env, ...env, NODE_ENV: "production" };
const CHECK = path.join(appDir, "dist-update-check");
function exportTo(dir, extra) {
  fs.rmSync(path.join(appDir, dir), { recursive: true, force: true });
  run("pnpm", ["exec", "expo", "export", "--clear", "--platform", "ios", "--platform", "android", "--output-dir", dir, ...extra], {
    env: bundleEnv,
    stdio: ["ignore", "ignore", "inherit"],
  });
}
const devEnvFile = path.join(appDir, ".env.development");
const devValues = fs.existsSync(devEnvFile)
  ? fs
      .readFileSync(devEnvFile, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*EXPO_PUBLIC_[A-Z_]+\s*=\s*(.+?)\s*$/)?.[1])
      .filter(Boolean)
  : [];
function bundleText(dir, platform) {
  const d = path.join(dir, "_expo", "static", "js", platform);
  const files = fs.existsSync(d) ? fs.readdirSync(d) : [];
  if (files.length === 0) die(`no ${platform} bundle in ${d}`);
  return files.map((f) => fs.readFileSync(path.join(d, f)).toString("latin1")).join("\n");
}

// --- 3. Prove the values are in before anyone can download it ---
// a) A plain-JS copy, made from the same code and values, where the compiled
//    check in app/_layout.tsx is readable. A missing value compiles to
//    `""==="".trim()` (seen in a bundle made without the values).
console.log("Checking a readable copy of the bundle…");
exportTo("dist-update-check", ["--no-bytecode"]);
for (const platform of ["ios", "android"]) {
  const js = bundleText(CHECK, platform);
  if (js.includes('""==="".trim()')) die(`${platform}: an EXPO_PUBLIC value is empty in the bundle`);
  for (const v of [env.EXPO_PUBLIC_DOMAIN, env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY]) {
    if (!js.includes(`"${v}"`)) die(`${platform}: "${v}" is not inlined in the bundle`);
  }
  // Generic strings such as "pk_test_" or "replit.dev" are no good here:
  // Clerk's own library contains both.
  for (const v of devValues) if (js.includes(v)) die(`${platform}: bundle contains the development value ${v}`);
}
fs.rmSync(CHECK, { recursive: true, force: true });

// b) The real (Hermes) bundle that gets uploaded.
console.log("Bundling iOS and Android…");
exportTo("dist-update", []);
for (const platform of ["ios", "android"]) {
  const hbc = bundleText(OUT, platform);
  if (!hbc.includes(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY)) die(`${platform}: the uploaded bundle lacks the Clerk key`);
  for (const v of devValues) if (hbc.includes(v)) die(`${platform}: the uploaded bundle contains ${v}`);
}
console.log(`✓ both bundles use ${env.EXPO_PUBLIC_DOMAIN} and the live Clerk key, and no development values`);

if (dryRun) {
  console.log(`\nDry run: nothing uploaded. The bundle is in ${path.relative(process.cwd(), OUT)}/`);
  process.exit(0);
}

// --- 4. Upload exactly the bundle that was checked ---
execFileSync(
  "npx",
  ["-y", "eas-cli", "update", "--channel", channel, "--message", message, "--skip-bundler", "--input-dir", "dist-update", "--non-interactive"],
  { cwd: appDir, stdio: "inherit" },
);
console.log(`\n✓ Published. Users of ${version} get it the next time they open the app twice (download, then apply).`);
console.log("  Undo: npx eas-cli update:rollback (or republish the previous update) — see expo.dev → Updates.");
