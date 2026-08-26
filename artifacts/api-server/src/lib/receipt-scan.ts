import OpenAI from "openai";
import { enhanceReceipt, toDataUrls } from "./receipt-image";

/**
 * The receipt scan pipeline: enhance the photo, read it with a vision model,
 * normalize the line items, and check them against the total printed on the
 * receipt.
 *
 * Kept out of the route so the eval harness (scripts/ocr-eval.ts) exercises
 * exactly the same code path the app does — a harness that reimplements the
 * pipeline stops predicting the app's behaviour the moment either one changes.
 */

/**
 * Model used to read receipts.  Configurable so it can be changed without a
 * deploy — but pick it on three axes, not one: English accuracy, Hebrew
 * accuracy, and p95 latency.  A scan has a ~20s end-to-end budget, so a more
 * accurate but slower model is the wrong trade here.
 */
export const OCR_MODEL = process.env["OCR_MODEL"] ?? "gpt-4o";
export const TRANSLATE_MODEL = process.env["OCR_TRANSLATE_MODEL"] ?? OCR_MODEL;

/**
 * Sized against the scan budget rather than generously: one attempt plus one
 * retry is the ceiling that still fits ~20s end to end.  A 45s timeout with two
 * retries would silently permit a two-minute scan.
 */
const OCR_TIMEOUT_MS = Number(process.env["OCR_TIMEOUT_MS"] ?? 15_000);
const OCR_MAX_RETRIES = Number(process.env["OCR_MAX_RETRIES"] ?? 1);

/**
 * The reconciliation second pass only runs if the first call came back this
 * quickly.  Users must never wait past the budget just to reconcile a bill —
 * past this point we flag the mismatch and let them re-check on demand.
 */
const RECONCILE_BUDGET_MS = Number(process.env["OCR_RECONCILE_BUDGET_MS"] ?? 8_000);

/** A receipt is considered to add up within a couple of cents, or 1%. */
const RECONCILE_TOLERANCE_ABS = 0.02;
const RECONCILE_TOLERANCE_REL = 0.01;

/**
 * Strict JSON-schema responses guarantee the shape and remove the need to
 * fish JSON out of the text.  Off by default because it depends on gateway
 * support — verify against the configured gateway, then enable.
 */
const USE_JSON_SCHEMA = process.env["OCR_JSON_SCHEMA"] === "1";

const MAX_OUTPUT_TOKENS = 4096;

let _openai: OpenAI | null = null;
export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
    if (!baseURL || !apiKey) {
      throw new Error("OCR service not configured.");
    }
    _openai = new OpenAI({
      baseURL,
      apiKey,
      timeout: OCR_TIMEOUT_MS,
      maxRetries: OCR_MAX_RETRIES,
    });
  }
  return _openai;
}

export type Confidence = "high" | "low";
export type Legibility = "good" | "poor";

interface AIReceiptItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  confidence?: Confidence | null;
}

interface AIReceiptResponse {
  items?: AIReceiptItem[];
  taxAmount?: number | null;
  tipAmount?: number | null;
  currency?: string | null;
  printedSubtotal?: number | null;
  printedTotal?: number | null;
  legibility?: Legibility | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: Confidence;
}

const OCR_PROMPT = `You are a receipt parser. Look at the receipt image and extract every purchased line item plus tax, tip, and currency.

Return ONLY valid JSON with this exact structure:
{
  "items": [
    {
      "description": "item name",
      "quantity": 1,
      "unitPrice": 9.99,
      "total": 9.99,
      "confidence": "high"
    }
  ],
  "taxAmount": 1.50,
  "tipAmount": null,
  "currency": "USD",
  "printedSubtotal": 42.50,
  "printedTotal": 46.75,
  "legibility": "good"
}

Rules:
- Include EVERY purchased line item. Never skip a line item, even if some characters are unclear — read it to the best of your ability and use the most likely characters.
- Omit subtotals, totals, payment lines, store header/footer text, and order/receipt numbers.
- quantity must be a positive number — use 1 if not shown on the receipt.
- unitPrice = total / quantity. If only one of unitPrice or total is visible, compute the other.
- Include items priced at zero (comped, free, or included lines) — they are real items. Use 0 for their price.
- taxAmount and tipAmount are the receipt-level amounts (use null if absent — do NOT confuse subtotal or total with tax).
- currency is the 3-letter ISO code (e.g. "USD", "ILS", "EUR"). Use null only if you genuinely cannot infer it from currency symbols, language, or store name.
- Preserve the order of items as they appear on the receipt, top to bottom.
- A line item description is text — never put a number or price into the description field.

Confidence:
- "confidence" is "high" only when you are certain of both the description and the price.
- Use "low" whenever any character was faint, smudged, ambiguous, or partially cut off, or when you had to guess between similar characters or digits.
- Be liberal with "low" on non-Latin scripts. A flagged item the user glances at is far better than a confident wrong one.

Printed totals (used as an independent check — accuracy here matters):
- "printedSubtotal" and "printedTotal" must be READ OFF the receipt exactly as printed. Never compute them by adding up the items — that defeats their purpose.
- Use null for either one if it is not printed on the receipt or is not legible. Do not guess.
- "legibility" is "poor" if the receipt is faded, blurred, or cut off badly enough that you had to guess at multiple items; otherwise "good".

Language:
- Receipts may be in any language. English and Hebrew are the most common.
- Preserve the original language and script of each item description exactly as printed (Hebrew, Arabic, Latin, etc.). Do NOT translate, transliterate, or "correct" a description — translation is a separate step and the original must survive intact.
- For right-to-left scripts (Hebrew, Arabic), preserve the visual character order as it appears on the receipt.
- Column order is not fixed. On right-to-left receipts the description and price columns are mirrored compared with English. Match each price to the item printed on its own line — never assume the price is on a particular side.
- Numbers and prices read left-to-right even inside right-to-left text. Never return a reversed price.

- Return ONLY the JSON object, no markdown fences, no commentary.`;

