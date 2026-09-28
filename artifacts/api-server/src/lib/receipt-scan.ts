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

/** "none" is a real setting for gpt-5.4: answer without reasoning first. */
export type Effort = "none" | "low" | "medium" | "high";

export interface ScanConfig {
  /** Reads every receipt, and is the only source of money. */
  model: string;
  /** Asked only about a missed discount. null turns it off. */
  secondModel: string | null;
  secondEffort: Effort;
  /**
   * Readers of item names only, best first. The first starts at once; the
   * next starts if it has not answered by `namesPatienceMs`, and the first
   * answer wins. Empty turns the names reading off. See readNames.
   */
  names: NamesReader[];
  /** The server's share of the 20-second budget. */
  budgetMs: number;
  /** When, from the start of the scan, the next names reader starts if none has answered. */
  namesPatienceMs: number;
  /** How long, from the start of the scan, any names reading may take. */
  namesBudgetMs: number;
  headerCrop: boolean;
}

export interface NamesReader {
  model: string;
  /** Sent only to a reasoning model; null for gpt-4o, which rejects any. */
  effort: Effort | null;
}

/** "gpt-5.4:low,gpt-5.4:none" -> readers, best first. "off" or empty -> none. */
export function parseNamesReaders(value: string): NamesReader[] {
  const v = value.trim();
  if (v === "" || v === "off") return [];
  return v.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [model, effort] = part.split(":").map((x) => x.trim());
    return { model: model!, effort: effort ? (effort as Effort) : null };
  });
}

const readerLabel = (r: NamesReader) => (r.effort ? `${r.model}:${r.effort}` : r.model);

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
  if (err instanceof Error && /timed? ?out/i.test(err.message)) return "timeout";
  // The HTTP status says whether it was the gateway's rate limit (429).
  const status = (err as { status?: number } | null)?.status;
  return status ? `error-${status}` : "error";
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
      ...(opts.effort ? { reasoning_effort: opts.effort as OpenAI.ReasoningEffort } : { temperature: 0 }),
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

/**
 * The names reading by a Claude model, through Replit's Anthropic integration.
 *
 * A separate provider from the OpenAI gateway, so it neither waits on nor adds
 * to that gateway's rate limit. No SDK: one POST to the Messages API. Without
 * the integration's credentials it throws at once, and the next reader starts.
 */
