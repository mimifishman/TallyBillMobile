import { Router } from "express";
import { revSentenceWord, isHebrew } from "../lib/auth.js";

const router = Router();

interface VeryfiLineItem {
  description: string;
  quantity: number | null;
  price: number | null;
  total: number | null;
}

interface VeryfiResponse {
  line_items?: VeryfiLineItem[];
  tax?: number | null;
  tip?: number | null;
  currency_code?: string | null;
}

router.post("/", async (req, res) => {
  const { imageBase64, fileName } = req.body;
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const clientId = process.env["VERYFI_CLIENT_ID"];
  const clientSecret = process.env["VERYFI_CLIENT_SECRET"];
  const username = process.env["VERYFI_USERNAME"];
  const apiKey = process.env["VERYFI_API_KEY"];

  if (!clientId || !clientSecret || !username || !apiKey) {
    res.status(500).json({ error: "OCR service not configured. Please set Veryfi API credentials." });
    return;
  }

  try {
    const veryfiRes = await fetch("https://api.veryfi.com/api/v8/partner/documents/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Id": clientId,
        "Authorization": `apikey ${username}:${apiKey}`,
        "X-Veryfi-Client-Id": clientId,
        "X-Veryfi-Client-Secret": clientSecret,
      },
      body: JSON.stringify({
        file_data: imageBase64,
        file_name: fileName || "receipt.jpg",
        tags: ["tallybill"],
        boost_mode: 1,
        async_mode: false,
      }),
    });

    if (!veryfiRes.ok) {
      const errText = await veryfiRes.text();
      res.status(500).json({ error: `OCR failed: ${errText}` });
      return;
    }

    const data = await veryfiRes.json() as VeryfiResponse;
    const lineItems = (data.line_items || []).map((item) => {
      let description = item.description || "";
      if (isHebrew(description)) {
        description = revSentenceWord(description);
      }
      const quantity = item.quantity ?? 1;
      const total = item.total ?? item.price ?? 0;
      const unitPrice = quantity > 0 ? total / quantity : total;
      return {
        description,
        quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        total: Math.round(total * 100) / 100,
      };
    }).filter((item) => item.description && item.total > 0);

    res.json({
      items: lineItems,
      taxAmount: data.tax ?? null,
      tipAmount: data.tip ?? null,
      currency: data.currency_code ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "OCR request failed" });
  }
});

export default router;
