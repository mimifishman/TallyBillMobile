import type { Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { billsTable, billUsersTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AuthRequest } from "./auth.js";
import { decideBillAccess, type BillAccessVia } from "../lib/bill-access.js";

const JOIN_CODE_HEADER = "x-join-code";

export interface BillAccessRequest extends AuthRequest {
  billAccess?: {
    billId: number;
    joinCode: string;
    via: BillAccessVia;
  };
}

/**
 * Authorize access to a bill identified by `:billId` in the route. Access is
 * granted when ANY of the following is true:
 *   - the bill is a guest bill (isGuestBill = true, ownerUserId IS NULL)
 *   - the request carries an `X-Join-Code` header matching the bill's joinCode
 *   - the request is authenticated and the user is the bill's owner or member
 *
 * A signed-in owner or member is recognised as such even when they also send
 * the code (the app sends it after its Share screen); see decideBillAccess.
 *
 * The route MUST include a `:billId` parameter.
 */
export function requireBillAccess(
  req: BillAccessRequest,
  res: Response,
  next: NextFunction,
): void {
  const billIdRaw = (req.params as Record<string, string | undefined>)["billId"];
  const billId = billIdRaw ? parseInt(billIdRaw, 10) : NaN;
  if (!billId || Number.isNaN(billId)) {
    res.status(400).json({ error: "Invalid billId" });
    return;
  }

  void (async () => {
    try {
      const [bill] = await db
        .select()
        .from(billsTable)
        .where(eq(billsTable.id, billId))
        .limit(1);
      if (!bill) {
        res.status(404).json({ error: "Bill not found" });
        return;
      }

      const code =
        String(req.headers[JOIN_CODE_HEADER] ?? "").trim() ||
        String((req.query as Record<string, string | undefined>)["joinCode"] ?? "").trim();

      // Who the caller is, when they are signed in, whether or not they also
      // sent the code: see decideBillAccess.
      let caller: { userId: number; isMember: boolean } | null = null;
      if (!(bill.isGuestBill && !bill.ownerUserId)) {
        const auth = getAuth(req);
        if (auth.userId) {
          const [user] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.clerkId, auth.userId))
            .limit(1);
          if (user) {
            req.user = {
              userId: user.id,
              email: user.email,
              firstName: user.firstName ?? null,
              lastName: user.lastName ?? null,
            };
            let isMember = false;
            if (bill.ownerUserId !== user.id) {
              const [member] = await db
                .select()
                .from(billUsersTable)
                .where(
                  and(
                    eq(billUsersTable.billId, billId),
                    eq(billUsersTable.userId, user.id),
                  ),
                )
                .limit(1);
              isMember = !!member;
            }
            caller = { userId: user.id, isMember };
          }
        }
      }

      const decision = decideBillAccess(bill, code, caller);
      if (!decision.ok) {
        res
          .status(decision.status)
          .json({ error: decision.status === 404 ? "Bill not found" : "Forbidden" });
        return;
      }
      req.billAccess = { billId, joinCode: bill.joinCode, via: decision.via };
      next();
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  })();
}
