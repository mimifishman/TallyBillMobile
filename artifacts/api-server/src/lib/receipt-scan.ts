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
import { chatCompletion, claudeMessage, geminiGenerate, geminiImage, geminiRoute, geminiRoutes, isClaude, isGemini, RECEIPT_TOKEN_CEILING, type GeminiRoute } from "./model-call";
import { OCR_PROMPT } from "./receipt-prompt";
import { receiptDataUrl, receiptStrips } from "./receipt-image";
import { applyNames, NAMES_PROMPT, parseNameLines, rowShifted, voteNames, type NameLine } from "./receipt-names";
import { recoverMissedLines, reorderByReaders } from "./receipt-recover";
import { applySpelling, parseSpelling, SPELLING_PROMPT, spellingRequest, type SpellingLine } from "./receipt-spelling";
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
  /**
   * Reads instead when `model` fails (a 429, a timeout, an outage). null: the
   * scan fails with it. See readMoney.
   */
  fallbackModel: string | null;
  /** Asked only about a missed discount. null turns it off. */
  secondModel: string | null;
  secondEffort: Effort;
  /**
   * Readers of item names only, best first. They all start at once, and each
   * line's name is voted on by every reader that answered in time, plus the
   * main reading. Empty turns the names reading off. See readNames.
   */
  names: NamesReader[];
  /** The server's share of the 20-second budget. */
  budgetMs: number;
  /** How long, from the start of the scan, any names reading may take. */
  namesBudgetMs: number;
  /**
   * Checks each Hebrew name that came out as no word, after the vote. null
   * turns it off. See receipt-spelling.ts.
   */
  spelling: NamesReader | null;
  headerCrop: boolean;
}

export interface NamesReader {
  model: string;
  /** Sent only to a reasoning model; null for gpt-4o, which rejects any. */
  effort: Effort | null;
}

/** "claude-sonnet-5,gpt-5.4:none" -> readers, best first. "off" or empty -> none. */
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
  /** For a Gemini model: which way to it. Left out, the preferred one. */
  route?: GeminiRoute;
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
  // "gemini-3.5-flash:none" reads without thinking; plain "gemini-..." thinks.
  if (isGemini(model)) {
    const [id, effort] = model.split(":");
    return geminiGenerate(id!, OCR_PROMPT, [
      geminiImage(dataUrl),
      { text: "Extract the line items, tax, tip, and currency from this receipt as JSON." },
    ], { ...opts, thinking: effort !== "none" });
  }
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

/** The names reading by a Claude model, through Replit's Anthropic integration. */
async function askClaudeForNames(model: string, strips: string[], opts: CallOptions): Promise<NameLine[] | null> {
  const content: unknown[] = [];
  strips.forEach((url, k) => {
    const [head, data] = url.split(",");
    const mediaType = /^data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
    content.push({ type: "text", text: `Strip ${k + 1} of ${strips.length}:` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  });
  content.push({ type: "text", text: "Copy every item line's name and amount as JSON." });
  // Without thinking: measured 2026-09-28 on the 13 Hebrew fixtures, twice,
  // Sonnet 5 read 114 of 142 names without it and 109 with it, and its slowest
  // 10% took 3 s instead of 18 s — with it, 5 scans in 26 ran out of time.
  return parseNameLines(await claudeMessage(model, NAMES_PROMPT, content, { ...opts, thinking: false }));
}

/** The spelling check: text only, one request for every Hebrew line. */
export async function askSpelling(
  openai: OpenAI,
  reader: NamesReader,
  lines: SpellingLine[],
  opts: CallOptions,
): Promise<Map<number, string> | null> {
  const input = JSON.stringify({ lines });
  if (isClaude(reader.model)) {
    return parseSpelling(
      await claudeMessage(reader.model, SPELLING_PROMPT, [{ type: "text", text: input }], { ...opts, maxTokens: 1_000, thinking: false }),
    );
  }
  const completion = await chatCompletion(
    openai,
    {
      model: reader.model,
      ...(reader.effort ? { reasoning_effort: reader.effort as OpenAI.ReasoningEffort } : { temperature: 0 }),
      max_completion_tokens: RECEIPT_TOKEN_CEILING,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SPELLING_PROMPT },
        { role: "user", content: input },
      ],
    },
    requestOptions(opts),
  );
  return parseSpelling(completion.choices[0]?.message?.content ?? "");
}

/**
 * When a Gemini money read on the preferred route has not answered, the same
 * read also starts on the other route; the first answer is used. On
 * 2026-09-30 the own-key route took over 9 s on 5 reads of 40 in one eval —
 * gpt-4o then stood in and missed two discounts it always misses — while
 * each route on its own answers most reads in 3-6 s.
 */
