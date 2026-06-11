import { Router } from "express";
import { db } from "@workspace/db";
import { circlesTable, circleMembersTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const circles = await db
    .select()
    .from(circlesTable)
    .where(eq(circlesTable.ownerUserId, userId));

  const circleIds = circles.map((c) => c.id);
  const rawMembers =
    circleIds.length > 0
      ? await db
          .select()
          .from(circleMembersTable)
          .where(inArray(circleMembersTable.circleId, circleIds))
      : [];

  const membersByCircle = new Map<number, typeof rawMembers>();
  for (const m of rawMembers) {
    const arr = membersByCircle.get(m.circleId);
    if (arr) arr.push(m);
    else membersByCircle.set(m.circleId, [m]);
  }

  const result = circles.map((c) => ({
    ...c,
    members: membersByCircle.get(c.id) ?? [],
  }));

  res.json(result);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [circle] = await db
    .insert(circlesTable)
    .values({ ownerUserId: userId, name: name.trim() })
    .returning();
  res.status(201).json({ ...circle, members: [] });
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const circleId = parseInt(String(req.params["id"]), 10);
  if (isNaN(circleId)) {
    res.status(400).json({ error: "Invalid circle id" });
    return;
  }
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(and(eq(circlesTable.id, circleId), eq(circlesTable.ownerUserId, userId)))
    .limit(1);
  if (!circle) {
    res.status(404).json({ error: "Circle not found" });
    return;
  }
  const [updated] = await db
    .update(circlesTable)
    .set({ name: name.trim() })
    .where(eq(circlesTable.id, circleId))
    .returning();
  res.json(updated);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const circleId = parseInt(String(req.params["id"]), 10);
  if (isNaN(circleId)) {
    res.status(400).json({ error: "Invalid circle id" });
    return;
  }
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(and(eq(circlesTable.id, circleId), eq(circlesTable.ownerUserId, userId)))
    .limit(1);
  if (!circle) {
    res.status(404).json({ error: "Circle not found" });
    return;
  }
  await db.delete(circlesTable).where(eq(circlesTable.id, circleId));
  res.status(204).send();
});

router.post("/:id/members", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const circleId = parseInt(String(req.params["id"]), 10);
  if (isNaN(circleId)) {
    res.status(400).json({ error: "Invalid circle id" });
    return;
  }
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(and(eq(circlesTable.id, circleId), eq(circlesTable.ownerUserId, userId)))
    .limit(1);
  if (!circle) {
    res.status(404).json({ error: "Circle not found" });
    return;
  }
  const { name, email } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const trimmedName = name.trim();
  const [existing] = await db
    .select({ id: circleMembersTable.id })
    .from(circleMembersTable)
    .where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.name, trimmedName)))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `"${trimmedName}" is already in this circle` });
    return;
  }
  let linkedUserId: number | null = null;
  if (email && typeof email === "string" && email.trim()) {
    const [linkedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.trim().toLowerCase()))
      .limit(1);
    if (linkedUser) linkedUserId = linkedUser.id;
  }
  const [member] = await db
    .insert(circleMembersTable)
    .values({ circleId, name: trimmedName, linkedUserId })
    .returning();
  res.status(201).json(member);
});

router.delete("/:id/members/:memberId", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const circleId = parseInt(String(req.params["id"]), 10);
  const memberId = parseInt(String(req.params["memberId"]), 10);
  if (isNaN(circleId) || isNaN(memberId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(and(eq(circlesTable.id, circleId), eq(circlesTable.ownerUserId, userId)))
    .limit(1);
  if (!circle) {
    res.status(404).json({ error: "Circle not found" });
    return;
  }
  await db
    .delete(circleMembersTable)
    .where(
      and(eq(circleMembersTable.id, memberId), eq(circleMembersTable.circleId, circleId))
    );
  res.status(204).send();
});

export default router;