const SLICE_NOTE = `
The images are overlapping horizontal bands of ONE receipt, in order from top to bottom. Read them as a single receipt: an item appearing in the overlap between two bands must be returned only once.`;

const RECEIPT_JSON_SCHEMA = {
  name: "receipt",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "items",
      "taxAmount",
      "tipAmount",
      "currency",
      "printedSubtotal",
      "printedTotal",
      "legibility",
    ],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "quantity", "unitPrice", "total", "confidence"],
          properties: {
            description: { type: "string" },
            quantity: { type: ["number", "null"] },
            unitPrice: { type: ["number", "null"] },
            total: { type: ["number", "null"] },
            confidence: { type: "string", enum: ["high", "low"] },
          },
        },
      },
      taxAmount: { type: ["number", "null"] },
      tipAmount: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      printedSubtotal: { type: ["number", "null"] },
      printedTotal: { type: ["number", "null"] },
      legibility: { type: ["string", "null"], enum: ["good", "poor", null] },
    },
  },
} as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseJsonResponse(rawContent: string): AIReceiptResponse {
  // Strict JSON-schema mode returns clean JSON; the brace match is the fallback
  // for plain json_object mode, where a model can still wrap it in prose.
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse receipt: no JSON found in model response.");
  }
  try {
    return JSON.parse(jsonMatch[0]) as AIReceiptResponse;
  } catch {
    throw new Error("Could not parse receipt: invalid JSON from model.");
  }
}

/**
 * Reconcile quantity/unitPrice/total, which the model may report only partially.
 *
 * Zero-priced lines are kept: comped and included items are real, and silently
 * dropping them makes the bill look complete when it is not.  Only genuinely
 * empty rows are discarded.
 */
function normalizeItems(parsed: AIReceiptResponse): LineItem[] {
  return (parsed.items ?? [])
    .map((item) => {
      const description = item.description || "";
      const quantity = item.quantity ?? 1;
      const total = item.total ?? (item.unitPrice != null ? item.unitPrice * quantity : 0);
      const unitPrice = item.unitPrice ?? (quantity > 0 ? total / quantity : total);
      return {
        description,
        quantity,
        unitPrice: round2(unitPrice),
        total: round2(total),
        confidence: item.confidence === "low" ? ("low" as const) : ("high" as const),
      };
    })
    .filter((item) => item.description.trim().length > 0);
}

interface Reconciliation {
  /** true = checked and matches, false = checked and off, null = not checked. */
  reconciled: boolean | null;
  /** The figure printed on the receipt that the items were compared against. */
  expected: number | null;
  itemsTotal: number;
}

/**
 * Compare the extracted items against a total printed on the receipt.
 *
 * This is advisory only.  Plenty of receipts have a torn or illegible total,
 * and when there is nothing to compare against we say so (`null`) rather than
 * reporting a failure — the scan is not worse for it, and the user should not
 * see a warning about it.
 */
function reconcile(items: LineItem[], parsed: AIReceiptResponse): Reconciliation {
  const itemsTotal = round2(items.reduce((sum, item) => sum + item.total, 0));

  const matches = (expected: number, actual: number): boolean => {
    const tolerance = Math.max(
      RECONCILE_TOLERANCE_ABS,
      Math.abs(expected) * RECONCILE_TOLERANCE_REL,
    );
    return Math.abs(expected - actual) <= tolerance;
  };

  if (parsed.printedSubtotal != null) {
    return {
      reconciled: matches(parsed.printedSubtotal, itemsTotal),
      expected: parsed.printedSubtotal,
      itemsTotal,
    };
  }

  if (parsed.printedTotal != null) {
    const withExtras = round2(itemsTotal + (parsed.taxAmount ?? 0) + (parsed.tipAmount ?? 0));
    return {
      reconciled: matches(parsed.printedTotal, withExtras),
      expected: parsed.printedTotal,
      itemsTotal,
    };
  }

  return { reconciled: null, expected: null, itemsTotal };
}