const GEMINI_HEDGE_MS = 5_000;

/**
 * The same call on each route, the next one starting `hedgeMs` after the one
 * before if nothing has answered; the first answer wins and the rest are
 * cancelled. Each route gets `limitMs` from its own start. Rejects with the
 * last failure when every route failed.
 */
export function hedged<T>(
  call: (route: GeminiRoute, signal: AbortSignal, deadlineMs: number) => Promise<T>,
  routes: GeminiRoute[],
  timing: { limitMs: number; hedgeMs: number; signal?: AbortSignal },
  onHedgeWin: (route: GeminiRoute) => void,
): Promise<T> {
  const cancel = new AbortController();
  timing.signal?.addEventListener("abort", () => cancel.abort(), { once: true });
  return new Promise<T>((resolve, reject) => {
    let running = 0, next = 0, done = false, lastError: unknown = new Error("no Gemini route");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (done || next >= routes.length) return;
      const k = next++;
      const route = routes[k]!;
      running++;
      if (next < routes.length) timer = setTimeout(start, timing.hedgeMs);
      call(route, cancel.signal, timing.limitMs).then(
        (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          cancel.abort();
          if (k > 0) onHedgeWin(route);
          resolve(value);
        },
        (err: unknown) => {
          running--;
          lastError = err;
          if (done) return;
          // A route that failed outright hands over at once, not at the hedge mark.
          if (next < routes.length) { clearTimeout(timer); start(); return; }
          if (running === 0) { done = true; reject(lastError); }
        },
      );
    };
    start();
  });
}

/**
 * How long a cropped reading that agrees with its receipt waits for the
 * whole-photo one, already running, to check it (see scanReceipt). Both start
 * together and take about the same time, so it is usually already there. It
 * was 3 s; on dev, 2026-09-30, one scan in 3 of the curled 306 photo gave up
 * on it and kept the cropped reading's made-up total.
 */
const WHOLE_GRACE_MS = 6_000;

/** How long the other names readers may take once one has answered. */
const STRAGGLER_GRACE_MS = 3_000;

/**
 * The longest the Gemini money read may take before gpt-4o reads instead. Its
 * slowest 5% took 6-10 s on the fixtures; a call Replit's Gemini never answers
 * otherwise holds the whole scan.
 */
const GEMINI_MONEY_TIMEOUT_MS = 9_000;

/** Below this there is no point starting the spelling check. */
const MIN_SPELLING_MS = 2_500;

/** The names reading by a Gemini model, through Replit's Gemini integration. */
async function askGeminiForNames(model: string, effort: Effort | null, strips: string[], opts: CallOptions): Promise<NameLine[] | null> {
  const parts: unknown[] = [];
  strips.forEach((url, k) => {
    parts.push({ text: `Strip ${k + 1} of ${strips.length}:` });
    parts.push(geminiImage(url));
  });
  parts.push({ text: "Copy every item line's name and amount as JSON." });
  return parseNameLines(await geminiGenerate(model, NAMES_PROMPT, parts, { ...opts, thinking: effort !== "none" }));
}

