import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.patch("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { firstName, lastName } = req.body as { firstName?: unknown; lastName?: unknown };

  const incomingFirst = typeof firstName === "string" ? firstName.trim() || null : undefined;
  const incomingLast = typeof lastName === "string" ? lastName.trim() || null : undefined;

  if (incomingFirst === undefined && incomingLast === undefined) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [current] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const newFirst = incomingFirst !== undefined ? incomingFirst : current.firstName;
  const newLast = incomingLast !== undefined ? incomingLast : current.lastName;
  const newDisplay = [newFirst, newLast].filter(Boolean).join(" ") || current.displayName;

  const [updated] = await db
    .update(usersTable)
    .set({
      firstName: newFirst,
      lastName: newLast,
      displayName: newDisplay,
    })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({
    firstName: updated?.firstName ?? null,
    lastName: updated?.lastName ?? null,
    displayName: updated?.displayName ?? null,
  });
});

export default router;