async function askClaudeForNames(model: string, strips: string[], opts: CallOptions): Promise<NameLine[] | null> {
  const key = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
  const base = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"]?.replace(/\/$/, "");
  if (!key || !base) throw new Error("no Anthropic credentials");
  const content: unknown[] = [];
  strips.forEach((url, k) => {
    const [head, data] = url.split(",");
    const mediaType = /^data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
    content.push({ type: "text", text: `Strip ${k + 1} of ${strips.length}:` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  });
  content.push({ type: "text", text: "Copy every item line's name and amount as JSON." });
  const signals = [opts.signal, opts.deadlineMs ? AbortSignal.timeout(Math.max(1, Math.round(opts.deadlineMs))) : undefined]
    .filter((s): s is AbortSignal => s !== undefined);
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    // No temperature: the current Claude models refuse one.
    body: JSON.stringify({ model, max_tokens: 4_000, system: NAMES_PROMPT, messages: [{ role: "user", content }] }),
    ...(signals.length ? { signal: AbortSignal.any(signals) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as { content?: { text?: string }[]; error?: { message?: string } };
  if (!res.ok) {
    // Shaped like the OpenAI client's errors, so failure() reports the status.
    throw Object.assign(new Error(`Anthropic ${res.status}: ${body.error?.message ?? ""}`), { status: res.status });
  }
  return parseNameLines((body.content ?? []).map((c) => c.text ?? "").join(""));
}

const isClaude = (model: string) => model.startsWith("claude-");

/** The names reading: every strip, in order, in one request. */
async function askForNames(
  openai: OpenAI,
  model: string,
  strips: string[],
  opts: CallOptions,
): Promise<NameLine[] | null> {
  if (isClaude(model)) return askClaudeForNames(model, strips, opts);
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
      ...(opts.effort ? { reasoning_effort: opts.effort as OpenAI.ReasoningEffort } : { temperature: 0 }),
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
 * Names give way to money when the gateway is busy.
 *
 * Every model call on this account shares one rate limit. Measured 2026-09-28
 * at eval pace (six scans a minute, nonstop): the names readings pushed the
 * gateway into refusing calls (429) on 5 of 60 scans, and on those the money
 * calls suffered too — a discount second opinion ran out of time, and a main
 * read retrying past its refusal took 33 seconds. So after any 429 the names
 * reading is skipped for a minute, and no more than a couple run at once. A
 * scan without it keeps gpt-4o's names, which is what every scan had before.
 */
const RATE_LIMIT_COOL_OFF_MS = 60_000;
const MAX_NAMES_IN_FLIGHT = 2;
let rateLimitedAt = 0;
let namesInFlight = 0;

function noteRateLimit(err: unknown): void {
  if ((err as { status?: number } | null)?.status === 429) rateLimitedAt = Date.now();
}

/** Why the names reading should not run now, or null when it may. */
function namesBlocked(): string | null {
  if (Date.now() - rateLimitedAt < RATE_LIMIT_COOL_OFF_MS) return "skipped-rate-limited";
  if (namesInFlight >= MAX_NAMES_IN_FLIGHT) return "skipped-busy";
  return null;
}

interface NamesPick {
  lines: NameLine[] | null;
  used: NamesReader | null;
  /** What happened to the readers that were not used. */
  skipped: string[];
}

/**
 * The names reading, hedged. Never rejects.
 *
 * Only the best reader starts at once. If it has not answered by the patience
 * mark, or fails, the next one starts, and whichever answers first is used.
 * Starting every reader up front was measured to cost money on the bill: on
 * 2026-09-28 four calls per scan made gateway calls fail, which took the time
 * the discount second opinion needed on 2 of 60 scans. Most receipts are
 * answered by the best reader well before the patience mark, so most scans
 * make one names call, not two.
 */
function readNames(
  openai: OpenAI,
  strips: Promise<string[]>,
  readers: NamesReader[],
  timing: { startedAt: number; patienceMs: number; budgetMs: number },
  outer: AbortSignal,
  warn: (err: unknown, message: string) => void,
): Promise<NamesPick> {
  const cancel = new AbortController();
  outer.addEventListener("abort", () => cancel.abort(), { once: true });
  const elapsed = () => Date.now() - timing.startedAt;
  return new Promise<NamesPick>((resolve) => {
    const skipped: string[] = [];
    let done = false, running = 0, next = 0;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    const finish = (lines: NameLine[] | null, used: NamesReader | null) => {
      if (done) return;
      done = true;
      clearTimeout(hedge);
      cancel.abort();
      resolve({ lines, used, skipped: [...skipped] });
    };
    const failed = (note: string) => {
      if (done) return;
      skipped.push(note);
      if (next < readers.length) start();
      else if (running === 0) finish(null, null);
    };
    const start = () => {
      if (done || next >= readers.length) return;
      const reader = readers[next++]!;
      const label = readerLabel(reader);
      running++;
      strips
        .then((urls) =>
          urls.length === 0
            ? null
            : askForNames(openai, reader.model, urls, {
                effort: reader.effort,
                deadlineMs: Math.max(1, timing.budgetMs - elapsed()),
                signal: cancel.signal,
              }),
        )
        .then(
          (lines) => {
            running--;
            if (lines && lines.length > 0) finish(lines, reader);
            else failed(`${label}:no-answer`);
          },
          (err: unknown) => {
            running--;
            // Only the OpenAI gateway's 429 is shared with the money reads.
            if (!isClaude(reader.model)) noteRateLimit(err);
            if (!done) warn(err, `names reading by ${label} failed`);
            failed(`${label}:${failure(err)}`);
          },
        );
    };
    start();
    if (readers.length > 1) {
      hedge = setTimeout(() => {
        if (done) return;
        skipped.push(`${readerLabel(readers[0]!)}:slow`);
        start();
      }, Math.max(0, timing.patienceMs - elapsed()));
    }
  });
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
  const namesBlock = config.names.length > 0 ? namesBlocked() : null;
  if (config.names.length > 0 && !namesBlock) namesInFlight++;
  const namesPick = config.names.length > 0 && !namesBlock
    ? readNames(
        openai,
        receiptStrips(wholePrep.prepared.buffer).catch(() => [] as string[]),
        config.names,
        { startedAt, patienceMs: config.namesPatienceMs, budgetMs: config.namesBudgetMs },
        cancelNames.signal,
        warn,
      ).finally(() => { namesInFlight--; })
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
        noteRateLimit(settled.error);
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
          noteRateLimit(err);
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
    if (namesBlock) notes["X-OCR-Names"] = namesBlock;
    if (namesPick) {
      const { lines, used, skipped } = await namesPick;
      let note = "none-used";
      if (lines && used) {
        const named = applyNames(bill.items, lines);
        bill = { ...bill, items: named.items };
        note = `${readerLabel(used)}:changed=${named.changed},matched=${named.matched}/${bill.items.length}`;
      }
      notes["X-OCR-Names"] = [note, ...skipped].join(" ");
    }

    notes["X-OCR-Server-Ms"] = String(Date.now() - startedAt);
    return { bill, notes };
  } finally {
    // Whatever is still running is no longer wanted.
    cancelWhole.abort();
    cancelNames.abort();
  }
}