/** The names reading: every strip, in order, in one request. */
async function askForNames(
  openai: OpenAI,
  model: string,
  strips: string[],
  opts: CallOptions,
): Promise<NameLine[] | null> {
  if (isClaude(model)) return askClaudeForNames(model, strips, opts);
  if (isGemini(model)) return askGeminiForNames(model, opts.effort ?? null, strips, opts);
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

interface NamesAnswer {
  reader: NamesReader;
  lines: NameLine[];
}

interface NamesPick {
  /** Every reader that answered in time, in the order the readers are listed. */
  answers: NamesAnswer[];
  /** What happened to the readers that did not. */
  skipped: string[];
}

/**
 * The names readings, all at once. Never rejects.
 *
 * Every reader starts together and each gets until the names budget. That is
 * two names calls per scan; the old hedge (gpt-5.4 low, then gpt-5.4 none if
 * low had not answered by 8 s) made two on most long receipts as well.
 *
 * Measured 2026-09-28 on the 13 Hebrew fixtures, names right exactly as
 * printed, of 71: gpt-4o alone 39, gpt-5.4 44, Claude Sonnet 5 53, and the
 * per-line vote of all three 58 (see voteNames). On the user's 16-line receipt
 * of 2026-09-27 the vote read 14, gpt-5.4 8 in the same run.
 */
function readNames(
  openai: OpenAI,
  strips: Promise<string[]>,
  readers: NamesReader[],
  timing: { startedAt: number; budgetMs: number },
  outer: AbortSignal,
  warn: (err: unknown, message: string) => void,
): Promise<NamesPick> {
  const deadlineMs = () => Math.max(1, timing.budgetMs - (Date.now() - timing.startedAt));
  // Once one reader has answered, the others get STRAGGLER_GRACE_MS more.
  // Replit's Gemini at times does not answer at all (3 calls in 5 hung for a
  // full minute, 2026-09-30, then answered in 2.5 s), and a scan waited the
  // whole names budget for it with Claude's reading already in hand.
  const cancel = new AbortController();
  outer.addEventListener("abort", () => cancel.abort(), { once: true });
  let grace: ReturnType<typeof setTimeout> | undefined;
  const answered = () => {
    if (!grace) grace = setTimeout(() => cancel.abort(), STRAGGLER_GRACE_MS);
  };
  return Promise.all(
    readers.map(async (reader): Promise<NamesAnswer | string> => {
      const label = readerLabel(reader);
      try {
        const urls = await strips;
        if (urls.length === 0) return `${label}:no-strips`;
        const lines = await askForNames(openai, reader.model, urls, {
          effort: reader.effort,
          deadlineMs: deadlineMs(),
          signal: cancel.signal,
        });
        if (lines && lines.length > 0) {
          answered();
          return { reader, lines };
        }
        return `${label}:no-answer`;
      } catch (err) {
        // Replit's Anthropic integration answered 429 at the same moments as
        // the OpenAI gateway (eval of 2026-09-28), so it counts as the same
        // limit: any 429 rests the names readings.
        noteRateLimit(err);
        if (!cancel.signal.aborted) warn(err, `names reading by ${label} failed`);
        return `${label}:${cancel.signal.aborted && !outer.aborted ? "too-slow" : failure(err)}`;
      }
    }),
  ).then((results) => {
    clearTimeout(grace);
    return results;
  }).then((results) => ({
    answers: results.filter((r): r is NamesAnswer => typeof r !== "string"),
    skipped: results.filter((r): r is string => typeof r === "string"),
  }));
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
  if (isGemini(config.model) || config.names.some((r) => isGemini(r.model))) notes["X-OCR-Gemini"] = geminiRoute();

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

  /**
   * The money reading, by the fallback model when the main one fails.
   *
   * On 2026-09-29 a scan on dev failed outright — HTTP 500 to the app — on one
   * Gemini 429: the main read had no second chance. The OpenAI client retries
   * a 429 by itself; the Gemini call does not. So on any failure of the main
   * model the fallback (gpt-4o) reads the same picture, and the scan says so.
   */
  const readMoney = async (url: string, opts: CallOptions, note: string): Promise<string> => {
    try {
      const limit = isGemini(config.model) && config.fallbackModel
        ? Math.min(opts.deadlineMs ?? Infinity, GEMINI_MONEY_TIMEOUT_MS)
        : opts.deadlineMs;
      const routes = isGemini(config.model) ? geminiRoutes() : [];
      if (routes.length < 2) {
        return await askForReceipt(openai, config.model, url, { ...opts, ...(limit !== undefined ? { deadlineMs: limit } : {}) });
      }
      return await hedged(
        (route, signal, deadlineMs) => askForReceipt(openai, config.model, url, { ...opts, route, signal, deadlineMs }),
        routes,
        { limitMs: limit ?? GEMINI_MONEY_TIMEOUT_MS, hedgeMs: GEMINI_HEDGE_MS, signal: opts.signal },
        (route) => { notes[`${note.replace("Fallback", "Hedge")}`] = `${route}:used`; },
      );
    } catch (err) {
      if (!config.fallbackModel || config.fallbackModel === config.model || opts.signal?.aborted) throw err;
      noteRateLimit(err);
      warn(err, `${config.model} failed; reading with ${config.fallbackModel}`);
      notes[note] = `${config.fallbackModel}:${failure(err)}`;
      return askForReceipt(openai, config.fallbackModel, url, { ...opts, ...(opts.deadlineMs ? { deadlineMs: left() } : {}) });
    }
  };

  const cancelWhole = new AbortController();
  const cancelNames = new AbortController();
  const wholeCall = cropped
    ? settle(readMoney(wholePrep.dataUrl, { deadlineMs: left(), signal: cancelWhole.signal }, "X-OCR-Uncropped-Fallback"))
    : null;
  const namesBlock = config.names.length > 0 ? namesBlocked() : null;
  if (config.names.length > 0 && !namesBlock) namesInFlight++;
  const namesPick = config.names.length > 0 && !namesBlock
    ? readNames(
        openai,
        receiptStrips(wholePrep.prepared.buffer).catch(() => [] as string[]),
        config.names,
        { startedAt, budgetMs: config.namesBudgetMs },
        cancelNames.signal,
        warn,
      ).finally(() => { namesInFlight--; })
    : null;

  try {
    const firstRaw = await readMoney(croppedPrep.dataUrl, {}, "X-OCR-Fallback");
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
    } else if (wholeCall) {
      // The cropped reading says it agrees with the receipt — but a reading
      // can agree with a total it made up. On a curled photo of the 306
      // receipt (2026-09-30) the header cut sliced off the first item, and
      // gemini gave its own item sum, 252.00, as the printed total; the
      // whole-photo reading, already running, had all 6 lines and 330.00.
      // The cut can only lose lines and never changes the total printed at
      // the foot, so when the whole-photo reading agrees with the receipt
      // and finds more lines or a different printed total, it wins. It is
      // waited for only a little, and never past the budget.
      const grace = new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, Math.min(WHOLE_GRACE_MS, left() - MIN_SECOND_OPINION_MS))));
      const settled = await Promise.race([wholeCall, grace]);
      let outcome = "not-needed";
      if (!settled) {
        outcome = "too-slow";
      } else if (settled.ok && settled.value) {
        const parsed = parseModelJson(settled.value);
        if (parsed) {
          const uncropped = interpretReceipt(parsed);
          const otherTotal = uncropped.check.printedTotal !== null && first.check.printedTotal !== null &&
            Math.abs(uncropped.check.printedTotal - first.check.printedTotal) >= 0.005;
          if (uncropped.check.reconciled === true && (uncropped.items.length > first.items.length || otherTotal)) {
            outcome = otherTotal ? "used-other-total" : "used-more-lines";
            dataUrl = wholePrep.dataUrl;
            first = uncropped;
          }
        }
      }
      if (outcome !== "not-needed") notes["X-OCR-Uncropped"] = outcome;
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
      const { answers: heard, skipped } = await namesPick;
      // A reader that read every row one off is not used at all.
      const answers = heard.filter(({ reader, lines }) => {
        if (!rowShifted(bill.items, lines)) return true;
        skipped.push(`${readerLabel(reader)}:row-shifted`);
        return false;
      });

      // A line gpt-4o missed, put back only when the printed total proves it.
      // Before the names go on, so the new line gets its name voted like any other.
      for (const { reader, lines } of answers) {
        const found = recoverMissedLines(bill.items, bill.check, bill.billDiscount, bill.taxAmount, lines);
        if (found) {
          bill = { ...bill, items: found.items, check: found.check };
          notes["X-OCR-Recovered"] = `${readerLabel(reader)}:added=${found.added}`;
          break;
        }
      }

      // Then each price on the row both readers saw it on.
      const reordered = reorderByReaders(bill.items, answers.map((a) => a.lines));
      if (reordered) {
        const moved = reordered.filter((item, i) => item !== bill.items[i]).length;
        bill = { ...bill, items: reordered };
        notes["X-OCR-Reordered"] = `moved=${moved}`;
      }

      const parts = answers.map(({ reader, lines }) => {
        const named = applyNames(bill.items, lines);
        return { label: readerLabel(reader), named };
      });
      let note = "none-used";
      if (parts.length > 0) {
        const voted = voteNames(bill.items, parts.map((p) => p.named.items));
        bill = { ...bill, items: voted.items };
        note = [
          `vote:changed=${voted.changed}/${bill.items.length}`,
          ...parts.map((p) => `${p.label}:matched=${p.named.matched}`),
        ].join(" ");

        // Then the closest real word, for the Hebrew names that are no word.
        const lines = config.spelling ? spellingRequest(bill.items, voted.candidates, voted.agreed) : [];
        if (config.spelling && lines.length > 0) {
          const label = readerLabel(config.spelling);
          let outcome: string;
          if (left() < MIN_SPELLING_MS) {
            outcome = "skipped-no-time";
          } else {
            try {
              const answers = await askSpelling(openai, config.spelling, lines, { deadlineMs: left() - 500 });
              if (!answers) {
                outcome = "no-answer";
              } else {
                const spelled = applySpelling(bill.items, lines, answers);
                bill = { ...bill, items: spelled.items };
                outcome = `changed=${spelled.changed},refused=${spelled.refused}`;
              }
            } catch (err) {
              noteRateLimit(err);
              outcome = failure(err);
              warn(err, "spelling check failed; keeping the voted names");
            }
          }
          notes["X-OCR-Spelling"] = `${label}:${outcome}`;
        }
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
