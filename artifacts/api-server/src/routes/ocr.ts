import { Router } from "express";
import OpenAI from "openai";
import { OCR_PROMPT } from "../lib/receipt-prompt.js";
import { receiptDataUrl } from "../lib/receipt-image.js";
import { chatCompletion, RECEIPT_TOKEN_CEILING } from "../lib/model-call.js";
import {
  closerToReceipt,
  combineReadings,
  interpretReceipt,
  judgeReadings,
  looksCutOff,
  parseModelJson,
  wantsSecondOpinion,
  type Reading,
} from "../lib/receipt-reading.js";

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
/**
 * gpt-4o reads every receipt. gpt-5.4 was tried as the reader (PR #89) and
 * reverted the same day. Do not switch it back without solving this:
 *
 * On a tight-framed photo of the real Hebrew 306 receipt — the framing users
 * actually shoot — gpt-5.4 lost the first priced line (45.00) and then reported
 * a PRINTED TOTAL OF 285.00, a figure that is not on the paper (it says 330.00).
 * Its invented total matched its own items, so reconciliation passed, no
 * warning was shown, and the uncropped re-read never ran: a silent 45.00
 * undercharge, 3 scans in 6. gpt-4o read the same photo right 4 of 4.
 *
 * printedTotal is the independent check everything else stands on. A reader
 * that derives it from its own items instead of reading it off the receipt
 * switches every safety net off at once, however good its item names are
 * (gpt-5.4's were far better: 142 vs ~115 of 165 recognisable Hebrew names).
 */
const OCR_MODEL = process.env["OCR_MODEL"] ?? "gpt-4o";
const OCR_TRANSLATE_MODEL = process.env["OCR_TRANSLATE_MODEL"] ?? "gpt-4o";

/**
 * A second model, asked ONLY when the receipt says the first got it wrong.
 *
 * gpt-4o reads Hebrew receipts best of every model measured — 21 of 21 totals
 * and 21 of 21 tax, 2026-09-24 — so it stays the reader. But it drops two kinds
 * of discount that o4-mini gets right: a minus line under the item (US layout
 * 2, 0 of 3 against 3 of 3) and the French happy-hour ticket (0 of 3 against 2
 * of 3). o4-mini cannot be the reader itself: it added VAT to an Israeli bill
 * three times in three and ran past the 20-second budget on 8 of 21 Hebrew
 * scans.
 *
 * So gpt-4o reads every receipt, and o4-mini is asked only when gpt-4o's items
 * do not add up to the receipt's own printed total, only while time is left in
 * the budget, and its answer is kept only if IT adds up to the same printed
 * total. Tax, tip and currency always stay gpt-4o's. See receipt-reading.ts.
 *
 * Empty or "off" disables it.
 */
/**
 * gpt-5.4. Replit is retiring o4-mini (notice 2026-09-24). Its two proposed
 * replacements were measured in the real route on dev — second opinion,
 * reasoning effort low, US layout 2 sent as a JPEG like a phone photo, 12 scans
 * each:
 *   gpt-5.4        11/12 right, every scan 10.5-12.0s
 *   gpt-5.4-mini    9/12 right, 9.5-18.4s, one timeout
 *   o4-mini        10/10 right, 13.6-18.1s  (retiring)
 * Every miss was safe: the scan kept its "doesn't match" warning.
 * gpt-5.4 costs more per call than the mini, but it only runs on the rare
 * receipt whose items do not add up. Its tendency to add Israeli VAT (seen on
 * some Hebrew runs) never reaches a bill: tax is never taken from the second
 * reading, and the gap guard keeps it off Hebrew receipts.
 */
const OCR_SECOND_MODEL = (process.env["OCR_SECOND_MODEL"] ?? "gpt-5.4").trim();
const SECOND_OPINION_ON = OCR_SECOND_MODEL !== "" && OCR_SECOND_MODEL !== "off";
/**
 * How hard the second model thinks.
 *
 * "low", measured 2026-09-24 on Replit: US layout 2 came back right 3 of 3 in
 * 8-9.5 seconds, against 12-13 seconds at o4-mini's default. With gpt-4o's
 * first read that is about 13 seconds all in, inside the budget; at the
 * default it did not fit. The French happy-hour ticket is right only 1 of 3 at
 * low and takes 13-18 seconds, so it mostly still ends on the warning.
 */
const OCR_SECOND_EFFORT = (process.env["OCR_SECOND_EFFORT"] ?? "low") as "low" | "medium" | "high";
/**
 * The server's share of the 20-second scan budget. The rest is the phone
 * uploading the photo and receiving the answer.
 */
const OCR_BUDGET_MS = budgetFromEnv(process.env["OCR_BUDGET_MS"]);
/**
 * A mistyped setting must not turn into "no limit": NaN would make the deadline
 * check pass silently and the second call run unbounded, past the budget the
 * user was promised. Anything that is not a sensible number is the default.
 */
function budgetFromEnv(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1_000 && n <= 60_000 ? n : 17_000;
}

/**
 * Whether to drop the top quarter of the photo as a header.
 *
 * On by default — it was measured to help. "off" is for measuring whether it
 * still does: a photo framed tight on the items has no header, and the cut then
 * takes items instead (the uncropped re-read below exists because of that).
 */
const HEADER_CROP = (process.env["OCR_HEADER_CROP"] ?? "on").trim() !== "off";

