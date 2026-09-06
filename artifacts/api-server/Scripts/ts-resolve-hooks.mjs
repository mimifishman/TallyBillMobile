/**
 * Resolve hook so scripts can import from `src/` directly.
 *
 * `src/` uses extensionless imports (`./receipt-image`), which the bundler
 * resolves at build time but node's ESM loader does not. Bundling the scripts
 * with esbuild instead is not an option here: the repo deliberately drops every
 * non-Linux esbuild binary (see `overrides` in pnpm-workspace.yaml), so that
 * path cannot run on a developer's Windows or macOS machine.
 *
 * This hook is plain JS with no native dependency, so it works everywhere.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/i;

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && !HAS_EXTENSION.test(specifier) && context.parentURL) {
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        if (existsSync(fileURLToPath(new URL(candidate, context.parentURL)))) {
          return nextResolve(candidate, context);
        }
      } catch {
        // Not a resolvable file URL — fall through to the default resolver.
      }
    }
  }
  return nextResolve(specifier, context);
}
