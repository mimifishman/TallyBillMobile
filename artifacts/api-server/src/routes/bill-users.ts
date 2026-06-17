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
  const { name, color, linkedUserId, linkedEmail } = req.body;
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

  let resolvedLinkedUserId: number | null = null;

  if (linkedUserId != null) {
    const parsed = parseInt(String(linkedUserId), 10);
    if (!isNaN(parsed)) resolvedLinkedUserId = parsed;
  } else if (linkedEmail && typeof linkedEmail === "string" && linkedEmail.trim()) {
    const [linkedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, linkedEmail.trim().toLowerCase()))
      .limit(1);
    if (!linkedUser) {
      res.status(422).json({ error: "No TallyBill account found with that email address" });
      return;
    }
    resolvedLinkedUserId = linkedUser.id;
  }

  const [member] = await db
    .insert(billMembersTable)
    .values({ billId, name: trimmedName, color, ...(resolvedLinkedUserId != null && { linkedUserId: resolvedLinkedUserId }) })
    .returning();

  if (resolvedLinkedUserId != null) {
    const [alreadyInBill] = await db
      .select({ id: billUsersTable.id })
      .from(billUsersTable)
      .where(and(eq(billUsersTable.billId, billId), eq(billUsersTable.userId, resolvedLinkedUserId)))
      .limit(1);
    if (!alreadyInBill) {
      await db.insert(billUsersTable).values({ billId, userId: resolvedLinkedUserId, role: "member" });
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
      notifyUserBillsChanged(resolvedLinkedUserId, {
        billTitle: bill?.title ?? undefined,
        addedBy,
      });
    }
  }

  notifyBillChanged(billId);
  res.status(201).json(member);
});

router.put("/:userId", async (req, res) => {
  const billId = parseBillId(req);
  const userId = parseInt(String(req.params["userId"]), 10);
  const { name, color, tipPercentOverride, linkedEmail } = req.body;

  const updateValues: {
    name?: string;
    color?: string;
    tipPercentOverride?: string | null;
    linkedUserId?: number | null;
  } = {
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color }),
    ...(tipPercentOverride !== undefined && {
      tipPercentOverride: tipPercentOverride === null ? null : String(tipPercentOverride),
    }),
  };

  if (linkedEmail !== undefined) {
    if (linkedEmail === null || (typeof linkedEmail === "string" && linkedEmail.trim() === "")) {
      updateValues.linkedUserId = null;
    } else if (typeof linkedEmail === "string") {
      const [linkedUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, linkedEmail.trim().toLowerCase()))
        .limit(1);
      if (!linkedUser) {
        res.status(422).json({ error: "No TallyBill account found with that email address" });
        return;
      }
      updateValues.linkedUserId = linkedUser.id;

      const [alreadyInBill] = await db
        .select({ id: billUsersTable.id })
        .from(billUsersTable)
        .where(and(eq(billUsersTable.billId, billId), eq(billUsersTable.userId, linkedUser.id)))
        .limit(1);
      if (!alreadyInBill) {
        await db.insert(billUsersTable).values({ billId, userId: linkedUser.id, role: "member" });
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
        notifyUserBillsChanged(linkedUser.id, {
          billTitle: bill?.title ?? undefined,
          addedBy,
        });
      }
    }
  }

  const [updated] = await db
    .update(billMembersTable)
    .set(updateValues)
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
  const memberId = parseInt(String(req.params["userId"]), 10);

  const [member] = await db
    .select({ linkedUserId: billMembersTable.linkedUserId })
    .from(billMembersTable)
    .where(and(eq(billMembersTable.id, memberId), eq(billMembersTable.billId, billId)))
    .limit(1);

  await db.delete(billMembersTable)
    .where(and(eq(billMembersTable.id, memberId), eq(billMembersTable.billId, billId)));

  if (member?.linkedUserId != null) {
    await db.delete(billUsersTable)
      .where(and(eq(billUsersTable.billId, billId), eq(billUsersTable.userId, member.linkedUserId)));
  }

  notifyBillChanged(billId);
  res.status(204).send();
});

export default router;
