import { Router } from "express";
import OpenAI from "openai";

const router = Router();

let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
    if (!baseURL || !apiKey) {
      throw new Error("OCR service not configured.");
    }
    _openai = new OpenAI({ baseURL, apiKey });
  }
  return _openai;
}

interface AIReceiptItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
}

interface AIReceiptResponse {
  items?: AIReceiptItem[];
  taxAmount?: number | null;
  tipAmount?: number | null;
  currency?: string | null;
}

const OCR_PROMPT = `You are a receipt parser. Look at the receipt image and extract every purchased line item plus tax, tip, and currency.

Return ONLY valid JSON with this exact structure:
{
  "items": [
    {
      "description": "item name",
      "quantity": 1,
      "unitPrice": 9.99,
      "total": 9.99
    }
  ],
  "taxAmount": 1.50,
  "tipAmount": null,
  "currency": "USD"
}

Rules:
- Include EVERY purchased line item. Never skip a line item, even if some characters are unclear — read it to the best of your ability and use the most likely characters.
- Omit subtotals, totals, payment lines, store header/footer text, and order/receipt numbers.
- Preserve the original language and script of each item description exactly as printed (Hebrew, Arabic, Latin, etc.). Do not translate or transliterate.
- For right-to-left scripts (Hebrew, Arabic), preserve the visual character order as it appears on the receipt.
- quantity must be a positive number — use 1 if not shown on the receipt.
- unitPrice = total / quantity. If only one of unitPrice or total is visible, compute the other.
- taxAmount and tipAmount are the receipt-level amounts (use null if absent — do NOT confuse subtotal or total with tax).
- currency is the 3-letter ISO code (e.g. "USD", "ILS", "EUR"). Use null only if you genuinely cannot infer it from currency symbols, language, or store name.
- Preserve the order of items as they appear on the receipt, top to bottom.
- A line item description is text — never put a number or price into the description field.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

router.post("/", async (req, res) => {
  const { imageBase64, fileName } = req.body;
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const mimeType = fileName?.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  try {
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: OCR_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
            {
              type: "text",
              text: "Extract the line items, tax, tip, and currency from this receipt as JSON.",
            },
          ],
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    if (!rawContent) {
      res.status(500).json({ error: "AI model returned an empty response." });
      return;
    }

    let parsed: AIReceiptResponse;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ error: "Could not parse receipt: no JSON found in model response." });
        return;
      }
      parsed = JSON.parse(jsonMatch[0]) as AIReceiptResponse;
    } catch {
      res.status(500).json({ error: "Could not parse receipt: invalid JSON from model." });
      return;
    }

    const lineItems = (parsed.items || []).map((item) => {
      const description = item.description || "";
      const quantity = item.quantity ?? 1;
      const total = item.total ?? (item.unitPrice != null ? item.unitPrice * quantity : 0);
      const unitPrice = item.unitPrice ?? (quantity > 0 ? total / quantity : total);
      return {
        description,
        quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        total: Math.round(total * 100) / 100,
      };
    }).filter((item) => item.description && item.total > 0);

    res.json({
      items: lineItems,
      taxAmount: parsed.taxAmount ?? null,
      tipAmount: parsed.tipAmount ?? null,
      currency: parsed.currency ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `OCR request failed: ${message}` });
  }
});

export default router;
