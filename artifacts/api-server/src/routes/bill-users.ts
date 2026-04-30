import { Router } from "express";
import { db } from "@workspace/db";
import { billUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const billId = parseInt((req.params as Record<string, string>)["billId"]);
  const users = await db.select().from(billUsersTable).where(eq(billUsersTable.billId, billId));
  res.json(users);
});

router.post("/", async (req, res) => {
  const billId = parseInt((req.params as Record<string, string>)["billId"]);
  const { name, color } = req.body;
  if (!name || !color) {
    res.status(400).json({ error: "name and color are required" });
    return;
  }
  const [user] = await db.insert(billUsersTable).values({ billId, name, color }).returning();
  res.status(201).json(user);
});

router.put("/:userId", async (req, res) => {
  const userId = parseInt((req.params as Record<string, string>)["userId"]);
  const { name, color, tipPercentOverride } = req.body;
  const [updated] = await db.update(billUsersTable).set({
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color }),
    ...(tipPercentOverride !== undefined && { tipPercentOverride: tipPercentOverride === null ? null : String(tipPercentOverride) }),
  }).where(eq(billUsersTable.id, userId)).returning();
  res.json(updated);
});

router.delete("/:userId", async (req, res) => {
  const userId = parseInt((req.params as Record<string, string>)["userId"]);
  await db.delete(billUsersTable).where(eq(billUsersTable.id, userId));
  res.status(204).send();
});

export default router;
