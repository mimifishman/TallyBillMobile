/**
 * One receipt scan, start to finish: every model call the route makes, in the
 * order and with the time limits the route makes them.
 *
 * Kept out of the route so the eval harness's --local mode runs exactly this,
 * rather than a copy that drifts. It used to be a single gpt-4o read, which
 * meant a --local score never saw the uncropped re-read, the second opinion,
 * or the names reading.
 *
 * Three readings can run AT THE SAME TIME, all started the moment the photo is
 * prepared:
 *
 *   1. gpt-4o on the photo with its header cut off — the reading the bill comes from.
 *   2. gpt-4o on the WHOLE photo, only when a header was cut. It is kept only if
 *      reading 1 comes up short of the printed total (the cut took items), and
 *      is cancelled otherwise. It used to be started only after reading 1 had
 *      finished and failed. On a long receipt each read takes about 9 seconds,
 *      so the two in a row came to 18-20 seconds and the second ran out of time
 *      on 2 of 6 scans of the user's 16-line receipt — which then went on the
 *      bill 358.00 short, its first four lines missing.
 *   3. The names reading (receipt-names.ts), which only ever changes words.
 *
 * Then, as before and only when the receipt says a discount was missed, the
 * second opinion.
 */
import type OpenAI from "openai";
import { chatCompletion, RECEIPT_TOKEN_CEILING } from "./model-call";
import { OCR_PROMPT } from "./receipt-prompt";
import { receiptDataUrl, receiptStrips } from "./receipt-image";
import { applyNames, NAMES_PROMPT, parseNameLines, type NameLine } from "./receipt-names";
import {
  closerToReceipt,
  combineReadings,
  interpretReceipt,
  judgeReadings,
  looksCutOff,
  parseModelJson,
  wantsSecondOpinion,
  type Reading,
} from "./receipt-reading";

export type Effort = "low" | "medium" | "high";

export interface ScanConfig {
  /** Reads every receipt, and is the only source of money. */
  model: string;
  /** Asked only about a missed discount. null turns it off. */
  secondModel: string | null;
  secondEffort: Effort;
  /** Reads item names only. null turns it off. */
  namesModel: string | null;
  /** Sent only to a reasoning model; null for gpt-4o, which rejects it. */
  namesEffort: Effort | null;
  /** The server's share of the 20-second budget. */
  budgetMs: number;
  /** How long, from the start of the scan, the names reading may take. */
  namesBudgetMs: number;
  headerCrop: boolean;
}

export interface ScanResult {
  bill: Reading;
  /** Response headers describing what happened, for the eval to report. */
  notes: Record<string, string>;
}

/** Below this there is no point starting a second read; it cannot finish. */
const MIN_SECOND_OPINION_MS = 5_000;

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
}

function failure(err: unknown): string {
  if (err instanceof Error && /abort/i.test(err.name + err.message)) return "cancelled";
  return err instanceof Error && /timed? ?out/i.test(err.message) ? "timeout" : "error";
}

interface CallOptions {
  effort?: Effort | null;
  deadlineMs?: number;
  signal?: AbortSignal;
}

/**
 * `effort` is only sent to a reasoning model; gpt-4o rejects it. `deadlineMs`
 * bounds the call and turns off the client's automatic retries, which would
 * otherwise spend the budget twice over.
 */
function requestOptions(opts: CallOptions): OpenAI.RequestOptions | undefined {
  if (!opts.deadlineMs && !opts.signal) return undefined;
  return {
    ...(opts.deadlineMs ? { timeout: Math.max(1, Math.round(opts.deadlineMs)), maxRetries: 0 } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  };
}

/** Put a prepared receipt to a model and return its raw reply. */
export async function askForReceipt(
  openai: OpenAI,
  model: string,
  dataUrl: string,
  opts: CallOptions = {},
): Promise<string> {
  const completion = await chatCompletion(
    openai,
    {
      model,
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
    requestOptions(opts),
  );
  return completion.choices[0]?.message?.content ?? "";
}

/** The names reading: every strip, in order, in one request. */
async function askForNames(
  openai: OpenAI,
  model: string,
  strips: string[],
  opts: CallOptions,
): Promise<NameLine[] | null> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  strips.forEach((url, k) => {
    content.push({ type: "text", text: `Strip ${k + 1} of ${strips.length}:` });
    content.push({ type: "image_url", image_url: { url, detail: "high" } });
  });
  content.push({ type: "text", text: "Copy every item line's name and amount as JSON." });
  const completion = await chatCompletion(
    openai,
    {
      model,
      ...(opts.effort ? { reasoning_effort: opts.effort } : { temperature: 0 }),
      max_completion_tokens: RECEIPT_TOKEN_CEILING,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NAMES_PROMPT },
        { role: "user", content },
      ],
    },
    requestOptions(opts),
  );
  return parseNameLines(completion.choices[0]?.message?.content ?? "");
}

/**
 * Scan one receipt photo. Throws only when the MAIN reading fails; every other
 * reading failing leaves the bill as the main reading made it.
 */
