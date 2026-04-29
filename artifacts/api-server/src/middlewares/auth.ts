import type { Request, Response, NextFunction } from "express";
import { getAuth, createClerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

async function getOrCreateUserByClerkId(clerkId: string) {
  const [byClerkId] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);
  if (byClerkId) return byClerkId;

  const clerkUser = await clerk.users.getUser(clerkId);
  const email =
    clerkUser.emailAddresses[0]?.emailAddress || `${clerkId}@clerk.user`;
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    "User";

  const [byEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (byEmail) {
    const [updated] = await db
      .update(usersTable)
      .set({ clerkId, displayName })
      .where(eq(usersTable.id, byEmail.id))
      .returning();
    return updated!;
  }

  const [newUser] = await db
    .insert(usersTable)
    .values({ email, clerkId, displayName })
    .returning();
  return newUser!;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  getOrCreateUserByClerkId(auth.userId)
    .then((user) => {
      req.user = { userId: user.id, email: user.email };
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "Server error" });
    });
}

export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  if (!auth.userId) {
    next();
    return;
  }
  getOrCreateUserByClerkId(auth.userId)
    .then((user) => {
      req.user = { userId: user.id, email: user.email };
      next();
    })
    .catch(() => {
      next();
    });
}
