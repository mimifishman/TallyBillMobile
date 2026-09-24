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

export async function chatCompletion(openai: OpenAI, params: Params): Promise<Completion> {
  const { temperature, ...rest } = params;
  if (temperature === undefined || refusesTemperature.has(params.model)) {
    return openai.chat.completions.create(rest as Params);
  }
  try {
    return await openai.chat.completions.create(params);
  } catch (err) {
    if (!isTemperatureRefusal(err)) throw err;
    refusesTemperature.add(params.model);
    return openai.chat.completions.create(rest as Params);
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
