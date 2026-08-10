import { Platform } from "react-native";

export type ClerkAPIErrorLike = {
  code?: string;
  message?: string;
  longMessage?: string;
  meta?: unknown;
};

/** Pulls the `errors` array off a Clerk API error, if present. */
export function getClerkErrors(err: unknown): ClerkAPIErrorLike[] {
  if (typeof err === "object" && err !== null) {
    const errs = (err as Record<string, unknown>)["errors"];
    if (Array.isArray(errs)) return errs as ClerkAPIErrorLike[];
  }
  return [];
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e["message"] === "string") return e["message"];
    const first = getClerkErrors(err)[0];
    if (first) return first.longMessage ?? first.message ?? "";
  }
  return "";
}

export function extractErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e["code"] === "string") return e["code"];
    const first = getClerkErrors(err)[0];
    if (first?.code) return first.code;
  }
  return "";
}

/**
 * Logs an OAuth/Clerk error with its full code, message, and error list so
 * failures are diagnosable from console output (not just "[object Object]").
 */
export function logOAuthError(context: string, err: unknown): void {
  let details: string;
  try {
    const e = err as { name?: string; message?: string; status?: number; stack?: string };
    details = JSON.stringify({
      name: e?.name,
      message: e?.message,
      code: extractErrorCode(err) || undefined,
      status: e?.status,
      errors: getClerkErrors(err),
      stack: typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 6) : undefined,
    });
  } catch {
    details = String(err);
  }
  console.warn(`[${context}]`, details);
}

/** True when the user closed/cancelled the OAuth browser themselves. */
export function isOAuthCancelled(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase();
  return msg.includes("cancel") || msg.includes("dismiss") || msg.includes("user closed");
}

/**
 * True when running on web inside an embedded iframe (e.g. the workspace
 * preview pane), where OAuth popups/redirects may not be able to run.
 */
export function isEmbeddedWebPreview(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws — we are definitely framed.
    return true;
  }
}

function looksLikeNetworkError(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase();
  const code = extractErrorCode(err).toLowerCase();
  return (
    code.includes("network") ||
    msg.includes("network") ||
    msg.includes("internet") ||
    msg.includes("failed to fetch") ||
    msg.includes("unable to connect") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  );
}

/**
 * Builds a user-facing message for an OAuth flow that finished in the
 * browser but produced no session — e.g. the account needs an extra
 * verification step, or account setup couldn't be completed.
 */
export function oauthIncompleteMessage(
  provider: "Google" | "Apple",
  action: "in" | "up",
  signInStatus?: string | null,
  signUpStatus?: string | null,
): string {
  if (signInStatus === "needs_second_factor" || signInStatus === "needs_client_trust") {
    return `Your ${provider} account needs an extra verification step that couldn't be completed here. Please sign in with your email and password instead.`;
  }
  if (signUpStatus === "missing_requirements") {
    return `Your ${provider} account was verified, but we couldn't finish setting up your TallyBill account. Please try again or sign ${action === "in" ? "in" : "up"} with email.`;
  }
  return `Could not sign ${action === "in" ? "in" : "up"} with ${provider}. Please try again.`;
}

/**
 * Builds an honest, user-facing message for a failed OAuth flow based on the
 * actual error, instead of blaming the internet connection for everything.
 */
export function oauthFailureMessage(provider: "Google" | "Apple", action: "in" | "up", err: unknown): string {
  if (isEmbeddedWebPreview()) {
    return `${provider} sign-${action} can't run inside this embedded preview. Open the app in a new browser tab or on your device and try again.`;
  }
  if (looksLikeNetworkError(err)) {
    return `Could not reach ${provider}. Check your internet connection and try again.`;
  }
  const clerkMessage = getClerkErrors(err)[0]?.longMessage;
  if (clerkMessage) return clerkMessage;
  return `Could not sign ${action === "in" ? "in" : "up"} with ${provider}. Please try again.`;
}
