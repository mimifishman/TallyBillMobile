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

const TRANSCRIPTION_PROMPT = `You are a receipt transcriber. Your only job is to copy the text from the receipt image exactly as it appears, line by line.

Rules:
- Copy every character exactly as printed. Do not translate, interpret, or rephrase anything.
- Preserve the original language and script (Hebrew, Arabic, Latin, etc.) character for character.
- If a character is unclear or you cannot read it with confidence, output "?" for that character. Never guess or invent a character.
- Include every line on the receipt: item names, quantities, prices, totals, tax lines, headers, footers — everything.
- Output plain text only. No JSON, no markdown, no commentary.
- Preserve line order top to bottom as it appears on the receipt; preserve character order within each line exactly as printed (including right-to-left scripts).`;

const PARSE_PROMPT = `You are a receipt parser. You will receive a verbatim text transcription of a receipt. Parse it into structured JSON.

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
- Include every purchased item; omit subtotals, totals, and payment lines.
- quantity must be a positive number (use 1 if not shown).
- unitPrice = total / quantity.
- taxAmount and tipAmount are the receipt-level amounts (null if absent).
- currency is the 3-letter ISO code (null if unclear).
- Return null for any numeric field you cannot determine.
- Return ONLY the JSON object, no markdown, no commentary.
- Preserve the exact order of items as they appear in the transcription, top to bottom.
- Preserve item descriptions exactly as transcribed, including any "?" placeholders for unclear characters. Do not attempt to correct or complete them.`;

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

    const transcriptionCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: TRANSCRIPTION_PROMPT,
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
              text: "Transcribe this receipt exactly as it appears.",
            },
          ],
        },
      ],
    });

    const transcribedText = transcriptionCompletion.choices[0]?.message?.content ?? "";
    if (!transcribedText) {
      res.status(500).json({ error: "AI model returned an empty transcription." });
      return;
    }

    const parseCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: PARSE_PROMPT,
        },
        {
          role: "user",
          content: `Parse this receipt transcription into JSON:\n\n${transcribedText}`,
        },
      ],
    });

    const rawContent = parseCompletion.choices[0]?.message?.content ?? "";
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
