import { Router } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

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

router.get("/objects/uploads/:objectId", async (req, res) => {
  try {
    const service = new ObjectStorageService();
    const objectPath = `/objects/uploads/${req.params["objectId"]}`;
    const objectFile = await service.getObjectEntityFile(objectPath);
    const response = await service.downloadObject(objectFile, 86400);

    const headers = Object.fromEntries(response.headers.entries());
    res.set(headers);

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
        pump();
      };
      pump();
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Not found" });
    } else {
      console.error("Error serving object:", err);
      res.status(500).json({ error: "Failed to retrieve object" });
    }
  }
});

export default router;
