/**
 * Clerk key shape validation helpers.
 *
 * Clerk issues two distinct key types:
 *   - Secret keys:      sk_live_... / sk_test_...
 *   - Publishable keys: pk_live_... / pk_test_...
 *
 * A common mistake is pasting the publishable key into the secret-key
 * environment variable (or vice-versa), or letting development-instance
 * (test) keys reach production. These helpers detect both at startup so
 * the error is immediately visible in logs rather than producing
 * confusing downstream failures like `host_invalid` from Clerk.
 */

/**
 * Validates that `key` is a Clerk secret key (starts with "sk_").
 * Logs a loud, actionable error if the shape is wrong and returns false.
 *
 * @param key       - The resolved key value (may be undefined/empty).
 * @param envVarName - The env var name to surface in the error message.
 */
export function validateClerkSecretKey(
  key: string | undefined,
  envVarName: string,
): boolean {
  if (!key) {
    // No key configured — let callers decide whether that is an error.
    return false;
  }
  if (!key.startsWith("sk_")) {
    const likelyMistake = key.startsWith("pk_")
      ? " — a PUBLISHABLE key was pasted into the secret-key slot"
      : "";
    console.error(
      `\n` +
        `╔══════════════════════════════════════════════════════════════════╗\n` +
        `║  CLERK CONFIGURATION ERROR                                       ║\n` +
        `╠══════════════════════════════════════════════════════════════════╣\n` +
        `║  ${envVarName} must start with "sk_"${likelyMistake}.\n`.padEnd(68) +
        `║\n` +
        `║  To fix: open your Clerk dashboard → API Keys → Secret keys      ║\n` +
        `║  and copy the sk_live_... value into this environment variable.   ║\n` +
        `╚══════════════════════════════════════════════════════════════════╝\n`,
    );
    return false;
  }
  return true;
}

/**
 * Asserts that both Clerk keys have the correct shape when running in
 * production. Exits the process with code 1 if either key is missing or has
 * the wrong prefix, so a misconfigured deploy fails fast rather than serving
 * a broken auth experience.
 *
 * Safe to call in development — it is a no-op outside of production.
 *
 * @param secretKey          - The resolved secret key value.
 * @param secretKeyEnvVar    - The env var name for the secret key.
 * @param publishableKey     - The resolved publishable key value.
 * @param publishableKeyEnvVar - The env var name for the publishable key.
 */
export function assertClerkKeysForProduction(
  secretKey: string | undefined,
  secretKeyEnvVar: string,
  publishableKey: string | undefined,
  publishableKeyEnvVar: string,
): void {
  if (process.env.NODE_ENV !== "production") return;

  let valid = true;

  if (!validateClerkSecretKey(secretKey, secretKeyEnvVar)) {
    valid = false;
  }
  if (!validateClerkPublishableKey(publishableKey, publishableKeyEnvVar)) {
    valid = false;
  }

  // Production must use production-instance (live) keys. Development-instance
  // keys reaching production usually means the deployment secrets are still
  // synced to the workspace (development) values.
  const testKeySlots = [
    [secretKey, secretKeyEnvVar, "sk_test_"],
    [publishableKey, publishableKeyEnvVar, "pk_test_"],
  ] as const;
  for (const [key, envVarName, testPrefix] of testKeySlots) {
    if (key?.startsWith(testPrefix)) {
      console.error(
        `\n` +
          `╔══════════════════════════════════════════════════════════════════╗\n` +
          `║  CLERK CONFIGURATION ERROR                                       ║\n` +
          `╠══════════════════════════════════════════════════════════════════╣\n` +
          `║  ${envVarName} is a DEVELOPMENT-instance key (${testPrefix}...)\n`.padEnd(
            68,
          ) +
          `║  but this server is running in production.                       ║\n` +
          `║\n` +
          `║  To fix: in the deployment's secrets settings, unsync this       ║\n` +
          `║  secret from the workspace value and set the live key            ║\n` +
          `║  (sk_live_... / pk_live_...) from your Clerk dashboard.          ║\n` +
          `╚══════════════════════════════════════════════════════════════════╝\n`,
      );
      valid = false;
    }
  }

  if (!valid) {
    console.error(
      `\n` +
        `╔══════════════════════════════════════════════════════════════════╗\n` +
        `║  SERVER STARTUP ABORTED                                          ║\n` +
        `╠══════════════════════════════════════════════════════════════════╣\n` +
        `║  Clerk key misconfiguration detected in production.              ║\n` +
        `║  Fix the errors above and redeploy.                              ║\n` +
        `╚══════════════════════════════════════════════════════════════════╝\n`,
    );
    process.exit(1);
  }
}

/**
 * Validates that `key` is a Clerk publishable key (starts with "pk_").
 * Logs a loud, actionable error if the shape is wrong and returns false.
 *
 * @param key       - The resolved key value (may be undefined/empty).
 * @param envVarName - The env var name to surface in the error message.
 */
export function validateClerkPublishableKey(
  key: string | undefined,
  envVarName: string,
): boolean {
  if (!key) {
    return false;
  }
  if (!key.startsWith("pk_")) {
    const likelyMistake = key.startsWith("sk_")
      ? " — a SECRET key was pasted into the publishable-key slot"
      : "";
    console.error(
      `\n` +
        `╔══════════════════════════════════════════════════════════════════╗\n` +
        `║  CLERK CONFIGURATION ERROR                                       ║\n` +
        `╠══════════════════════════════════════════════════════════════════╣\n` +
        `║  ${envVarName} must start with "pk_"${likelyMistake}.\n`.padEnd(68) +
        `║\n` +
        `║  To fix: open your Clerk dashboard → API Keys and copy the       ║\n` +
        `║  pk_live_... value into this environment variable.                ║\n` +
        `╚══════════════════════════════════════════════════════════════════╝\n`,
    );
    return false;
  }
  return true;
}
