import { Router } from "express";
import { db } from "@workspace/db";
import {
  billsTable,
  billUsersTable,
  billMembersTable,
  billLinesTable,
  billLineMembersTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { requireAuth, optionalAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireBillAccess, type BillAccessRequest } from "../middlewares/billAccess.js";
import { generateJoinCode } from "../lib/auth.js";
import { subscribe, unsubscribe, notifyBillChanged } from "../lib/sseManager.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

const router = Router();

async function getBillLines(billId: number) {
  const lines = await db.select().from(billLinesTable).where(eq(billLinesTable.billId, billId)).orderBy(sql`COALESCE(${billLinesTable.position}, ${billLinesTable.id}::float) ASC`);
  const lineIds = lines.map((l) => l.id);
  const assignments = lineIds.length > 0
    ? await db.select().from(billLineMembersTable).where(inArray(billLineMembersTable.billLineId, lineIds))
    : [];
  return lines.map((line) => ({
    ...line,
    assignedUserIds: assignments.filter((a) => a.billLineId === line.id).map((a) => a.billMemberId),
  }));
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const ownedBills = await db.select().from(billsTable).where(eq(billsTable.ownerUserId, userId));
  const memberRows = await db.select().from(billUsersTable).where(eq(billUsersTable.userId, userId));
  const memberBillIds = memberRows.map((m) => m.billId);
  const memberBills = memberBillIds.length > 0
    ? await db.select().from(billsTable).where(inArray(billsTable.id, memberBillIds))
    : [];
  const allBillIds = new Set(ownedBills.map((b) => b.id));
  const combined = [...ownedBills, ...memberBills.filter((b) => !allBillIds.has(b.id))];
  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const billIds = combined.map((b) => b.id);
  if (billIds.length === 0) {
    res.json([]);
    return;
  }
  const allLines = await db.select().from(billLinesTable).where(inArray(billLinesTable.billId, billIds));
  const allLineIds = allLines.map((l) => l.id);
  const allAssignments = allLineIds.length > 0
    ? await db.select().from(billLineMembersTable).where(inArray(billLineMembersTable.billLineId, allLineIds))
    : [];
  const allMembers = await db.select().from(billMembersTable).where(inArray(billMembersTable.billId, billIds)).orderBy(asc(billMembersTable.id));

  const assignedLineIds = new Set(allAssignments.map((a) => a.billLineId));
  const linesByBill = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const arr = linesByBill.get(line.billId);
    if (arr) arr.push(line);
    else linesByBill.set(line.billId, [line]);
  }
  const membersByBill = new Map<number, { id: number; name: string; color: string }[]>();
  for (const m of allMembers) {
    const entry = { id: m.id, name: m.name, color: m.color };
    const arr = membersByBill.get(m.billId);
    if (arr) arr.push(entry);
    else membersByBill.set(m.billId, [entry]);
  }

  const enriched = combined.map((bill) => {
    const billLines = linesByBill.get(bill.id) ?? [];
    const users = membersByBill.get(bill.id) ?? [];
    const settled =
      users.length > 0 &&
      billLines.length > 0 &&
      billLines.every((l) => assignedLineIds.has(l.id));
    const isOwner = bill.ownerUserId === userId;
    return { ...bill, settled, users, isOwner };
  });

  res.json(enriched);
});

router.get("/guest", async (req, res) => {
  const idsParam = String(req.query["ids"] ?? "").trim();
  if (!idsParam) {
    res.json([]);
    return;
  }
  const ids = idsParam.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const guestOwnerId = String(req.query["guestOwnerId"] ?? "").trim();

  const bills = await db.select().from(billsTable).where(inArray(billsTable.id, ids));

  if (bills.length === 0) {
    res.json([]);
    return;
  }

  const billIds = bills.map((b) => b.id);
  const allLines = await db.select().from(billLinesTable).where(inArray(billLinesTable.billId, billIds));
  const allLineIds = allLines.map((l) => l.id);
  const allAssignments = allLineIds.length > 0
    ? await db.select().from(billLineMembersTable).where(inArray(billLineMembersTable.billLineId, allLineIds))
    : [];
  const allMembers = await db.select().from(billMembersTable).where(inArray(billMembersTable.billId, billIds)).orderBy(asc(billMembersTable.id));

  const assignedLineIds = new Set(allAssignments.map((a) => a.billLineId));
  const linesByBill = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const arr = linesByBill.get(line.billId);
    if (arr) arr.push(line);
    else linesByBill.set(line.billId, [line]);
  }
  const membersByBill = new Map<number, { id: number; name: string; color: string }[]>();
  for (const m of allMembers) {
    const entry = { id: m.id, name: m.name, color: m.color };
    const arr = membersByBill.get(m.billId);
    if (arr) arr.push(entry);
    else membersByBill.set(m.billId, [entry]);
  }

  const enriched = bills.map((bill) => {
    const billLines = linesByBill.get(bill.id) ?? [];
    const users = membersByBill.get(bill.id) ?? [];
    const settled =
      users.length > 0 &&
      billLines.length > 0 &&
      billLines.every((l) => assignedLineIds.has(l.id));
    const isOwner = guestOwnerId.length > 0 && bill.guestOwnerId === guestOwnerId;
    return { ...bill, settled, users, isOwner };
  });

  res.json(enriched);
});

