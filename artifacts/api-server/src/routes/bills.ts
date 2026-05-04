import { Router } from "express";
import { db } from "@workspace/db";
import {
  billsTable,
  billUsersTable,
  billMembersTable,
  billLinesTable,
  billLineMembersTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireBillAccess } from "../middlewares/billAccess.js";
import { generateJoinCode } from "../lib/auth.js";

const router = Router();

async function getBillLines(billId: number) {
  const lines = await db.select().from(billLinesTable).where(eq(billLinesTable.billId, billId));
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
  const allMembers = await db.select().from(billMembersTable).where(inArray(billMembersTable.billId, billIds));

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

router.post("/", optionalAuth, async (req: AuthRequest, res) => {
  const { title, restaurantName, date, currency, taxPercent, tipPercent } = req.body;
  if (!title || !date) {
    res.status(400).json({ error: "title and date are required" });
    return;
  }
  const joinCode = generateJoinCode();
  const user = req.user;
  const bill = await db.transaction(async (tx) => {
    const [newBill] = await tx.insert(billsTable).values({
      ownerUserId: user?.userId ?? null,
      title,
      restaurantName: restaurantName || null,
      date,
      currency: currency || null,
      taxPercent: String(taxPercent ?? 0),
      tipPercent: String(tipPercent ?? 0),
      joinCode,
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
  const users = await db.select().from(billMembersTable).where(eq(billMembersTable.billId, bill.id));
  res.json({ bill, lines, users, isOwner: false });
});

router.get("/:billId", requireBillAccess, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  const lines = await getBillLines(billId);
  const users = await db.select().from(billMembersTable).where(eq(billMembersTable.billId, billId));
  const isOwner = !!req.user && bill.ownerUserId === req.user.userId;
  res.json({ bill, lines, users, isOwner });
});

router.put("/:billId", requireBillAccess, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const { title, restaurantName, date, currency, taxPercent, tipPercent } = req.body;
  const [updated] = await db.update(billsTable).set({
    ...(title && { title }),
    ...(restaurantName !== undefined && { restaurantName }),
    ...(date && { date }),
    ...(currency !== undefined && { currency: currency || null }),
    ...(taxPercent !== undefined && { taxPercent: String(taxPercent) }),
    ...(tipPercent !== undefined && { tipPercent: String(tipPercent) }),
  }).where(eq(billsTable.id, billId)).returning();
  res.json(updated);
});

router.patch("/:billId", requireAuth, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  if (bill.ownerUserId !== req.user!.userId) {
    res.status(403).json({ error: "Only the bill owner can edit bill details" });
    return;
  }
  const { title, restaurantName, date, currency, taxPercent, tipPercent } = req.body;
  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    res.status(400).json({ error: "title cannot be empty" });
    return;
  }
  const [updated] = await db.update(billsTable).set({
    ...(title !== undefined && { title: title.trim() }),
    ...(restaurantName !== undefined && { restaurantName: restaurantName ? String(restaurantName).trim() : null }),
    ...(date !== undefined && { date }),
    ...(currency !== undefined && { currency: currency || null }),
    ...(taxPercent !== undefined && { taxPercent: String(parseFloat(taxPercent) || 0) }),
    ...(tipPercent !== undefined && { tipPercent: String(parseFloat(tipPercent) || 0) }),
  }).where(eq(billsTable.id, billId)).returning();
  res.json(updated);
});

router.delete("/:billId", requireAuth, async (req: AuthRequest, res) => {
  const billId = parseInt(String(req.params["billId"]));
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill || bill.ownerUserId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(billsTable).where(eq(billsTable.id, billId));
  res.status(204).send();
});

export default router;
