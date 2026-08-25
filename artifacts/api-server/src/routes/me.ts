import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  billsTable,
  billUsersTable,
  billMembersTable,
  billLinesTable,
  billLineMembersTable,
  circlesTable,
  circleMembersTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { subscribeUser, unsubscribeUser } from "../lib/sseManager.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { clerk } from "../lib/clerk.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  const [current] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: current.id,
    email: current.email,
    firstName: current.firstName ?? null,
    lastName: current.lastName ?? null,
    displayName: current.displayName,
  });
});

router.patch("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { firstName, lastName } = req.body as { firstName?: unknown; lastName?: unknown };

  const incomingFirst = typeof firstName === "string" ? firstName.trim() || null : undefined;
  const incomingLast = typeof lastName === "string" ? lastName.trim() || null : undefined;

  if (incomingFirst === undefined && incomingLast === undefined) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [current] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const newFirst = incomingFirst !== undefined ? incomingFirst : current.firstName;
  const newLast = incomingLast !== undefined ? incomingLast : current.lastName;
  const newDisplay = [newFirst, newLast].filter(Boolean).join(" ") || current.displayName;

  const [updated] = await db
    .update(usersTable)
    .set({
      firstName: newFirst,
      lastName: newLast,
      displayName: newDisplay,
    })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({
    firstName: updated?.firstName ?? null,
    lastName: updated?.lastName ?? null,
    displayName: updated?.displayName ?? null,
  });
});

/**
 * Permanently deletes the signed-in user's account (App Store guideline 5.1.1(v)).
 *
 * Runs in three phases, in this order:
 *   1. one transaction that removes every local row belonging to the user,
 *      returning the object-storage paths of their receipt photos;
 *   2. best-effort deletion of those receipt objects from the bucket;
 *   3. deletion of the Clerk user.
 *
 * Clerk goes last on purpose: if Clerk were removed first and a later step
 * failed, the user could no longer authenticate and so could never retry.
 * Every phase tolerates already-deleted state, so a retry after a partial
 * failure succeeds rather than 500s.
 */
