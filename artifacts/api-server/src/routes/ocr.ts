import { Router } from "express";
import OpenAI from "openai";
import {
  normalizeLineItems,
  normalizeBillDiscount,
  normalizePrintedTotal,
  normalizeReceiptAmount,
  checkAgainstPrintedTotal,
  shouldApplyBillDiscount,
  type RawLineItem,
} from "../lib/receipt-line-items.js";
import { OCR_PROMPT } from "../lib/receipt-prompt.js";
import { prepareReceipt } from "../lib/receipt-image.js";

/**
 * Which vision model reads the receipts.
 *
 * Configuration rather than code, so trying a candidate is a setting and a
 * restart instead of a deploy, and so is rolling back off one. The model is NOT
 * taken from the request: this endpoint is open to guests, and a caller who
 * could name the model could name an expensive one.
 *
 * The model that actually ran comes back in an X-OCR-Model header, so an eval
 * run is labelled with what read the receipt rather than with what was
 * intended. Without that a sweep can silently score the same model twice.
 */
const OCR_MODEL = process.env["OCR_MODEL"] ?? "gpt-4o";
const OCR_TRANSLATE_MODEL = process.env["OCR_TRANSLATE_MODEL"] ?? "gpt-4o";

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
  printedTotal?: number | null;
  taxAmount?: unknown;
  tipAmount?: unknown;
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
      model: OCR_TRANSLATE_MODEL,
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

    res.setHeader("X-OCR-Model", OCR_MODEL);
    const completion = await openai.chat.completions.create({
      model: OCR_MODEL,
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
    const printedTotal = normalizePrintedTotal(parsed.printedTotal);
    const itemsTotal = Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

    // A footer discount is only passed on when taking it off is what agrees
    // with the receipt's own total. Otherwise it is the receipt restating a
    // saving already inside the line totals, and applying it would undercharge.
    const claimedDiscount = normalizeBillDiscount(parsed.billDiscount);
    const billDiscount = shouldApplyBillDiscount(itemsTotal, printedTotal, claimedDiscount)
      ? claimedDiscount
      : null;
    // The receipt's own total, checked against what was actually read. This
    // cannot fix a bad scan, but it can say one happened — which is the
    // difference between a wrong number shown confidently and one flagged.
    const check = checkAgainstPrintedTotal(lineItems, printedTotal, billDiscount);

    res.json({
      items: lineItems,
      billDiscount,
      printedTotal: check.printedTotal,
      itemsTotal: check.itemsTotal,
      reconciled: check.reconciled,
      // The app adds these to the bill and formats them with .toFixed(2), so
      // they go through the same normalizer as every other money field here.
      taxAmount: normalizeReceiptAmount(parsed.taxAmount),
      tipAmount: normalizeReceiptAmount(parsed.tipAmount),
      currency: parsed.currency ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `OCR request failed: ${message}` });
  }
});

export default router;
