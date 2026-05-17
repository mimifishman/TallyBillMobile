import { Router } from "express";
import { db } from "@workspace/db";
import { billsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import type { BillAccessRequest } from "../middlewares/billAccess.js";

const router = Router({ mergeParams: true });

router.post("/uploads/request-url", async (_req, res) => {
  try {
    const service = new ObjectStorageService();
    const { uploadURL, objectPath } = await service.getObjectEntityUploadURL();
    res.json({ uploadURL, objectPath });
  } catch (err) {
    console.error("Error generating upload URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/objects/uploads/:objectId", async (req: BillAccessRequest, res) => {
  try {
    const billId = req.billAccess?.billId;
    if (!billId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const objectPath = `/objects/uploads/${req.params["objectId"]}`;

    const [bill] = await db
      .select({ receiptImagePath: billsTable.receiptImagePath })
      .from(billsTable)
      .where(eq(billsTable.id, billId))
      .limit(1);

    if (!bill || bill.receiptImagePath !== objectPath) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const service = new ObjectStorageService();
    const url = await service.getSignedDownloadUrl(objectPath, 3600);
    res.json({ url });
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Not found" });
    } else {
      console.error("Error generating download URL:", err);
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  }
});

export default router;
