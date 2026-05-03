import { Router } from "express";
import { db } from "@workspace/db";
import { billUsersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router({ mergeParams: true });

function parseBillId(req: { params: Record<string, unknown> }): number {
  return parseInt(String(req.params["billId"] ?? ""), 10);
}

router.get("/", async (req, res) => {
  const billId = parseBillId(req);
  const users = await db.select().from(billUsersTable).where(eq(billUsersTable.billId, billId));
  res.json(users);
});

router.post("/", async (req, res) => {
  const billId = parseBillId(req);
  const { name, color } = req.body;
  if (!name || !color) {
    res.status(400).json({ error: "name and color are required" });
    return;
  }
  const [user] = await db.insert(billUsersTable).values({ billId, name, color }).returning();
  res.status(201).json(user);
});

router.put("/:userId", async (req, res) => {
  const billId = parseBillId(req);
  const userId = parseInt(String(req.params["userId"]), 10);
  const { name, color, tipPercentOverride } = req.body;
  const [updated] = await db.update(billUsersTable).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color }),
    ...(tipPercentOverride !== undefined && { tipPercentOverride: tipPercentOverride === null ? null : String(tipPercentOverride) }),
  })
    .where(and(eq(billUsersTable.id, userId), eq(billUsersTable.billId, billId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Bill user not found" });
    return;
  }
  res.json(updated);
});

router.delete("/:userId", async (req, res) => {
  const billId = parseBillId(req);
  const userId = parseInt(String(req.params["userId"]), 10);
  await db.delete(billUsersTable)
    .where(and(eq(billUsersTable.id, userId), eq(billUsersTable.billId, billId)));
  res.status(204).send();
});

export default router;