router.delete("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  const [current] = await db
    .select({ id: usersTable.id, clerkId: usersTable.clerkId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // requireAuth re-creates a row for a known Clerk id, so this is only
  // reachable in a race. Nothing local left to remove; fall through to Clerk.
  const clerkId = current?.clerkId ?? null;

  let receiptImagePaths: string[] = [];

  try {
    receiptImagePaths = await db.transaction(async (tx) => {
      const ownedBills = await tx
        .select({ id: billsTable.id, receiptImagePath: billsTable.receiptImagePath })
        .from(billsTable)
        .where(eq(billsTable.ownerUserId, userId));
      const ownedBillIds = ownedBills.map((b) => b.id);

      // 1. bill_line_members — line assignments on owned bills. Assignments
      //    on bills owned by other people are kept, so their totals don't move.
      if (ownedBillIds.length > 0) {
        const ownedLines = await tx
          .select({ id: billLinesTable.id })
          .from(billLinesTable)
          .where(inArray(billLinesTable.billId, ownedBillIds));
        const ownedLineIds = ownedLines.map((l) => l.id);
        if (ownedLineIds.length > 0) {
          await tx
            .delete(billLineMembersTable)
            .where(inArray(billLineMembersTable.billLineId, ownedLineIds));
        }
      }

      // 2. bill_lines of owned bills
      if (ownedBillIds.length > 0) {
        await tx.delete(billLinesTable).where(inArray(billLinesTable.billId, ownedBillIds));
      }

      // 3. bill_users — access rows for everyone on owned bills, plus this
      //    user's own access to bills owned by others (they lose access).
      if (ownedBillIds.length > 0) {
        await tx.delete(billUsersTable).where(inArray(billUsersTable.billId, ownedBillIds));
      }
      await tx.delete(billUsersTable).where(eq(billUsersTable.userId, userId));

      // 4. bill_members — participant rows on owned bills only. On bills
      //    owned by other people, this user's row (and its name) is KEPT;
      //    deleting the user row below nulls its linked_user_id via the
      //    schema's onDelete: "set null", so the split and name survive.
      if (ownedBillIds.length > 0) {
        await tx.delete(billMembersTable).where(inArray(billMembersTable.billId, ownedBillIds));
      }

      // 5. owned bills
      if (ownedBillIds.length > 0) {
        await tx.delete(billsTable).where(inArray(billsTable.id, ownedBillIds));
      }

      // 6. circle_members — members of owned circles only. This user's entry
      //    in other people's circles is kept (name preserved, link nulled).
      const ownedCircles = await tx
        .select({ id: circlesTable.id })
        .from(circlesTable)
        .where(eq(circlesTable.ownerUserId, userId));
      const ownedCircleIds = ownedCircles.map((c) => c.id);
      if (ownedCircleIds.length > 0) {
        await tx
          .delete(circleMembersTable)
          .where(inArray(circleMembersTable.circleId, ownedCircleIds));
      }

      // 7. owned circles
      if (ownedCircleIds.length > 0) {
        await tx.delete(circlesTable).where(inArray(circlesTable.id, ownedCircleIds));
      }

      // 8. the user row itself
      await tx.delete(usersTable).where(eq(usersTable.id, userId));

      return ownedBills
        .map((b) => b.receiptImagePath)
        .filter((p): p is string => typeof p === "string" && p.length > 0);
    });
  } catch (err) {
    logger.error({ err, userId }, "Account deletion failed while removing local data");
    res.status(500).json({ error: "Failed to delete account" });
    return;
  }

  // Receipt photos are real pictures of users' receipts. Losing track of one
  // is a privacy problem, so failures are logged loudly with the exact path.
  if (receiptImagePaths.length > 0) {
    const storage = new ObjectStorageService();
    const orphaned: string[] = [];
    for (const objectPath of receiptImagePaths) {
      try {
        await storage.deleteObjectEntity(objectPath);
      } catch (err) {
        orphaned.push(objectPath);
        logger.error(
          { err, userId, objectPath },
          "ORPHANED RECEIPT IMAGE: account deleted but its receipt object could not be removed from object storage — delete it manually",
        );
      }
    }
    if (orphaned.length > 0) {
      logger.error(
        { userId, orphanedCount: orphaned.length, orphanedPaths: orphaned },
        "ORPHANED RECEIPT IMAGES: account deletion left receipt objects behind in object storage",
      );
    }
  }

  // Clerk last: until this succeeds the user can still sign in and retry.
  if (clerkId) {
    try {
      await clerk.users.deleteUser(clerkId);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 404) {
        logger.error(
          { err, userId },
          "Account deletion removed local data but could not delete the Clerk user",
        );
        res.status(500).json({ error: "Failed to delete account" });
        return;
      }
    }
  }

  res.status(204).send();
});

router.post("/claim-guest-bills", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { guestOwnerId } = req.body as { guestOwnerId?: unknown };

  if (typeof guestOwnerId !== "string" || !guestOwnerId.trim()) {
    res.status(400).json({ error: "guestOwnerId is required" });
    return;
  }

  const guestBills = await db
    .select()
    .from(billsTable)
    .where(
      and(
        eq(billsTable.guestOwnerId, guestOwnerId.trim()),
        eq(billsTable.isGuestBill, true),
      ),
    );

  if (guestBills.length === 0) {
    res.json({ claimed: 0 });
    return;
  }

  const claimed = await db.transaction(async (tx) => {
    let count = 0;
    for (const bill of guestBills) {
      await tx
        .update(billsTable)
        .set({
          ownerUserId: userId,
          isGuestBill: false,
          guestOwnerId: null,
        })
        .where(eq(billsTable.id, bill.id));

      const [existingMember] = await tx
        .select()
        .from(billUsersTable)
        .where(and(eq(billUsersTable.billId, bill.id), eq(billUsersTable.userId, userId)))
        .limit(1);

      if (!existingMember) {
        await tx.insert(billUsersTable).values({
          billId: bill.id,
          userId,
          role: "owner",
        });
      }

      count++;
    }
    return count;
  });

  res.json({ claimed });
});

router.get("/events", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  const pingTimer = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(pingTimer);
    }
  }, 30_000);

  subscribeUser(userId, res);

  req.on("close", () => {
    clearInterval(pingTimer);
    unsubscribeUser(userId, res);
  });
});

export default router;
