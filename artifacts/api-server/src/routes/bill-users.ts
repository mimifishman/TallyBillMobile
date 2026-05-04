import { Router } from "express";
import { db } from "@workspace/db";
import { billMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router({ mergeParams: true });

function parseBillId(req: { params: Record<string, unknown> }): number {
  return parseInt(String(req.params["billId"] ?? ""), 10);
}

router.get("/", async (req, res) => {
  const billId = parseBillId(req);
  const members = await db.select().from(billMembersTable).where(eq(billMembersTable.billId, billId));
  res.json(members);
});

router.post("/", async (req, res) => {
  const billId = parseBillId(req);
  const { name, color } = req.body;
  if (!name || !color) {
    res.status(400).json({ error: "name and color are required" });
    return;
  }
  const [member] = await db.insert(billMembersTable).values({ billId, name, color }).returning();
  res.status(201).json(member);
});

router.put("/:userId", async (req, res) => {
  const billId = parseBillId(req);
  const userId = parseInt(String(req.params["userId"]), 10);
  const { name, color, tipPercentOverride } = req.body;
  const [updated] = await db.update(billMembersTable).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color }),
    ...(tipPercentOverride !== undefined && { tipPercentOverride: tipPercentOverride === null ? null : String(tipPercentOverride) }),
  })
    .where(and(eq(billMembersTable.id, userId), eq(billMembersTable.billId, billId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Bill member not found" });
    return;
  }
  res.json(updated);
});

router.delete("/:userId", async (req, res) => {
  const billId = parseBillId(req);
  const userId = parseInt(String(req.params["userId"]), 10);
  await db.delete(billMembersTable)
    .where(and(eq(billMembersTable.id, userId), eq(billMembersTable.billId, billId)));
  res.status(204).send();
});

export default router;
