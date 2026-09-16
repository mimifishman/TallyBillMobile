import { Router } from "express";
import OpenAI from "openai";
import { normalizeLineItems, normalizeBillDiscount, type RawLineItem } from "../lib/receipt-line-items.js";

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

interface AIReceiptResponse {
  items?: RawLineItem[];
  billDiscount?: number | null;
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
      "quantity": 2,
      "unitPrice": 4.99,
      "total": 9.98,
      "originalTotal": null,
      "discountLabel": null
    }
  ],
  "billDiscount": null,
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
- "total" is the amount charged for the WHOLE line, exactly as printed at the end of that line. It already accounts for the quantity. NEVER multiply a printed amount by the quantity.
- If the line shows only ONE amount, that amount is "total". A line reading "2  Beer  12.00" means quantity 2 and total 12.00 — it does NOT mean 24.00.
- Only when the line shows TWO amounts is the per-unit one "unitPrice". A line reading "2  Beer  6.00  12.00" means quantity 2, unitPrice 6.00, total 12.00.
- unitPrice = total / quantity. Always fill in "total"; never leave it null.
DISCOUNTS — receipts print these in several different ways, and missing one overcharges the person paying. Never skip one.
- A discount is any line with a negative amount, or any line labelled as a discount, promotion, happy hour, loyalty, member price, or a percentage off. In Hebrew it is usually "הנחה".
- CASE 1 — a discount printed directly BELOW a purchased item, usually with nothing in the quantity column, belongs to that item. Fold it in: "total" becomes the amount actually charged, "originalTotal" is the amount before the discount, and "discountLabel" is the discount's printed wording.
  Example: "1  Caesar Salad  57.00" followed by "25% Happy Hour  -14.00" is ONE item — total 43.00, originalTotal 57.00, discountLabel "25% Happy Hour".
- CASE 2 — some receipts print TWO amounts on the same item line: a full price and, in another column, the lower amount actually charged. Use the LOWER, already-charged amount as "total" and the higher one as "originalTotal". The discount is already applied, so do NOT subtract anything again, even if a discount is also named on an indented line below.
  Example: "TROPICAL BUSH   1   59.00   30.00" with "HH 29" indented below is ONE item — total 30.00, originalTotal 59.00, discountLabel "HH".
- CASE 3 — a discount printed AFTER the items subtotal, at the foot of the receipt, applies to the whole bill and not to any single item. Put its size as a POSITIVE number in "billDiscount" and leave every item unchanged.
- Never return a discount as an item of its own, and never return an item whose total is negative or zero.
- "originalTotal" and "discountLabel" must be null unless that specific item really was discounted.

MODIFIERS
- Lines marked ">>" or "<<", or indented under an item, are options chosen for the item above, such as "no spicy" or "extra beef". Add a priced modifier to the total of the item above it rather than listing it separately, and ignore one priced 0.00.

- taxAmount and tipAmount are the receipt-level amounts (use null if absent — do NOT confuse subtotal or total with tax).
- currency is the 3-letter ISO code (e.g. "USD", "ILS", "EUR"). Use null only if you genuinely cannot infer it from currency symbols, language, or store name.
- Preserve the order of items as they appear on the receipt, top to bottom.
- A line item description is text — never put a number or price into the description field.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

router.post("/translate", async (req, res) => {
  const { descriptions, targetLanguage } = req.body;
  if (!Array.isArray(descriptions) || descriptions.length === 0) {
    res.status(400).json({ error: "descriptions array is required" });
    return;
  }
  if (!targetLanguage || typeof targetLanguage !== "string") {
    res.status(400).json({ error: "targetLanguage is required" });
    return;
  }

  try {
    const openai = getOpenAIClient();
    const numberedList = descriptions.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_completion_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a translator specializing in restaurant menu and receipt items. Translate each item description into ${targetLanguage}. Preserve the meaning and keep translations concise (similar length to original). Return ONLY valid JSON with this exact structure: {"translations": ["translated item 1", "translated item 2", ...]}. The output array must have exactly the same number of items as the input, in the same order.`,
        },
        {
          role: "user",
          content: `Translate these receipt items into ${targetLanguage}:\n${numberedList}`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    if (!rawContent) {
      res.status(500).json({ error: "AI model returned an empty response." });
      return;
    }

    let parsed: { translations?: string[] };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ error: "Could not parse translations: no JSON found." });
        return;
      }
      parsed = JSON.parse(jsonMatch[0]) as { translations?: string[] };
    } catch {
      res.status(500).json({ error: "Could not parse translations: invalid JSON." });
      return;
    }

    const translations = parsed.translations;
    if (!Array.isArray(translations) || translations.length !== descriptions.length) {
      res.status(500).json({ error: "Translation result count does not match input count." });
      return;
    }

    res.json({ translations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Translation request failed: ${message}` });
  }
});

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
      response_format: { type: "json_object" },
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

    const lineItems = normalizeLineItems(parsed.items);

    res.json({
      items: lineItems,
      billDiscount: normalizeBillDiscount(parsed.billDiscount),
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