router.post("/", optionalAuth, async (req: AuthRequest, res) => {
  const { title, date, currency, taxPercent, tipPercent, guestOwnerId } = req.body;
  if (!title || !date) {
    res.status(400).json({ error: "title and date are required" });
    return;
  }
  const joinCode = generateJoinCode();
  const user = req.user;
  const isGuest = !user && typeof guestOwnerId === "string" && guestOwnerId.trim().length > 0;

  const bill = await db.transaction(async (tx) => {
    const [newBill] = await tx.insert(billsTable).values({
      ownerUserId: user?.userId ?? null,
      title,
      date,
      currency: currency || null,
      taxPercent: String(taxPercent ?? 0),
      tipPercent: String(tipPercent ?? 0),
      joinCode,
      guestOwnerId: isGuest ? guestOwnerId.trim() : null,
      isGuestBill: isGuest,
    }).returning();
    if (user && newBill) {
      await tx.insert(billUsersTable).values({
        billId: newBill.id,
        userId: user.userId,
        role: "owner",
      });
      const personName = user.firstName || user.email.split("@")[0] || "Me";
      const peopleColors = ["#E84393", "#FF6B35", "#2D9CDB", "#9B59B6", "#27AE60", "#F39C12", "#E74C3C", "#1ABC9C"];
      const color = peopleColors[Math.floor(Math.random() * peopleColors.length)]!;
      await tx.insert(billMembersTable).values({
        billId: newBill.id,
        name: personName,
        color,
      });
    }
    return newBill;
  });
  res.status(201).json(bill);
});

router.post("/join", requireAuth, async (req: AuthRequest, res) => {
  const { joinCode } = req.body;
  if (!joinCode) {
    res.status(400).json({ error: "joinCode is required" });
    return;
  }
  const [bill] = await db.select().from(billsTable)
    .where(eq(billsTable.joinCode, joinCode.toUpperCase()))
    .limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found with that code" });
    return;
  }
  const userId = req.user!.userId;
  const [existing] = await db.select().from(billUsersTable)
    .where(and(eq(billUsersTable.billId, bill.id), eq(billUsersTable.userId, userId)))
    .limit(1);
  if (!existing) {
    await db.insert(billUsersTable).values({ billId: bill.id, userId, role: "member" });
  }
  res.json(bill);
});

router.get("/by-code/:joinCode", async (req, res) => {
  const joinCode = String(req.params["joinCode"] ?? "").toUpperCase();
  if (!joinCode) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  const [bill] = await db.select().from(billsTable)
    .where(eq(billsTable.joinCode, joinCode))
    .limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  const lines = await getBillLines(bill.id);
  const users = await db.select().from(billMembersTable).where(eq(billMembersTable.billId, bill.id)).orderBy(asc(billMembersTable.id));
  let ownerName = "Guest";
  if (bill.ownerUserId) {
    const [owner] = await db.select({ displayName: usersTable.displayName }).from(usersTable)
      .where(eq(usersTable.id, bill.ownerUserId)).limit(1);
    if (owner) ownerName = owner.displayName;
  }
  res.json({ bill, lines, users, isOwner: false, ownerName });
});

router.get("/:billId", requireBillAccess, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  const lines = await getBillLines(billId);
  const rawUsers = await db.select().from(billMembersTable).where(eq(billMembersTable.billId, billId)).orderBy(asc(billMembersTable.id));
  const linkedUserIds = [...new Set(rawUsers.map((u) => u.linkedUserId).filter((id): id is number => id != null))];
  const linkedUsers = linkedUserIds.length > 0
    ? await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, linkedUserIds))
    : [];
  const linkedUserEmailMap = new Map(linkedUsers.map((u) => [u.id, u.email]));
  const users = rawUsers.map((u) => ({
    ...u,
    linkedUserEmail: u.linkedUserId != null ? (linkedUserEmailMap.get(u.linkedUserId) ?? null) : null,
  }));
  const guestOwnerId = String(req.headers["x-guest-owner-id"] ?? "").trim();
  let isOwner: boolean;
  if (bill.isGuestBill) {
    isOwner = guestOwnerId.length > 0 && bill.guestOwnerId === guestOwnerId;
  } else {
    isOwner = !!req.user && bill.ownerUserId === req.user.userId;
  }
  let isMember = false;
  if (!isOwner) {
    if (req.user) {
      const [memberRow] = await db.select().from(billUsersTable)
        .where(and(eq(billUsersTable.billId, billId), eq(billUsersTable.userId, req.user.userId)))
        .limit(1);
      isMember = !!memberRow;
    } else if (bill.isGuestBill && guestOwnerId.length > 0) {
      isMember = true;
    }
  }
  let ownerName = "Guest";
  if (bill.ownerUserId) {
    const [owner] = await db.select({ displayName: usersTable.displayName }).from(usersTable)
      .where(eq(usersTable.id, bill.ownerUserId)).limit(1);
    if (owner) ownerName = owner.displayName;
  }
  res.json({ bill, lines, users, isOwner, isMember, ownerName });
});

