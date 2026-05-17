import type { Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { billsTable, billUsersTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AuthRequest } from "./auth.js";

const JOIN_CODE_HEADER = "x-join-code";

export interface BillAccessRequest extends AuthRequest {
  billAccess?: {
    billId: number;
    joinCode: string;
    via: "owner" | "member" | "joinCode" | "guestBill";
  };
}

/**
 * Authorize access to a bill identified by `:billId` in the route. Access is
 * granted when ANY of the following is true:
 *   - the bill is a guest bill (isGuestBill = true, ownerUserId IS NULL)
 *   - the request carries an `X-Join-Code` header matching the bill's joinCode
 *   - the request is authenticated and the user is the bill's owner or member
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

      if (bill.isGuestBill && !bill.ownerUserId) {
        req.billAccess = { billId, joinCode: bill.joinCode, via: "guestBill" };
        next();
        return;
      }

      const rawCode =
        String(req.headers[JOIN_CODE_HEADER] ?? "").trim() ||
        String((req.query as Record<string, string | undefined>)["joinCode"] ?? "").trim();
      const headerCode = rawCode.toUpperCase();
      if (headerCode) {
        if (headerCode === bill.joinCode.toUpperCase()) {
          req.billAccess = { billId, joinCode: bill.joinCode, via: "joinCode" };
          next();
          return;
        }
        res.status(404).json({ error: "Bill not found" });
        return;
      }

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
          if (bill.ownerUserId === user.id) {
            req.billAccess = { billId, joinCode: bill.joinCode, via: "owner" };
            next();
            return;
          }
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
          if (member) {
            req.billAccess = { billId, joinCode: bill.joinCode, via: "member" };
            next();
            return;
          }
        }
      }

      res.status(403).json({ error: "Forbidden" });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  })();
}
