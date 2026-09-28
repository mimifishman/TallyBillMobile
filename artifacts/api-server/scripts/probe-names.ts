/**
 * Try names readers on ONE receipt photo and print what each one copied.
 *
 *   pnpm run probe:names -- <photo> [--readers gpt-5.4:none,gpt-5.4:low] [--per-strip] [--save-strips DIR]
 *
 * Needs the model gateway, so it runs on Replit. Calls run one at a time: the
 * gateway answers 429 when several image calls arrive together.
 *
 * For each reader it prints the lines it copied, how long it took, and — when
 * the fixture has expected names — which ones are exact.
 */
import OpenAI from "openai";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareReceipt, receiptStrips } from "../src/lib/receipt-image.ts";
import { NAMES_PROMPT, parseNameLines, type NameLine } from "../src/lib/receipt-names.ts";
import { chatCompletion, RECEIPT_TOKEN_CEILING } from "../src/lib/model-call.ts";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const photo = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!photo) {
  console.error("usage: probe:names -- <photo> [--readers a:effort,b] [--per-strip] [--save-strips DIR]");
  process.exit(2);
}
const readers = (flag("--readers") ?? "gpt-5.4:none,gpt-5.4:low").split(",").map((s) => {
  const [model, effort] = s.split(":");
  return { model: model!, effort: effort || null, label: s };
});
const perStrip = args.includes("--per-strip");
// --strip WIDTHxHEIGHT: cut strips of this size instead of the route's own.
const stripSize = flag("--strip");
// --extra FILE: text added to the end of the names prompt, to try a rule.
const extraFile = flag("--extra");
const extra = extraFile ? "\n" + readFileSync(extraFile, "utf8").trim() : "";

const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const openai = new OpenAI({ baseURL: baseURL ?? "http://unset", apiKey: apiKey ?? "unset" });

const fold = (s: string) =>
  s.replace(/ץ/g, "צ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ך/g, "כ")
    .replace(/[׳']/g, "'").replace(/[״"]/g, '"').replace(/\s+/g, " ").trim();
const expectedFile = join(here, "..", "fixtures", "expected", basename(photo).replace(/\.[^.]+$/, ".json"));
const expected: string[] = existsSync(expectedFile)
  ? (JSON.parse(readFileSync(expectedFile, "utf8")).itemDescriptions ?? [])
  : [];

/** Claude, straight to Anthropic's API (no SDK needed). Needs ANTHROPIC_API_KEY. */
async function askClaude(model: string, strips: string[]): Promise<NameLine[] | null> {
  // Replit's own Anthropic integration if it is turned on, else a plain key.
  const key = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"];
  const base = (process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com").replace(/\/$/, "");
  if (!key) throw new Error("no Anthropic credentials");
  const content: unknown[] = [];
  strips.forEach((url, k) => {
    content.push({ type: "text", text: `Strip ${k + 1} of ${strips.length}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: url.split(",")[1] } });
  });
  content.push({ type: "text", text: "Copy every item line's name and amount as JSON." });
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4000, temperature: 0, system: NAMES_PROMPT + extra, messages: [{ role: "user", content }] }),
  });
  const body = (await res.json()) as { content?: { type: string; text?: string }[]; error?: { message: string } };
  if (!res.ok) throw new Error(`${res.status} ${body.error?.message ?? ""}`);
  return parseNameLines((body.content ?? []).map((c) => c.text ?? "").join(""));
}

async function ask(model: string, effort: string | null, strips: string[]): Promise<NameLine[] | null> {
  if (model.startsWith("claude-")) return askClaude(model, strips);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  strips.forEach((url, k) => {
    content.push({ type: "text", text: `Strip ${k + 1} of ${strips.length}:` });
    content.push({ type: "image_url", image_url: { url, detail: "high" } });
  });
  content.push({ type: "text", text: "Copy every item line's name and amount as JSON." });
  const completion = await chatCompletion(openai, {
    model,
    ...(effort ? { reasoning_effort: effort as OpenAI.ReasoningEffort } : { temperature: 0 }),
    max_completion_tokens: RECEIPT_TOKEN_CEILING,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: NAMES_PROMPT + extra },
      { role: "user", content },
    ],
  });
  return parseNameLines(completion.choices[0]?.message?.content ?? "");
}

const prepared = await prepareReceipt(readFileSync(photo), { crop: false });
const strips = stripSize ? await customStrips(prepared.buffer, stripSize) : await receiptStrips(prepared.buffer);

/** Strips of a chosen size, the photo scaled to that width (up or down). */
async function customStrips(buf: Buffer, size: string): Promise<string[]> {
  const [w, h] = size.split("x").map(Number) as [number, number];
  const resized = await sharp(buf, { failOn: "none" }).resize({ width: w }).toBuffer();
  const height = (await sharp(resized).metadata()).height!;
  const overlap = Math.round(h * 0.2);
  const count = Math.max(1, Math.ceil((height - overlap) / (h - overlap)));
  const sh = Math.min(height, Math.ceil((height + (count - 1) * overlap) / count));
  const step = count > 1 ? (height - sh) / (count - 1) : 0;
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    const top = Math.round(k * step);
    const b = await sharp(resized).extract({ left: 0, top, width: w, height: Math.min(sh, height - top) })
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
    out.push(`data:image/jpeg;base64,${b.toString("base64")}`);
  }
  return out;
}
console.log(`${basename(photo)}: ${strips.length} strips${perStrip ? ", one call per strip" : ", one call"}`);
const saveDir = flag("--save-strips");
if (saveDir) {
  mkdirSync(saveDir, { recursive: true });
  strips.forEach((s, k) => writeFileSync(join(saveDir, `strip-${k + 1}.jpg`), Buffer.from(s.split(",")[1]!, "base64")));
}

for (const r of readers) {
  const t0 = Date.now();
  let lines: NameLine[] = [];
  try {
    if (perStrip) {
      for (const s of strips) lines.push(...((await ask(r.model, r.effort, [s])) ?? []));
    } else {
      lines = (await ask(r.model, r.effort, strips)) ?? [];
    }
  } catch (err) {
    console.log(`\n${r.label}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }
  const ms = Date.now() - t0;
  const want = new Set(expected.map(fold));
  const exact = new Set(lines.map((l) => fold(l.name)).filter((n) => want.has(n)));
  console.log(`\n${r.label}: ${lines.length} lines, ${ms} ms${expected.length ? `, exact ${exact.size}/${expected.length}` : ""}`);
  for (const l of lines) console.log(`  ${want.has(fold(l.name)) ? " " : "!"} ${l.amount.toFixed(2).padStart(8)}  ${l.name}`);
}
