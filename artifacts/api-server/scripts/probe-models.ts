/**
 * Which vision models can actually be reached, and can they read a receipt at
 * all.
 *
 *   pnpm run probe:models -- --list          what the gateway actually offers
 *   pnpm run probe:models -- --try a,b,c     can each of them read a receipt
 *
 * ALWAYS --list FIRST. A published model list is not the same thing as what
 * this gateway routes: on 2026-09-24 the ids from Replit's own docs —
 * gemini-3-pro-preview, claude-sonnet-4-6, gemini-3-flash-preview — were all
 * rejected with "Model 'x' is not supported", and only gpt-4o answered.
 *
 * MUST RUN ON REPLIT. There is no model credential on the Mac, and
 * AI_INTEGRATIONS_OPENAI_BASE_URL is Replit-internal.
 *
 * This exists because an eval run is expensive and a model id is easy to get
 * wrong. A candidate can fail for three quite different reasons, and only one
 * of them is worth a full run:
 *
 *   - the id does not route at all, so it is a typo or not offered here;
 *   - it routes but has no vision, so it answers about an image it cannot see;
 *   - it routes and sees, but will not return the JSON it was asked for.
 *
 * Each model gets one tiny generated image with three priced lines on it, so a
 * dead id costs a few hundred bytes rather than fourteen receipts. Passing here
 * means "worth evaluating", never "good" — that is what eval:ocr is for.
 */
import OpenAI from "openai";
import { chatCompletion, modelsRefusingTemperature, RECEIPT_TOKEN_CEILING } from "../src/lib/model-call.ts";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const listOnly = process.argv.includes("--list");
const models = (arg("--try") ?? "gpt-5.4")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

function client(): OpenAI {
  const envPath = join(here, "..", ".env.local");
  if (!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] && existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseURL || !apiKey) {
    console.error("probe:models needs AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY.");
    console.error("Those are Replit-internal — run this on Replit, not on the Mac.");
    process.exit(1);
  }
  return new OpenAI({ baseURL, apiKey });
}

/**
 * A minimal receipt, drawn rather than photographed.
 *
 * Three lines at 1.00, 2.00 and 3.00. A model that can see it should return
 * three items; one that is guessing from the prompt alone usually invents
 * something else, which is the point of using amounts rather than a blank box.
 */
async function tinyReceipt(): Promise<string> {
  const { default: sharp } = await import("sharp");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="150">
    <rect width="220" height="150" fill="#fff"/>
    <g font-family="monospace" font-size="14" fill="#000">
      <text x="12" y="30">TEA</text><text x="150" y="30">1.00</text>
      <text x="12" y="60">RICE</text><text x="150" y="60">2.00</text>
      <text x="12" y="90">FISH</text><text x="150" y="90">3.00</text>
      <text x="12" y="125">TOTAL</text><text x="150" y="125">6.00</text>
    </g></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

type Verdict = "ok" | "NO VISION" | "NO JSON" | "OUT OF TOKENS" | "ERROR";

async function probe(openai: OpenAI, model: string, dataUrl: string): Promise<{ verdict: Verdict; detail: string; ms: number }> {
  const startedAt = Date.now();
  try {
    const completion = await chatCompletion(openai, {
      model,
      temperature: 0,
      max_completion_tokens: RECEIPT_TOKEN_CEILING,
      messages: [
        {
          role: "system",
          content: 'Read the receipt image. Return ONLY JSON: {"items":[{"description":"...","total":0.00}]}',
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            { type: "text", text: "Extract the line items as JSON." },
          ],
        },
      ],
    });
    const ms = Date.now() - startedAt;
    const choice = completion.choices[0];
    const raw = choice?.message?.content ?? "";
    // An empty reply that stopped on "length" ran out of room — usually a
    // reasoning model that spent its whole budget thinking. That is a setting
    // to raise, not a model that cannot follow instructions, so say which.
    if (!raw.trim() && choice?.finish_reason === "length") {
      return { verdict: "OUT OF TOKENS", detail: `stopped at the ${RECEIPT_TOKEN_CEILING}-token ceiling with nothing written`, ms };
    }
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      const why = raw.trim() ? raw.slice(0, 50).replace(/\s+/g, " ") : `empty reply, finish_reason ${choice?.finish_reason ?? "none"}`;
      return { verdict: "NO JSON", detail: why, ms };
    }

    const parsed = JSON.parse(match[0]) as { items?: { description?: string; total?: number }[] };
    const items = parsed.items ?? [];
    const sum = Math.round(items.reduce((s, i) => s + (Number(i.total) || 0), 0) * 100) / 100;
    // The drawn receipt is three lines summing to 6.00. Anything else means the
    // image did not reach the model, or reached it and was not read.
    if (items.length !== 3 || Math.abs(sum - 6) > 0.01) {
      return { verdict: "NO VISION", detail: `${items.length} items, sum ${sum.toFixed(2)}`, ms };
    }
    return { verdict: "ok", detail: items.map((i) => i.description ?? "?").join(" "), ms };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { verdict: "ERROR", detail: message.slice(0, 60).replace(/\s+/g, " "), ms: Date.now() - startedAt };
  }
}

const openai = client();

if (listOnly) {
  // The gateway is OpenAI-compatible, so it may answer GET /models. When it
  // does this is the only trustworthy source of ids; when it does not, the
  // error says so plainly rather than leaving a guess looking like a fact.
  try {
    const page = await openai.models.list();
    const ids = page.data.map((m) => m.id).sort();
    console.log(`${ids.length} model(s) offered by this gateway:\n`);
    for (const id of ids) console.log("  " + id);
    console.log("\nNow probe the plausible vision ones:\n  pnpm run probe:models -- --try <comma,separated,ids>");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("This gateway does not list its models: " + message.slice(0, 160));
    console.error("Fall back to --try with candidate ids; a wrong one costs one tiny call.");
    process.exit(1);
  }
  process.exit(0);
}

const dataUrl = await tinyReceipt();
console.log(`probing ${models.length} model(s) with one ${Math.round(dataUrl.length / 1.37 / 1024)}kB image each\n`);
console.log("model".padEnd(30) + "verdict".padEnd(15) + "ms".padStart(7) + "  detail");
console.log("-".repeat(78));

const worth: string[] = [];
for (const model of models) {
  const { verdict, detail, ms } = await probe(openai, model, dataUrl);
  if (verdict === "ok") worth.push(model);
  console.log(model.padEnd(30) + verdict.padEnd(15) + String(ms).padStart(7) + "  " + detail);
}

const noTemperature = modelsRefusingTemperature();
if (noTemperature.length > 0) {
  // Worth saying out loud: this is the difference that made four working models
  // look like missing ones in the first probe run.
  console.log(`\nRefused an explicit temperature and were retried without it: ${noTemperature.join(", ")}`);
}
console.log(
  worth.length === 0
    ? "\nNothing worth evaluating."
    : `\nWorth a full run:\n  pnpm run eval:ocr -- --local --repeat 3 --models ${worth.join(",")}`,
);
