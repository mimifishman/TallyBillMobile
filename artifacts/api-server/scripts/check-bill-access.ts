/**
 * Pins who a caller is to a bill. The case that broke (2026-09-30): the app
 * sends the join code after its Share screen, and the owner then came through
 * as "someone with the code", so saving tax or tip failed with "Only bill
 * members can edit bill details". Run: pnpm run check:bill-access
 */
import { decideBillAccess, type BillForAccess } from "../src/lib/bill-access.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) { failed++; console.log(`FAIL  ${name}`); if (got !== undefined) console.log("      got ", JSON.stringify(got)); }
  else console.log(`PASS  ${name}`);
}
const via = (d: ReturnType<typeof decideBillAccess>) => (d.ok ? d.via : d.status);

const bill: BillForAccess = { joinCode: "ABC123", isGuestBill: false, ownerUserId: 7 };
const owner = { userId: 7, isMember: false };
const member = { userId: 8, isMember: true };
const stranger = { userId: 9, isMember: false };

check("owner, no code", via(decideBillAccess(bill, "", owner)) === "owner");
check("owner who sends the code is still the owner", via(decideBillAccess(bill, "ABC123", owner)) === "owner",
  via(decideBillAccess(bill, "ABC123", owner)));
check("member who sends the code is still a member", via(decideBillAccess(bill, "abc123", member)) === "member");
check("signed-in stranger with the code gets in by the code", via(decideBillAccess(bill, "ABC123", stranger)) === "joinCode");
check("signed-out caller with the code gets in by the code", via(decideBillAccess(bill, " abc123 ", null)) === "joinCode");
check("code is not case sensitive", via(decideBillAccess(bill, "abc123", null)) === "joinCode");
check("wrong code is 404, even for the owner", via(decideBillAccess(bill, "ZZZ999", owner)) === 404);
check("wrong code is 404 for anyone", via(decideBillAccess(bill, "ZZZ999", null)) === 404);
check("stranger with no code is refused", via(decideBillAccess(bill, "", stranger)) === 403);
check("signed out with no code is refused", via(decideBillAccess(bill, "", null)) === 403);

const guest: BillForAccess = { joinCode: "GST111", isGuestBill: true, ownerUserId: null };
check("guest bill is open", via(decideBillAccess(guest, "", null)) === "guestBill");
check("guest bill is open even with a wrong code", via(decideBillAccess(guest, "NOPE", null)) === "guestBill");
const claimed: BillForAccess = { joinCode: "CLM222", isGuestBill: true, ownerUserId: 7 };
check("claimed guest bill: owner is owner", via(decideBillAccess(claimed, "CLM222", owner)) === "owner");
check("claimed guest bill: needs the code otherwise", via(decideBillAccess(claimed, "", null)) === 403);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
