import { Router } from "express";
import OpenAI from "openai";
import { normalizeLineItems, normalizeBillDiscount, type RawLineItem } from "../lib/receipt-line-items.js";
import { OCR_PROMPT } from "../lib/receipt-prompt.js";
import { prepareReceipt } from "../lib/receipt-image.js";

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

  try {
    const openai = getOpenAIClient();

    // Turn the photo the right way up before the model sees it. Phones record
    // rotation in an EXIF tag rather than in the pixels, and the model does not
    // honour it, so a receipt shot sideways is read sideways.
    const prepared = await prepareReceipt(Buffer.from(imageBase64, "base64"));
    const mimeType = prepared.rotated || !fileName?.toLowerCase().endsWith(".png")
      ? "image/jpeg"
      : "image/png";
    const dataUrl = `data:${mimeType};base64,${prepared.buffer.toString("base64")}`;

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