/** Below this there is no point starting a second read; it cannot finish. */
const MIN_SECOND_OPINION_MS = 5_000;

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
    const completion = await chatCompletion(openai, {
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

/**
 * Put a prepared receipt to a model and return its raw reply.
 *
 * `effort` is only sent to the second model: a reasoning model accepts it and
 * gpt-4o rejects it. `deadlineMs` bounds the call and turns off the client's
 * automatic retries, which would otherwise spend the budget twice over.
 */
async function askForReceipt(
  openai: OpenAI,
  model: string,
  dataUrl: string,
  opts: { effort?: "low" | "medium" | "high"; deadlineMs?: number } = {},
): Promise<string> {
  const completion = await chatCompletion(
    openai,
    {
      model,
      // The second model is a reasoning model and accepts no temperature;
      // leaving it out saves the refused call chatCompletion would retry past.
      ...(opts.effort ? { reasoning_effort: opts.effort } : { temperature: 0 }),
      max_completion_tokens: RECEIPT_TOKEN_CEILING,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OCR_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            { type: "text", text: "Extract the line items, tax, tip, and currency from this receipt as JSON." },
          ],
        },
      ],
    },
    opts.deadlineMs ? { timeout: opts.deadlineMs, maxRetries: 0 } : undefined,
  );
  return completion.choices[0]?.message?.content ?? "";
}

router.post("/", async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const startedAt = Date.now();
  try {
    const openai = getOpenAIClient();

    // Turn the photo the right way up before the model sees it. Phones record
    // rotation in an EXIF tag rather than in the pixels, and the model does not
    // honour it, so a receipt shot sideways is read sideways.
    const photo = Buffer.from(imageBase64, "base64");
    const { dataUrl: croppedUrl, prepared } = await receiptDataUrl(photo, { crop: HEADER_CROP });
    // The image the reading on the bill came from. The second opinion must look
    // at the SAME picture: after an uncropped re-read wins, the cropped one is
    // missing the very lines being judged.
    let dataUrl = croppedUrl;

    res.setHeader("X-OCR-Model", OCR_MODEL);
    const firstRaw = await askForReceipt(openai, OCR_MODEL, croppedUrl);
    if (!firstRaw) {
      res.status(500).json({ error: "AI model returned an empty response." });
      return;
    }
    const firstParsed = parseModelJson(firstRaw);
    if (!firstParsed) {
      res.status(500).json({ error: "Could not parse receipt: the model did not return valid JSON." });
      return;
    }
    let first = interpretReceipt(firstParsed);

    // The header crop assumes the top quarter is the shop's name and address.
    // On a photo framed tight on the items it is items, and they are simply
    // gone. When the receipt says items are missing AND a crop happened, read
    // the photo again whole, with the same model, and keep whichever reading
    // the printed total agrees with more. See looksCutOff.
    if (prepared.croppedTop > 0 && looksCutOff(first)) {
      const left = OCR_BUDGET_MS - (Date.now() - startedAt);
      let outcome = "skipped-no-time";
      if (left >= MIN_SECOND_OPINION_MS) {
        try {
          const whole = await receiptDataUrl(photo, { crop: false });
          const raw = await askForReceipt(openai, OCR_MODEL, whole.dataUrl, { deadlineMs: left });
          const parsed = raw ? parseModelJson(raw) : null;
          if (!parsed) {
            outcome = "no-answer";
          } else {
            const uncropped = interpretReceipt(parsed);
            const better = closerToReceipt(first, uncropped);
            outcome = better === uncropped ? "used" : "not-closer";
            if (better === uncropped) dataUrl = whole.dataUrl;
            first = better;
          }
        } catch (err) {
          outcome = err instanceof Error && /timed? ?out|abort/i.test(err.message) ? "timeout" : "error";
          req.log?.warn({ err }, "uncropped re-read failed; keeping the cropped reading");
        }
      }
      res.setHeader("X-OCR-Uncropped", outcome);
    }

    // A second opinion, only when the receipt says the first reading is wrong
    // and only inside the time budget. Any failure here leaves the first
    // reading exactly as it would have been without this.
    let second: Reading | null = null;
    let secondNote: string | null = null;
    if (SECOND_OPINION_ON && wantsSecondOpinion(first)) {
      const left = OCR_BUDGET_MS - (Date.now() - startedAt);
      if (left < MIN_SECOND_OPINION_MS) {
        secondNote = "skipped-no-time";
      } else {
        try {
          const raw = await askForReceipt(openai, OCR_SECOND_MODEL, dataUrl, {
            effort: OCR_SECOND_EFFORT,
            deadlineMs: left,
          });
          const parsed = raw ? parseModelJson(raw) : null;
          second = parsed ? interpretReceipt(parsed) : null;
          if (!second) secondNote = "no-answer";
        } catch (err) {
          secondNote = err instanceof Error && /timed? ?out|abort/i.test(err.message) ? "timeout" : "error";
          req.log?.warn({ err, model: OCR_SECOND_MODEL }, "second opinion failed; keeping the first reading");
        }
      }
    }
    const verdict = judgeReadings(first, second);
    const bill = combineReadings(first, second, verdict);
    if (SECOND_OPINION_ON && wantsSecondOpinion(first)) {
      // Visible to the eval harness, so a run can say how often it happened.
      const outcome = verdict.use === "second" ? "used" : secondNote ?? verdict.why;
      res.setHeader("X-OCR-Second-Opinion", `${OCR_SECOND_MODEL}:${outcome}`);
    }

    res.json({
      items: bill.items,
      billDiscount: bill.billDiscount,
      printedTotal: bill.check.printedTotal,
      itemsTotal: bill.check.itemsTotal,
      reconciled: bill.check.reconciled,
      taxAmount: bill.taxAmount,
      tipAmount: bill.tipAmount,
      currency: bill.currency,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `OCR request failed: ${message}` });
  }
});

export default router;
