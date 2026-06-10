import { Router } from "express";
import { db } from "@workspace/db";
import { billLinesTable, billLineMembersTable, billMembersTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { notifyBillChanged } from "../lib/sseManager.js";

const router = Router({ mergeParams: true });

function parseBillId(req: { params: Record<string, unknown> }): number {
  return parseInt(String(req.params["billId"] ?? ""), 10);
}

async function getBillLinesWithAssignments(billId: number) {
  const lines = await db.select().from(billLinesTable)
    .where(eq(billLinesTable.billId, billId))
    .orderBy(sql`COALESCE(${billLinesTable.position}, ${billLinesTable.id}) ASC`);
  const lineIds = lines.map((l) => l.id);
  const assignments = lineIds.length > 0
    ? await db.select().from(billLineMembersTable).where(inArray(billLineMembersTable.billLineId, lineIds))
    : [];
  return lines.map((line) => ({
    ...line,
    assignedUserIds: assignments.filter((a) => a.billLineId === line.id).map((a) => a.billMemberId),
  }));
}

async function computePosition(billId: number, afterLineId?: number | null): Promise<number> {
  if (afterLineId != null) {
    const [afterLine] = await db.select({ pos: sql<number>`COALESCE(${billLinesTable.position}, ${billLinesTable.id}::float)` })
      .from(billLinesTable)
      .where(and(eq(billLinesTable.id, afterLineId), eq(billLinesTable.billId, billId)))
      .limit(1);
    if (afterLine) {
      const afterPos = afterLine.pos;
      const [nextLine] = await db.select({ pos: sql<number>`COALESCE(${billLinesTable.position}, ${billLinesTable.id}::float)` })
        .from(billLinesTable)
        .where(and(
          eq(billLinesTable.billId, billId),
          sql`COALESCE(${billLinesTable.position}, ${billLinesTable.id}::float) > ${afterPos}`,
        ))
        .orderBy(sql`COALESCE(${billLinesTable.position}, ${billLinesTable.id}::float) ASC`)
        .limit(1);
      return nextLine ? (afterPos + nextLine.pos) / 2 : afterPos + 1;
    }
  }
  const [row] = await db.select({ m: sql<number>`COALESCE(MAX(COALESCE(${billLinesTable.position}, ${billLinesTable.id}::float)), 0)` })
    .from(billLinesTable)
    .where(eq(billLinesTable.billId, billId));
  return (row?.m ?? 0) + 1;
}

router.get("/", async (req, res) => {
  const billId = parseBillId(req);
  const lines = await getBillLinesWithAssignments(billId);
  res.json(lines);
});

router.post("/", async (req, res) => {
  const billId = parseBillId(req);
  const { description, originalDescription, quantity, unitPrice, total, afterLineId } = req.body;
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  const position = await computePosition(billId, afterLineId ?? null);
  const [line] = await db.insert(billLinesTable).values({
    billId,
    description,
    originalDescription: originalDescription ?? null,
    quantity: String(quantity ?? 1),
    unitPrice: String(unitPrice ?? 0),
    total: String(total ?? 0),
    position,
  }).returning();
  notifyBillChanged(billId);
  res.status(201).json({ ...line, assignedUserIds: [] });
});

router.post("/bulk", async (req, res) => {
  const billId = parseBillId(req);
  const { lines } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "lines array is required" });
    return;
  }
  const insertedLines = await db.insert(billLinesTable).values(
    lines.map((l: { description: string; originalDescription?: string | null; quantity: number; unitPrice: number; total: number }) => ({
      billId,
      description: l.description,
      originalDescription: l.originalDescription ?? null,
      quantity: String(l.quantity ?? 1),
      unitPrice: String(l.unitPrice ?? 0),
      total: String(l.total ?? 0),
    }))
  ).returning();
  notifyBillChanged(billId);
  res.status(201).json(insertedLines.map((l) => ({ ...l, assignedUserIds: [] })));
});

router.put("/:lineId", async (req, res) => {
  const billId = parseBillId(req);
  const lineId = parseInt(String(req.params["lineId"]), 10);
  const { description, quantity, unitPrice, total } = req.body;
  const [updated] = await db.update(billLinesTable).set({
    ...(description && { description }),
    ...(quantity !== undefined && { quantity: String(quantity) }),
    ...(unitPrice !== undefined && { unitPrice: String(unitPrice) }),
    ...(total !== undefined && { total: String(total) }),
  })
    .where(and(eq(billLinesTable.id, lineId), eq(billLinesTable.billId, billId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Line not found" });
    return;
  }
  const assignments = await db.select().from(billLineMembersTable).where(eq(billLineMembersTable.billLineId, lineId));
  notifyBillChanged(billId);
  res.json({ ...updated, assignedUserIds: assignments.map((a) => a.billMemberId) });
});

router.delete("/:lineId", async (req, res) => {
  const billId = parseBillId(req);
  const lineId = parseInt(String(req.params["lineId"]), 10);
  await db.delete(billLinesTable)
    .where(and(eq(billLinesTable.id, lineId), eq(billLinesTable.billId, billId)));
  notifyBillChanged(billId);
  res.status(204).send();
});

router.post("/:lineId/users", async (req, res) => {
  const billId = parseBillId(req);
  const lineId = parseInt(String(req.params["lineId"]), 10);
  const { billUserId } = req.body;
  if (!billUserId) {
    res.status(400).json({ error: "billUserId is required" });
    return;
  }
  const [line] = await db.select().from(billLinesTable)
    .where(and(eq(billLinesTable.id, lineId), eq(billLinesTable.billId, billId)))
    .limit(1);
  if (!line) {
    res.status(404).json({ error: "Line not found" });
    return;
  }
  const [billMember] = await db.select().from(billMembersTable)
    .where(and(eq(billMembersTable.id, billUserId), eq(billMembersTable.billId, billId)))
    .limit(1);
  if (!billMember) {
    res.status(400).json({ error: "billUserId does not belong to this bill" });
    return;
  }
  const [existing] = await db.select().from(billLineMembersTable)
    .where(and(eq(billLineMembersTable.billLineId, lineId), eq(billLineMembersTable.billMemberId, billUserId)))
    .limit(1);
  if (existing) {
    await db.delete(billLineMembersTable)
      .where(and(eq(billLineMembersTable.billLineId, lineId), eq(billLineMembersTable.billMemberId, billUserId)));
    notifyBillChanged(billId);
    res.json({ assigned: false });
  } else {
    await db.insert(billLineMembersTable).values({ billLineId: lineId, billMemberId: billUserId });
    notifyBillChanged(billId);
    res.json({ assigned: true });
  }
});

export default router;
