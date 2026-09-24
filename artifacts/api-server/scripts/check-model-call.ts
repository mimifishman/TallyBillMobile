/**
 * Pins the temperature retry. Run: pnpm run check:model-call
 *
 * This exists because the bug it guards against was invisible: a probe run
 * reported gpt-5, gpt-5-mini, o3 and o4-mini as failures alongside genuinely
 * absent models, and they looked the same in the output. They were not absent —
 * they refuse an explicit temperature. Four of the most promising candidates
 * were nearly written off on the strength of that.
 *
 * No network here. A stub client records what it was asked for and can be told
 * to refuse the way the gateway refuses.
 */
import { chatCompletion, resetTemperatureCache, modelsRefusingTemperature } from "../src/lib/model-call.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) {
    failed++;
    console.log(`FAIL  ${name}`);
    if (got !== undefined) console.log("      got  " + JSON.stringify(got));
  } else console.log(`PASS  ${name}`);
}

interface Call { model: string; hasTemperature: boolean }

/** A stand-in for the OpenAI client, with the gateway's behaviour dialled in. */
function stub(refuse: "temperature" | "other" | "never") {
  const calls: Call[] = [];
  const client = {
    chat: {
      completions: {
        create: async (params: { model: string; temperature?: number }) => {
          calls.push({ model: params.model, hasTemperature: "temperature" in params });
          if (refuse === "temperature" && "temperature" in params) {
            throw Object.assign(
              new Error("400 Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) is supported."),
              { status: 400 },
            );
          }
          if (refuse === "other") {
            throw Object.assign(new Error("400 Invalid image: could not be decoded"), { status: 400 });
          }
          return { ok: true } as never;
        },
      },
    },
  };
  return { client, calls };
}

const params = (model: string) => ({ model, temperature: 0, messages: [] }) as never;

// A model that accepts a temperature is asked once, with it.
{
  resetTemperatureCache();
  const { client, calls } = stub("never");
  await chatCompletion(client as never, params("gpt-4o"));
  check("an accepting model is called once, with the temperature",
    calls.length === 1 && calls[0]!.hasTemperature, calls);
}

// A model that refuses is retried without it, and the answer is remembered.
{
  resetTemperatureCache();
  const { client, calls } = stub("temperature");
  await chatCompletion(client as never, params("gpt-5"));
  check("a refusing model is retried without the temperature",
    calls.length === 2 && calls[0]!.hasTemperature && !calls[1]!.hasTemperature, calls);

  await chatCompletion(client as never, params("gpt-5"));
  check("and is not asked with it a second time",
    calls.length === 3 && !calls[2]!.hasTemperature, calls);
  check("the refusal is recorded against that model only",
    modelsRefusingTemperature().join() === "gpt-5", modelsRefusingTemperature());
}

// What must NOT be retried: any other fault. A retry loop around a real error
// is how one scan becomes two charges.
{
  resetTemperatureCache();
  const { client, calls } = stub("other");
  let threw = false;
  try {
    await chatCompletion(client as never, params("gpt-4o"));
  } catch {
    threw = true;
  }
  check("another 400 is thrown, not retried", threw && calls.length === 1, calls);
  check("and nothing is learned from it", modelsRefusingTemperature().length === 0, modelsRefusingTemperature());
}

// One model refusing says nothing about another.
{
  resetTemperatureCache();
  const { client, calls } = stub("temperature");
  await chatCompletion(client as never, params("gpt-5"));
  const before = calls.length;
  await chatCompletion(client as never, params("gpt-4.1"));
  check("a second model is still tried with the temperature first",
    calls[before]!.hasTemperature && calls[before]!.model === "gpt-4.1", calls.slice(before));
}

// A caller that never asked for a temperature is passed straight through.
{
  resetTemperatureCache();
  const { client, calls } = stub("never");
  await chatCompletion(client as never, { model: "gpt-4o", messages: [] } as never);
  check("no temperature asked for means none sent",
    calls.length === 1 && !calls[0]!.hasTemperature, calls);
}

console.log(failed === 0 ? "\nall good" : `\n${failed} failing`);
process.exit(failed === 0 ? 0 : 1);
