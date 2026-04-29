import { Router } from "express";
import { db } from "@workspace/db";
import {
  billsTable,
  billMembersTable,
  billUsersTable,
  billLinesTable,
  billLineUsersTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth, type AuthRequest } from "../middlewares/auth.js";
import { generateJoinCode } from "../lib/auth.js";

const router = Router();

async function getBillWithAccess(billId: number, userId?: number): Promise<boolean> {
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) return false;
  if (!userId) return true;
  if (bill.ownerUserId === userId) return true;
  const [member] = await db.select().from(billMembersTable)
    .where(and(eq(billMembersTable.billId, billId), eq(billMembersTable.userId, userId)))
    .limit(1);
  return !!member;
}

async function getBillLines(billId: number) {
  const lines = await db.select().from(billLinesTable).where(eq(billLinesTable.billId, billId));
  const lineIds = lines.map((l) => l.id);
  const assignments = lineIds.length > 0
    ? await db.select().from(billLineUsersTable).where(inArray(billLineUsersTable.billLineId, lineIds))
    : [];
  return lines.map((line) => ({
    ...line,
    assignedUserIds: assignments.filter((a) => a.billLineId === line.id).map((a) => a.billUserId),
  }));
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const ownedBills = await db.select().from(billsTable).where(eq(billsTable.ownerUserId, userId));
  const memberRows = await db.select().from(billMembersTable).where(eq(billMembersTable.userId, userId));
  const memberBillIds = memberRows.map((m) => m.billId);
  const memberBills = memberBillIds.length > 0
    ? await db.select().from(billsTable).where(inArray(billsTable.id, memberBillIds))
    : [];
  const allBillIds = new Set(ownedBills.map((b) => b.id));
  const combined = [...ownedBills, ...memberBills.filter((b) => !allBillIds.has(b.id))];
  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(combined);
});

router.post("/", optionalAuth, async (req: AuthRequest, res) => {
  const { title, restaurantName, date, currency, taxAmount, tipAmount } = req.body;
  if (!title || !date || !currency) {
    res.status(400).json({ error: "title, date, and currency are required" });
    return;
  }
  let joinCode = generateJoinCode();
  const [bill] = await db.insert(billsTable).values({
    ownerUserId: req.user?.userId ?? null,
    title,
    restaurantName: restaurantName || null,
    date,
    currency,
    taxAmount: String(taxAmount ?? 0),
    tipAmount: String(tipAmount ?? 0),
    joinCode,
  }).returning();
  if (req.user && bill) {
    await db.insert(billMembersTable).values({
      billId: bill.id,
      userId: req.user.userId,
      role: "owner",
    });
  }
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
  const [existing] = await db.select().from(billMembersTable)
    .where(and(eq(billMembersTable.billId, bill.id), eq(billMembersTable.userId, userId)))
    .limit(1);
  if (!existing) {
    await db.insert(billMembersTable).values({ billId: bill.id, userId, role: "member" });
  }
  res.json(bill);
});

router.get("/:billId", optionalAuth, async (req: AuthRequest, res) => {
  const billId = parseInt(req.params["billId"]!);
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  const lines = await getBillLines(billId);
  const users = await db.select().from(billUsersTable).where(eq(billUsersTable.billId, billId));
  res.json({ bill, lines, users });
});

router.put("/:billId", optionalAuth, async (req: AuthRequest, res) => {
  const billId = parseInt(req.params["billId"]!);
  const hasAccess = await getBillWithAccess(billId, req.user?.userId);
  if (!hasAccess) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { title, restaurantName, date, currency, taxAmount, tipAmount } = req.body;
  const [updated] = await db.update(billsTable).set({
    ...(title && { title }),
    ...(restaurantName !== undefined && { restaurantName }),
    ...(date && { date }),
    ...(currency && { currency }),
    ...(taxAmount !== undefined && { taxAmount: String(taxAmount) }),
    ...(tipAmount !== undefined && { tipAmount: String(tipAmount) }),
  }).where(eq(billsTable.id, billId)).returning();
  res.json(updated);
});

router.delete("/:billId", requireAuth, async (req: AuthRequest, res) => {
  const billId = parseInt(req.params["billId"]!);
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill || bill.ownerUserId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(billsTable).where(eq(billsTable.id, billId));
  res.status(204).send();
});

export default router;