/** One extraction call. `followUp` drives the optional reconciliation retry. */
async function extract(
  openai: OpenAI,
  dataUrls: string[],
  followUp?: string,
): Promise<AIReceiptResponse> {
  const systemPrompt = dataUrls.length > 1 ? OCR_PROMPT + SLICE_NOTE : OCR_PROMPT;
  const instruction =
    followUp ?? "Extract the line items, tax, tip, and currency from this receipt as JSON.";

  const completion = await openai.chat.completions.create({
    model: OCR_MODEL,
    temperature: 0,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    response_format: USE_JSON_SCHEMA
      ? { type: "json_schema", json_schema: RECEIPT_JSON_SCHEMA as never }
      : { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          ...dataUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
          { type: "text" as const, text: instruction },
        ],
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content ?? "";
  if (!rawContent) {
    throw new Error("AI model returned an empty response.");
  }
  return parseJsonResponse(rawContent);
}

function mismatchFollowUp(expected: number, actual: number): string {
  return [
    `Your previous extraction of this receipt summed to ${actual.toFixed(2)},`,
    `but the receipt shows ${expected.toFixed(2)}.`,
    "Read the receipt again carefully. Look for line items you missed entirely,",
    "prices you misread, and quantities you got wrong.",
    "Return the corrected JSON in the same format.",
  ].join(" ");
}

export interface ScanOutcome {
  items: LineItem[];
  taxAmount: number | null;
  tipAmount: number | null;
  currency: string | null;
  printedTotal: number | null;
  reconciled: boolean | null;
  legibility: Legibility | null;
  timings: { enhanceMs: number; modelMs: number; totalMs: number };
  diagnostics: {
    model: string;
    slices: number;
    sourceWidth: number;
    sourceHeight: number;
    sourceBytes: number;
    /** Whether the advisory second pass actually ran. */
    rechecked: boolean;
    itemsTotal: number;
  };
}

/**
 * Read a receipt photo end to end.
 *
 * `forceRecheck` bypasses the latency gate on the reconciliation second pass —
 * used by the "Recheck receipt" action, where the user has seen the mismatch
 * and chosen to spend the extra time.
 */
export async function scanReceipt(
  input: Buffer,
  { forceRecheck = false }: { forceRecheck?: boolean } = {},
): Promise<ScanOutcome> {
  const startedAt = Date.now();
  const openai = getOpenAIClient();

  const enhanced = await enhanceReceipt(input);
  const dataUrls = toDataUrls(enhanced);

  const modelStartedAt = Date.now();
  let parsed = await extract(openai, dataUrls);
  const modelMs = Date.now() - modelStartedAt;

  let items = normalizeItems(parsed);
  let check = reconcile(items, parsed);
  let rechecked = false;

  // Advisory second pass. Only worth the user's time when the receipt actually
  // disagrees with the items AND there is budget left — otherwise the mismatch
  // is surfaced in the UI with a re-check they can opt into.
  if (check.reconciled === false && (forceRecheck || modelMs < RECONCILE_BUDGET_MS)) {
    try {
      const retryParsed = await extract(
        openai,
        dataUrls,
        mismatchFollowUp(check.expected ?? 0, check.itemsTotal),
      );
      const retryItems = normalizeItems(retryParsed);
      const retryCheck = reconcile(retryItems, retryParsed);
      rechecked = true;
      if (retryCheck.reconciled === true) {
        parsed = retryParsed;
        items = retryItems;
        check = retryCheck;
      }
    } catch {
      // Best effort only — a failed re-check must never fail the scan.
    }
  }

  return {
    items,
    taxAmount: parsed.taxAmount ?? null,
    tipAmount: parsed.tipAmount ?? null,
    currency: parsed.currency ?? null,
    printedTotal: parsed.printedTotal ?? parsed.printedSubtotal ?? null,
    reconciled: check.reconciled,
    legibility: parsed.legibility ?? null,
    timings: {
      enhanceMs: enhanced.durationMs,
      modelMs,
      totalMs: Date.now() - startedAt,
    },
    diagnostics: {
      model: OCR_MODEL,
      slices: enhanced.slices.length,
      sourceWidth: enhanced.source.width,
      sourceHeight: enhanced.source.height,
      sourceBytes: enhanced.source.bytes,
      rechecked,
      itemsTotal: check.itemsTotal,
    },
  };
}
