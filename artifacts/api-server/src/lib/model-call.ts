/**
 * One chat completion, with the temperature dropped for models that refuse it.
 *
 * Receipt reading asks for `temperature: 0`, because the same photo should give
 * the same bill twice. The newer OpenAI models do not accept it — they support
 * only their default — and reject the whole request:
 *
 *   400 Unsupported value: 'temperature' does not support 0 with this model.
 *
 * That looked exactly like "model not available" in the first probe run, and it
 * quietly disqualified gpt-5, gpt-5-mini, o3 and o4-mini — the four newest
 * candidates, and the ones most worth trying against the discount failures. A
 * capability difference must not be mistaken for an absence.
 *
 * So the request is made as asked, and on that specific refusal it is made once
 * more without the temperature. The answer is remembered for the life of the
 * process, so a model that refuses costs one extra call in total rather than one
 * per scan. Nothing else is retried: any other 400 is a real error and is
 * thrown, because a retry loop around a genuine fault is how a bill gets billed
 * twice.
 */
import type OpenAI from "openai";

type Params = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type Completion = OpenAI.Chat.Completions.ChatCompletion;

/** Models known, this process, to reject an explicit temperature. */
const refusesTemperature = new Set<string>();

/**
 * Is this the specific refusal, rather than any other bad request?
 *
 * Matched on the message and not on a list of model names: the set of models
 * that behave this way changes, and a name list would be wrong the week after
 * it was written.
 */
function isTemperatureRefusal(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status !== 400) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /temperature/i.test(message) && /unsupported|not support/i.test(message);
}

/**
 * `options` passes straight to the client — a deadline and a retry count, for a
 * call that must not outlive the scan's time budget. Left out, the client's own
 * defaults apply, which is what every call before the second opinion used.
 */
export async function chatCompletion(
  openai: OpenAI,
  params: Params,
  options?: OpenAI.RequestOptions,
): Promise<Completion> {
  const { temperature, ...rest } = params;
  if (temperature === undefined || refusesTemperature.has(params.model)) {
    return openai.chat.completions.create(rest as Params, options);
  }
  try {
    return await openai.chat.completions.create(params, options);
  } catch (err) {
    if (!isTemperatureRefusal(err)) throw err;
    refusesTemperature.add(params.model);
    return openai.chat.completions.create(rest as Params, options);
  }
}

/**
 * The most a receipt read may spend, thinking included.
 *
 * The reasoning models (gpt-5, gpt-5-mini, o3, o4-mini) think before they
 * answer, and that thinking is billed against max_completion_tokens. With too
 * small a ceiling they spend all of it thinking and return an EMPTY reply — which
 * a probe run reported as "NO JSON" for gpt-5, gpt-5-mini and o3 after 3-4
 * seconds each, looking exactly like a model that cannot follow instructions.
 *
 * It is a ceiling, not a target. A model that is not reasoning stops when its
 * JSON is finished, so for gpt-4o nothing changes: a receipt's JSON is a few
 * hundred to two thousand tokens and never gets near this.
 */
export const RECEIPT_TOKEN_CEILING = 16_000;

/** For tests: forget what has been learned about models. */
export function resetTemperatureCache(): void {
  refusesTemperature.clear();
}

/** For tests and reporting: which models turned out to refuse a temperature. */
export function modelsRefusingTemperature(): string[] {
  return [...refusesTemperature].sort();
}

/**
 * One Claude message through Replit's Anthropic integration. No SDK: one POST
 * to the Messages API. Throws at once without the integration's credentials,
 * and on an HTTP error throws with `status` set, like the OpenAI client does,
 * so a 429 is recognised the same way.
 */
