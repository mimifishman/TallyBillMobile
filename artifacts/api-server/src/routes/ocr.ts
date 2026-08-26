import { Router } from "express";
import { getOpenAIClient, scanReceipt, TRANSLATE_MODEL } from "../lib/receipt-scan";

const router = Router();

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
      model: TRANSLATE_MODEL,
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
  const { imageBase64, platform, forceRecheck } = req.body;
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const startedAt = Date.now();

  try {
    const outcome = await scanReceipt(Buffer.from(imageBase64, "base64"), {
      forceRecheck: forceRecheck === true,
    });

    // Logged per scan so the iOS/Android accuracy gap can be diagnosed from
    // real traffic rather than guessed at.
    req.log?.info(
      {
        ocr: {
          platform: platform ?? "unknown",
          ...outcome.diagnostics,
          ...outcome.timings,
          items: outcome.items.length,
          lowConfidence: outcome.items.filter((item) => item.confidence === "low").length,
          reconciled: outcome.reconciled,
          legibility: outcome.legibility,
        },
      },
      "ocr scan complete",
    );

    res.json({
      items: outcome.items,
      taxAmount: outcome.taxAmount,
      tipAmount: outcome.tipAmount,
      currency: outcome.currency,
      printedTotal: outcome.printedTotal,
      reconciled: outcome.reconciled,
      legibility: outcome.legibility,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log?.error(
      { err, ocr: { platform: platform ?? "unknown", totalMs: Date.now() - startedAt } },
      "ocr scan failed",
    );
    res.status(500).json({ error: `OCR request failed: ${message}` });
  }
});

export default router;
