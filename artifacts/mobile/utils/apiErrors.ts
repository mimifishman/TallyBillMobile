import { ApiError } from "@workspace/api-client-react";

/**
 * The reason a request failed, in words worth showing someone.
 *
 * The API reports failures as `{ "error": "..." }`, and those strings are
 * written for people — "title cannot be empty", "Only bill members can edit
 * bill details". Showing one tells the user what to change; swallowing it and
 * saying "something went wrong" leaves them tapping the same button again.
 *
 * Anything without such a string falls back to `fallback`. ApiError.message
 * is deliberately not used for that: it reads "HTTP 500 Internal Server
 * Error", which tells a user nothing they can act on.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | null;
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
    if (err.status === 403) return "You do not have permission to do that.";
    if (err.status === 404) return "That is no longer there. Try reloading.";
  }
  return fallback;
}
