/**
 * Which commit this server was built from.
 *
 * The api-server runs from a built `dist/`, so pulling new code on Replit
 * changes nothing until the server is rebuilt and restarted — and nothing said
 * whether that had happened. More than once a change was "tested" against the
 * old build and reported as not working, or as working, when it had never run.
 *
 * build.mjs writes the commit in at build time, and every /api response carries
 * it in an X-Build-Commit header. Checking what dev is running is then one
 * request, compared against the commit on main:
 *
 *   curl -sI <dev>/api/healthz | grep -i x-build-commit
 *
 * "-dirty" means the build had uncommitted changes in it, so the commit alone
 * does not describe what is running. "unbuilt" means this code was not built by
 * build.mjs at all — a script run straight from source, for instance.
 */
declare const __BUILD_COMMIT__: string | undefined;

export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === "string" && __BUILD_COMMIT__ ? __BUILD_COMMIT__ : "unbuilt";