export async function claudeMessage(
  model: string,
  system: string,
  content: unknown[],
  opts: { deadlineMs?: number; signal?: AbortSignal; maxTokens?: number; thinking?: boolean } = {},
): Promise<string> {
  const key = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
  const base = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"]?.replace(/\/$/, "");
  if (!key || !base) throw new Error("no Anthropic credentials");
  const signals = [opts.signal, opts.deadlineMs ? AbortSignal.timeout(Math.max(1, Math.round(opts.deadlineMs))) : undefined]
    .filter((s): s is AbortSignal => s !== undefined);
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    // No temperature: the current Claude models refuse one.
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4_000,
      // Sonnet 5 thinks by default: 20 s on a six-line text task, and at times
      // it spent the whole token allowance thinking and answered nothing.
      ...(opts.thinking === false ? { thinking: { type: "disabled" } } : {}),
      system,
      messages: [{ role: "user", content }],
    }),
    ...(signals.length ? { signal: AbortSignal.any(signals) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as { content?: { text?: string }[]; error?: { message?: string } };
  if (!res.ok) {
    throw Object.assign(new Error(`Anthropic ${res.status}: ${body.error?.message ?? ""}`), { status: res.status });
  }
  return (body.content ?? []).map((c) => c.text ?? "").join("");
}

export const isClaude = (model: string) => model.startsWith("claude-");

/**
 * One Gemini call through Replit's Gemini integration. REST, no SDK: the
 * integration's base URL takes `/models/{id}:generateContent` directly. Throws
 * at once without the integration's credentials, and on an HTTP error throws
 * with `status` set, like the OpenAI client, so a 429 is recognised the same way.
 *
 * `thinking: false` sets a thinking budget of 0. Measured 2026-09-29 reading
 * Hebrew names: gemini-3.5-flash without thinking read 118 of 128 exactly with
 * its slowest 10% at 3.4 s.
 */
export async function geminiGenerate(
  model: string,
  system: string,
  parts: unknown[],
  opts: { deadlineMs?: number; signal?: AbortSignal; thinking?: boolean; json?: boolean } = {},
): Promise<string> {
  const access = geminiAccess();
  const { base } = access;
  const signals = [opts.signal, opts.deadlineMs ? AbortSignal.timeout(Math.max(1, Math.round(opts.deadlineMs))) : undefined]
    .filter((s): s is AbortSignal => s !== undefined);
  const res = await fetch(`${base}/models/${model}:generateContent`, {
    method: "POST",
    headers: { ...access.headers, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        ...(opts.json === false ? {} : { responseMimeType: "application/json" }),
        ...(opts.thinking === false ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
    ...(signals.length ? { signal: AbortSignal.any(signals) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw Object.assign(new Error(`Gemini ${res.status}: ${body.error?.message ?? ""}`), { status: res.status });
  }
  return (body.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
}

export const isGemini = (model: string) => model.startsWith("gemini-");

/**
 * Our own Google AI Studio key (GEMINI_API_KEY) when there is one, else
 * Replit's Gemini integration. Replit's is shared and rate-limited per
 * project: scans failed with 429s at a few scans a minute on 2026-09-29, on
 * every provider at the same moments. Our own key has its own, higher limits.
 */
function geminiAccess(): { base: string; headers: Record<string, string> } {
  const own = process.env["GEMINI_API_KEY"]?.trim();
  if (own) return { base: "https://generativelanguage.googleapis.com/v1beta", headers: { "x-goog-api-key": own } };
  const key = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
  const base = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"]?.replace(/\/$/, "");
  if (!key || !base) throw new Error("no Gemini credentials");
  // Replit's proxy adds Google credentials of its own. From 2026-09-30 it
  // refuses a request that also carries x-goog-api-key (401 "API key ... used
  // with other authentication credentials"), which silently sent every money
  // read to the gpt-4o fallback. It accepts the key as a bearer token.
  return { base, headers: { authorization: `Bearer ${key}` } };
}

/** An image data URL as Gemini's inline part. */
export function geminiImage(dataUrl: string): unknown {
  const [head, data] = dataUrl.split(",");
  const mimeType = /^data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
  return { inlineData: { mimeType, data } };
}
