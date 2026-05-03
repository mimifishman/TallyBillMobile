import type { Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { billsTable, billMembersTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AuthRequest } from "./auth.js";

const JOIN_CODE_HEADER = "x-join-code";

export interface BillAccessRequest extends AuthRequest {
  billAccess?: {
    billId: number;
    joinCode: string;
    via: "owner" | "member" | "joinCode";
  };
}

/**
 * Authorize access to a bill identified by `:billId` in the route. Access is
 * granted when EITHER:
 *   - the request is authenticated and the user is the bill's owner or a
 *     member, OR
 *   - the request carries an `X-Join-Code` header whose value (case
 *     insensitive) matches the bill's `joinCode`.
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

      const headerCode = String(req.headers[JOIN_CODE_HEADER] ?? "").trim().toUpperCase();
      if (headerCode) {
        // The caller is presenting a join-code capability. Treat it as
        // authoritative for this request: if it matches we let them in;
        // if it doesn't, we 404 (rather than 403 or falling through to
        // session-auth) so callers get the same "not found" signal whether
        // the bill doesn't exist or their code is wrong.
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
          if (bill.ownerUserId === user.id) {
            req.billAccess = { billId, joinCode: bill.joinCode, via: "owner" };
            next();
            return;
          }
          const [member] = await db
            .select()
            .from(billMembersTable)
            .where(
              and(
                eq(billMembersTable.billId, billId),
                eq(billMembersTable.userId, user.id),
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
