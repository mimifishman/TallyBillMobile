import { Router } from "express";
import { db } from "@workspace/db";
import { billMembersTable, billUsersTable, billsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { notifyBillChanged, notifyUserBillsChanged } from "../lib/sseManager.js";

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
  const { name, color, linkedUserId } = req.body;
  if (!name || !color) {
    res.status(400).json({ error: "name and color are required" });
    return;
  }
  const trimmedName = String(name).trim();
  const [existing] = await db
    .select({ id: billMembersTable.id })
    .from(billMembersTable)
    .where(and(eq(billMembersTable.billId, billId), eq(billMembersTable.name, trimmedName)))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `"${trimmedName}" is already on this bill` });
    return;
  }
  const [member] = await db.insert(billMembersTable).values({ billId, name: trimmedName, color }).returning();

  if (linkedUserId != null) {
    const parsedLinkedUserId = parseInt(String(linkedUserId), 10);
    if (!isNaN(parsedLinkedUserId)) {
      const [alreadyInBill] = await db
        .select({ id: billUsersTable.id })
        .from(billUsersTable)
        .where(and(eq(billUsersTable.billId, billId), eq(billUsersTable.userId, parsedLinkedUserId)))
        .limit(1);
      if (!alreadyInBill) {
        await db.insert(billUsersTable).values({ billId, userId: parsedLinkedUserId, role: "member" });
        const [bill] = await db
          .select({ title: billsTable.title, ownerUserId: billsTable.ownerUserId })
          .from(billsTable)
          .where(eq(billsTable.id, billId))
          .limit(1);
        let addedBy: string | undefined;
        if (bill?.ownerUserId) {
          const [owner] = await db
            .select({ displayName: usersTable.displayName })
            .from(usersTable)
            .where(eq(usersTable.id, bill.ownerUserId))
            .limit(1);
          addedBy = owner?.displayName;
        }
        notifyUserBillsChanged(parsedLinkedUserId, {
          billTitle: bill?.title ?? undefined,
          addedBy,
        });
      }
    }
  }

  notifyBillChanged(billId);
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
  notifyBillChanged(billId);
  res.json(updated);
});

router.delete("/:userId", async (req, res) => {
  const billId = parseBillId(req);
  const userId = parseInt(String(req.params["userId"]), 10);
  await db.delete(billMembersTable)
    .where(and(eq(billMembersTable.id, userId), eq(billMembersTable.billId, billId)));
  notifyBillChanged(billId);
  res.status(204).send();
});

export default router;