router.delete("/:billId/leave", requireBillAccess, requireAuth, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const userId = req.user!.userId;
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (bill.ownerUserId === userId) {
    res.status(403).json({ error: "Owner cannot leave their own bill. Delete the bill instead." });
    return;
  }
  await db.delete(billUsersTable).where(
    and(eq(billUsersTable.billId, billId), eq(billUsersTable.userId, userId))
  );
  res.status(204).send();
});

router.get("/:billId/events",
  (req, _res, next) => {
    const q = req.query as Record<string, string>;
    if (q["joinCode"] && !req.headers["x-join-code"]) {
      req.headers["x-join-code"] = q["joinCode"];
    }
    next();
  },
  requireBillAccess,
  (req: AuthRequest, res) => {
    const billId = parseInt(String(req.params["billId"]));

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

    subscribe(billId, res);

    req.on("close", () => {
      clearInterval(pingTimer);
      unsubscribe(billId, res);
    });
  }
);

router.put("/:billId", requireBillAccess, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const { title, date, currency, taxPercent, tipPercent } = req.body;
  const [updated] = await db.update(billsTable).set({
    ...(title && { title }),
    ...(date && { date }),
    ...(currency !== undefined && { currency: currency || null }),
    ...(taxPercent !== undefined && { taxPercent: String(taxPercent) }),
    ...(tipPercent !== undefined && { tipPercent: String(tipPercent) }),
  }).where(eq(billsTable.id, billId)).returning();
  notifyBillChanged(billId);
  res.json(updated);
});

router.patch("/:billId", requireBillAccess, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  if (!bill.isGuestBill) {
    const via = (req as BillAccessRequest).billAccess?.via;
    if (via !== "owner" && via !== "member") {
      res.status(403).json({ error: "Only bill members can edit bill details" });
      return;
    }
  }
  const { title, date, currency, taxPercent, tipPercent, receiptImagePath } = req.body;
  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    res.status(400).json({ error: "title cannot be empty" });
    return;
  }
  const RECEIPT_PATH_RE = /^\/objects\/uploads\/\d+\/[0-9a-f-]{36}$/i;
  if (receiptImagePath !== undefined && receiptImagePath !== null && receiptImagePath !== "") {
    const expectedPrefix = `/objects/uploads/${billId}/`;
    if (
      typeof receiptImagePath !== "string" ||
      !receiptImagePath.startsWith(expectedPrefix) ||
      !RECEIPT_PATH_RE.test(receiptImagePath)
    ) {
      res.status(400).json({ error: "Invalid receiptImagePath" });
      return;
    }
  }
  const [updated] = await db.update(billsTable).set({
    ...(title !== undefined && { title: title.trim() }),
    ...(date !== undefined && { date }),
    ...(currency !== undefined && { currency: currency || null }),
    ...(taxPercent !== undefined && { taxPercent: String(parseFloat(taxPercent) || 0) }),
    ...(tipPercent !== undefined && { tipPercent: String(parseFloat(tipPercent) || 0) }),
    ...(receiptImagePath !== undefined && { receiptImagePath: receiptImagePath || null }),
  }).where(eq(billsTable.id, billId)).returning();
  notifyBillChanged(billId);
  res.json(updated);
});

router.delete("/:billId", requireBillAccess, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (bill.isGuestBill) {
    const guestOwnerId = String(req.headers["x-guest-owner-id"] ?? "").trim();
    if (!guestOwnerId || bill.guestOwnerId !== guestOwnerId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  } else if (bill.ownerUserId !== req.user?.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const receiptImagePath = bill.receiptImagePath;

  await db.delete(billsTable).where(eq(billsTable.id, billId));

  // Best effort: the row is already gone, so a storage failure must not fail the
  // request — but it leaves a photograph of the user's receipt behind, so log loudly.
  if (receiptImagePath) {
    try {
      await new ObjectStorageService().deleteObjectEntity(receiptImagePath);
    } catch (err) {
      logger.error(
        { err, billId, objectPath: receiptImagePath },
        "ORPHANED RECEIPT IMAGE: bill deleted but its receipt object could not be removed from object storage — delete it manually",
      );
    }
  }

  res.status(204).send();
});

export default router;
