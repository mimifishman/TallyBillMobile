/**
 * In-memory mapping of `billId` to its capability `joinCode` for the
 * current app session. Populated whenever the app resolves a bill via a
 * deep link or the share screen, and consumed by the API client's extra
 * header getter to attach an `X-Join-Code` header to per-bill requests.
 *
 * This lets a signed-out user who taps a share link view and edit the
 * bill in-app (no login wall) — every per-bill request automatically
 * carries the capability token for that bill.
 */

const codes = new Map<number, string>();

export function rememberBillCode(billId: number, joinCode: string): void {
  if (!billId || !joinCode) return;
  codes.set(billId, joinCode.toUpperCase());
}

export function getBillCode(billId: number): string | undefined {
  return codes.get(billId);
}

const BILL_PATH_RE = /\/api\/bills\/(\d+)(?:\/|$)/;

/**
 * Extract the `billId` from an absolute or relative API URL like
 * `/api/bills/42/lines`. Returns `null` when the path is not bill-scoped.
 */
export function billIdFromUrl(url: string): number | null {
  const match = BILL_PATH_RE.exec(url);
  if (!match) return null;
  const id = parseInt(match[1]!, 10);
  return Number.isFinite(id) ? id : null;
}
