import { Router } from "express";
import { db } from "@workspace/db";
import { billLinesTable, billLineUsersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router = Router({ mergeParams: true });

async function getBillLinesWithAssignments(billId: number) {
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

router.get("/", async (req, res) => {
  const billId = parseInt(req.params["billId"]!);
  const lines = await getBillLinesWithAssignments(billId);
  res.json(lines);
});

router.post("/", async (req, res) => {
  const billId = parseInt(req.params["billId"]!);
  const { description, quantity, unitPrice, total } = req.body;
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  const [line] = await db.insert(billLinesTable).values({
    billId,
    description,
    quantity: String(quantity ?? 1),
    unitPrice: String(unitPrice ?? 0),
    total: String(total ?? 0),
  }).returning();
  res.status(201).json({ ...line, assignedUserIds: [] });
});

router.post("/bulk", async (req, res) => {
  const billId = parseInt(req.params["billId"]!);
  const { lines } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "lines array is required" });
    return;
  }
  const insertedLines = await db.insert(billLinesTable).values(
    lines.map((l: { description: string; quantity: number; unitPrice: number; total: number }) => ({
      billId,
      description: l.description,
      quantity: String(l.quantity ?? 1),
      unitPrice: String(l.unitPrice ?? 0),
      total: String(l.total ?? 0),
    }))
  ).returning();
  res.status(201).json(insertedLines.map((l) => ({ ...l, assignedUserIds: [] })));
});

router.put("/:lineId", async (req, res) => {
  const lineId = parseInt(req.params["lineId"]!);
  const { description, quantity, unitPrice, total } = req.body;
  const [updated] = await db.update(billLinesTable).set({
    ...(description && { description }),
    ...(quantity !== undefined && { quantity: String(quantity) }),
    ...(unitPrice !== undefined && { unitPrice: String(unitPrice) }),
    ...(total !== undefined && { total: String(total) }),
  }).where(eq(billLinesTable.id, lineId)).returning();
  const assignments = await db.select().from(billLineUsersTable).where(eq(billLineUsersTable.billLineId, lineId));
  res.json({ ...updated, assignedUserIds: assignments.map((a) => a.billUserId) });
});

router.delete("/:lineId", async (req, res) => {
  const lineId = parseInt(req.params["lineId"]!);
  await db.delete(billLinesTable).where(eq(billLinesTable.id, lineId));
  res.status(204).send();
});

router.post("/:lineId/users", async (req, res) => {
  const lineId = parseInt(req.params["lineId"]!);
  const { billUserId } = req.body;
  if (!billUserId) {
    res.status(400).json({ error: "billUserId is required" });
    return;
  }
  const [existing] = await db.select().from(billLineUsersTable)
    .where(and(eq(billLineUsersTable.billLineId, lineId), eq(billLineUsersTable.billUserId, billUserId)))
    .limit(1);
  if (existing) {
    await db.delete(billLineUsersTable)
      .where(and(eq(billLineUsersTable.billLineId, lineId), eq(billLineUsersTable.billUserId, billUserId)));
    res.json({ assigned: false });
  } else {
    await db.insert(billLineUsersTable).values({ billLineId: lineId, billUserId });
    res.json({ assigned: true });
  }
});

export default router;