export async function scanReceipt(
  openai: OpenAI,
  photo: Buffer,
  config: ScanConfig,
  warn: (err: unknown, message: string) => void = () => {},
): Promise<ScanResult> {
  const startedAt = Date.now();
  const left = () => config.budgetMs - (Date.now() - startedAt);
  const notes: Record<string, string> = { "X-OCR-Model": config.model };

  // Both preparations at once. The whole photo is needed anyway for the
  // names strips, and — when a header is cut — for the uncropped read.
  const [croppedPrep, wholePrep] = await Promise.all([
    receiptDataUrl(photo, { crop: config.headerCrop }),
    receiptDataUrl(photo, { crop: false }),
  ]);
  const cropped = croppedPrep.prepared.croppedTop > 0;
  // The image the reading on the bill came from. The second opinion must look
  // at the SAME picture: after an uncropped read wins, the cropped one is
  // missing the very lines being judged.
  let dataUrl = croppedPrep.dataUrl;

  const cancelWhole = new AbortController();
  const cancelNames = new AbortController();
  const wholeCall = cropped
    ? settle(askForReceipt(openai, config.model, wholePrep.dataUrl, { deadlineMs: left(), signal: cancelWhole.signal }))
    : null;
  const namesCall = config.namesModel
    ? settle(
        receiptStrips(wholePrep.prepared.buffer).then((strips) =>
          strips.length === 0
            ? null
            : askForNames(openai, config.namesModel!, strips, {
                effort: config.namesEffort,
                deadlineMs: Math.max(1, config.namesBudgetMs - (Date.now() - startedAt)),
                signal: cancelNames.signal,
              }),
        ),
      )
    : null;

  try {
    const firstRaw = await askForReceipt(openai, config.model, croppedPrep.dataUrl);
    if (!firstRaw) throw new Error("AI model returned an empty response.");
    const firstParsed = parseModelJson(firstRaw);
    if (!firstParsed) throw new Error("Could not parse receipt: the model did not return valid JSON.");
    let first = interpretReceipt(firstParsed);

    // The header crop assumes the top quarter is the shop's name and address.
    // On a photo framed tight on the items, or a long receipt with a short
    // header, it is items. When the receipt says items are missing, the whole
    // photo's reading — already under way — is compared, and whichever the
    // printed total agrees with more is kept. See looksCutOff.
    if (wholeCall && looksCutOff(first)) {
      const settled = await wholeCall;
      let outcome: string;
      if (!settled.ok) {
        outcome = failure(settled.error);
        warn(settled.error, "uncropped read failed; keeping the cropped reading");
      } else {
        const parsed = settled.value ? parseModelJson(settled.value) : null;
        if (!parsed) {
          outcome = "no-answer";
        } else {
          const uncropped = interpretReceipt(parsed);
          const better = closerToReceipt(first, uncropped);
          outcome = better === uncropped ? "used" : "not-closer";
          if (better === uncropped) dataUrl = wholePrep.dataUrl;
          first = better;
        }
      }
      notes["X-OCR-Uncropped"] = outcome;
    } else {
      // The cropped reading is fine; stop paying for the whole-photo one.
      cancelWhole.abort();
    }

    // A second opinion, only when the receipt says a discount was missed and
    // only inside the time budget. Any failure leaves the first reading as is.
    let second: Reading | null = null;
    let secondNote: string | null = null;
    const secondWanted = config.secondModel !== null && wantsSecondOpinion(first);
    if (secondWanted) {
      if (left() < MIN_SECOND_OPINION_MS) {
        secondNote = "skipped-no-time";
      } else {
        try {
          const raw = await askForReceipt(openai, config.secondModel!, dataUrl, {
            effort: config.secondEffort,
            deadlineMs: left(),
          });
          const parsed = raw ? parseModelJson(raw) : null;
          second = parsed ? interpretReceipt(parsed) : null;
          if (!second) secondNote = "no-answer";
        } catch (err) {
          secondNote = failure(err);
          warn(err, "second opinion failed; keeping the first reading");
        }
      }
    }
    const verdict = judgeReadings(first, second);
    let bill = combineReadings(first, second, verdict);
    if (secondWanted) {
      const outcome = verdict.use === "second" ? "used" : secondNote ?? verdict.why;
      notes["X-OCR-Second-Opinion"] = `${config.secondModel}:${outcome}`;
    }

    // Names last: they attach to whichever lines ended up on the bill, and
    // only their words change.
    if (namesCall) {
      const settled = await namesCall;
      if (!settled.ok) {
        notes["X-OCR-Names"] = `${config.namesModel}:${failure(settled.error)}`;
        warn(settled.error, "names reading failed; keeping the main reading's names");
      } else if (!settled.value) {
        notes["X-OCR-Names"] = `${config.namesModel}:no-answer`;
      } else {
        const named = applyNames(bill.items, settled.value);
        bill = { ...bill, items: named.items };
        notes["X-OCR-Names"] =
          `${config.namesModel}:changed=${named.changed},matched=${named.matched}/${bill.items.length}`;
      }
    }

    notes["X-OCR-Server-Ms"] = String(Date.now() - startedAt);
    return { bill, notes };
  } finally {
    // Whatever is still running is no longer wanted.
    cancelWhole.abort();
    cancelNames.abort();
  }
}
