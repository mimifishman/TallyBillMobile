/**
 * Who a request is to a bill, decided from what the caller showed.
 *
 * The app sends a bill's join code with every call about that bill once it
 * knows it, and it learns it on the Share screen too — so the OWNER sends it
 * after sharing. Until 2026-09-30 a matching code was checked first and ended
 * the question: the owner came through as "someone with the code". Editing
 * tax or tip then failed with "Only bill members can edit bill details",
 * deleting the bill was refused, and the bill no longer said it was theirs.
 *
 * So the signed-in account is looked at first, and the code only counts for
 * someone the account does not already make the owner or a member. A code
 * that does not match is still refused, whoever sends it.
 */
export type BillAccessVia = "owner" | "member" | "joinCode" | "guestBill";

export interface BillForAccess {
  joinCode: string;
  isGuestBill: boolean;
  ownerUserId: number | null;
}

/** The signed-in caller: their user id, and whether they are on the bill. */
export interface CallerForAccess {
  userId: number;
  isMember: boolean;
}

export type AccessDecision =
  | { ok: true; via: BillAccessVia }
  | { ok: false; status: 403 | 404 };

export function decideBillAccess(
  bill: BillForAccess,
  code: string,
  caller: CallerForAccess | null,
): AccessDecision {
  if (bill.isGuestBill && !bill.ownerUserId) return { ok: true, via: "guestBill" };

  const shown = code.trim().toUpperCase();
  // A wrong code says nothing about whether the bill exists.
  if (shown && shown !== bill.joinCode.toUpperCase()) return { ok: false, status: 404 };

  if (caller && bill.ownerUserId === caller.userId) return { ok: true, via: "owner" };
  if (caller?.isMember) return { ok: true, via: "member" };
  if (shown) return { ok: true, via: "joinCode" };
  return { ok: false, status: 403 };
}
