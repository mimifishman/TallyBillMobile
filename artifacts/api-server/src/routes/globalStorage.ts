import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { billsTable, billUsersTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { requireAuth } from "../middlewares/auth.js";
import type { AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.post("/uploads/request-url", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const service = new ObjectStorageService();
    const { uploadURL, objectPath } = await service.getObjectEntityUploadURL();
    res.json({ uploadURL, objectPath });
  } catch (err) {
    console.error("Error generating upload URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/objects/uploads/:objectId", async (req, res) => {
  try {
    const objectPath = `/objects/uploads/${req.params["objectId"]}`;

    const [bill] = await db
      .select()
      .from(billsTable)
      .where(eq(billsTable.receiptImagePath, objectPath))
      .limit(1);

    if (!bill) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const joinCodeInput = String(
      req.query["joinCode"] ?? req.headers["x-join-code"] ?? "",
    )
      .trim()
      .toUpperCase();

    let authorized = false;

    if (joinCodeInput && joinCodeInput === bill.joinCode.toUpperCase()) {
      authorized = true;
    } else if (bill.isGuestBill && !bill.ownerUserId) {
      authorized = true;
    } else {
      const auth = getAuth(req);
      if (auth.userId) {
        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkId, auth.userId))
          .limit(1);
        if (user) {
          if (bill.ownerUserId === user.id) {
            authorized = true;
          } else {
            const [member] = await db
              .select()
              .from(billUsersTable)
              .where(
                and(
                  eq(billUsersTable.billId, bill.id),
                  eq(billUsersTable.userId, user.id),
                ),
              )
              .limit(1);
            if (member) authorized = true;
          }
        }
      }
    }

    if (!authorized) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const service = new ObjectStorageService();
    const signedUrl = await service.getSignedDownloadUrl(objectPath, 3600);
    res.redirect(302, signedUrl);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Not found" });
    } else {
      console.error("Error serving object:", err);
      res.status(500).json({ error: "Failed to serve object" });
    }
  }
});

export default router;
