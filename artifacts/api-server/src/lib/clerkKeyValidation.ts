/**
 * Clerk key shape validation helpers.
 *
 * Clerk issues two distinct key types:
 *   - Secret keys:      sk_live_... / sk_test_...
 *   - Publishable keys: pk_live_... / pk_test_...
 *
 * A common mistake is pasting the publishable key into the secret-key
 * environment variable (or vice-versa). These helpers detect that at
 * startup so the error is immediately visible in logs rather than
 * producing confusing downstream failures like `host_invalid` from
 * the Frontend API proxy.
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
