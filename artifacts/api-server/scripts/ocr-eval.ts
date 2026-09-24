/**
 * Receipt scan eval harness.
 *
 *   pnpm run eval:ocr                     score every fixture
 *   pnpm run eval:ocr -- --only he        only Hebrew fixtures
 *   pnpm run eval:ocr -- --repeat 3       run each receipt 3 times (latency spread)
 *   OCR_BASE=http://localhost:5000 pnpm run eval:ocr
 *   OCR_FIXTURES=/path/to/other/photos pnpm run eval:ocr
 *   pnpm run eval:ocr -- --local        call the model directly, no server
 *   pnpm run eval:ocr -- --local --models gpt-4o,gemini-3-pro-preview
 *                                       score several models over the same
 *                                       fixtures, reported side by side
 *
 * Posts each photo to the running server's /api/ocr, so what it measures is the
 * real path the app takes — the same prompt, the same model, the same network.
 * Latency here is what a user actually waits.
 *
 * `--local` instead calls the model straight from here, using the prompt and the
 * parsing this repo currently holds. That is how a prompt change gets scored
 * before it is deployed anywhere: the server route can only ever run the code
 * that is already live. It needs the two OCR variables, which it reads from
 * artifacts/api-server/.env.local — a gitignored file that never goes near a
 * commit. Latency from a --local run is not comparable to a server run, since
 * it skips the app's own network hop.
 *
 * Put photos in fixtures/receipts/ (gitignored — real receipts carry personal
 * data). Prefix the filename with the language so English and Hebrew are scored
 * apart, never blended: `he-cafe-faded.jpg`, `en-diner-long.jpg`. A blended
 * average hides a Hebrew regression, which is the whole reason this splits.
 *
 * Hand-checked truth is optional but is what turns timing into accuracy. Put it
 * in fixtures/expected/<same basename>.json:
 *
 *   { "items": 12, "total": 431.25, "currency": "ILS", "taxAmount": null }
 *
 * where `items` counts line items as a person reads them (a quantity-3 line is
 * ONE item) and `total` is the printed sum of those items, before tax and tip.
 *
 * `taxAmount` is scored only when the key is present, and null is a real
 * expectation rather than "do not score". It is the tax the receipt ADDS ON TOP
 * of the items. Where the prices already include the tax — a French "TOTAL TTC"
 * ticket, any Israeli receipt — the right answer is null, because the app adds
 * taxAmount to the items and would otherwise bill the tax a second time.
 *
 * `--models` scores each model over every fixture and labels the rows with it,
 * so candidates are compared on identical bytes in one command. It only works
 * with `--local`, on purpose: a deployed route takes its model from the server
 * environment, so that a public endpoint cannot be told by its caller which
 * model to spend money on. Probe ids with `pnpm run probe:models` first — a
 * model that cannot see an image should not cost fourteen receipts to find out.
 *
 * Raw model output for each run lands in fixtures/out/, to diff after a change.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { chatCompletion } from "../src/lib/model-call.ts";
import { OCR_PROMPT } from "../src/lib/receipt-prompt.ts";
import { normalizeLineItems, normalizeBillDiscount } from "../src/lib/receipt-line-items.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** Override to score a different set, e.g. upright copies of the same photos. */
const RECEIPTS = process.env["OCR_FIXTURES"] ?? join(here, "..", "fixtures", "receipts");
const EXPECTED = join(here, "..", "fixtures", "expected");
const OUT = join(here, "..", "fixtures", "out");

const BASE = process.env["OCR_BASE"] ?? "https://tallybill.app";
/** The scan budget the whole feature is held to. */
const BUDGET_MS = 20_000;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}
const only = arg("--only");
const local = process.argv.includes("--local");
const repeat = Number(arg("--repeat") ?? 1);
/** Candidate models to compare; `--local` only. One entry means the default. */
const models = (arg("--models") ?? process.env["OCR_MODEL"] ?? "")
  .split(",").map((m) => m.trim()).filter(Boolean);
if (models.length > 0 && !local) {
  console.error("--models needs --local: the deployed route takes its model from the server environment.");
  process.exit(1);
}
/** What a run is labelled with when nothing was chosen. */
const sweep = models.length > 0 ? models : [null];

interface Expected {
  items?: number;
  total?: number;
  currency?: string;
  /** Tax added ON TOP of the items; null where the prices already include it. */
  taxAmount?: number | null;
  /** A discount applying to the WHOLE bill, as a positive number. */
  billDiscount?: number | null;
  /** Item names read off the photo by eye. Scored as a set, not in order. */
  itemDescriptions?: string[];
}

interface OcrItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Row {
  name: string;
  language: string;
  /** Item names as returned, so runs can be compared against each other. */
  descriptions: string[];
  /** Names matched against the hand-read truth, when there is any. */
  namesOk: number | null;
  namesTotal: number | null;
  ms: number;
  items: number;
  sum: number;
  currency: string | null;
  maxQuantity: number;
  taxAmount: number | null;
  billDiscount: number | null;
  expected?: Expected;
  itemsOk: boolean | null;
  totalOk: boolean | null;
  taxOk: boolean | null;
  discountOk: boolean | null;
  error?: string;
}

/** Language tag from the filename prefix, so scores can be split by script. */
function languageOf(name: string): string {
  const match = /^([a-z]{2})[-_]/i.exec(name);
  return match ? match[1]!.toLowerCase() : "??";
}

function loadExpected(name: string): Expected | undefined {
  const path = join(EXPECTED, `${basename(name, extname(name))}.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Expected;
}

function mimeOf(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "image/jpeg";
}


/**
 * Loose comparison for an item name.
 *
 * A receipt's own punctuation is not what is being tested — the model writing
 * "ספרייט זירו" where the paper has "ספרייט ז'ירו" has read the item correctly.
 * Quoting marks, whitespace and case are stripped; the letters are not.
 */
function normalizeName(value: string): string {
  return value
    .replace(/[\u0022\u0027\u05F3\u05F4\u2018\u2019\u201C\u201D`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Did the scan get the tax right?
 *
 * null means the fixture does not pin tax, so nothing is scored. A pinned null
 * is a real expectation: the receipt's prices already include its tax, and the
 * app adds taxAmount on top of the items, so returning a figure there bills the
 * tax twice. Treat 0 and null alike — neither adds anything to the bill.
 */
function scoreTax(got: number | null, expected: Expected | undefined): boolean | null {
  if (!expected || !Object.prototype.hasOwnProperty.call(expected, "taxAmount")) return null;
  const want = expected.taxAmount;
  if (want == null) return got == null || got === 0;
  return got != null && Math.abs(got - want) <= 0.01;
}

/**
 * Did the scan get a WHOLE-BILL discount right?
 *
 * Scored the same way as tax: only when the fixture pins the key, and a pinned
 * null is a real expectation. It needs its own column because a dropped
 * bill-level discount does not show up anywhere else — the items are all
 * correct and sum to the printed subtotal, so count and total both pass while
 * the diners are overcharged by the whole discount.
 */
function scoreDiscount(got: number | null, expected: Expected | undefined): boolean | null {
  if (!expected || !Object.prototype.hasOwnProperty.call(expected, "billDiscount")) return null;
  const want = expected.billDiscount;
  if (want == null) return got == null || got === 0;
  return got != null && Math.abs(got - want) <= 0.01;
}

/** How many of the expected names came back, compared as a set. */
function matchNames(got: string[], want: string[]): number {
  const pool = got.map(normalizeName);
  let matched = 0;
  for (const name of want.map(normalizeName)) {
    const at = pool.indexOf(name);
    if (at !== -1) { pool.splice(at, 1); matched++; }
  }
  return matched;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

const pad = (s: string | number, w: number) => String(s).padEnd(w);
const padL = (s: string | number, w: number) => String(s).padStart(w);

let _openai: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (_openai) return _openai;
  const envPath = join(here, "..", ".env.local");
  if (!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] && existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseURL || !apiKey) {
    console.error("--local needs AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY.");
    console.error(`Put them in ${envPath} (gitignored), one per line, or export them.`);
    process.exit(1);
  }
  _openai = new OpenAI({ baseURL, apiKey });
  return _openai;
}

interface ScanResult {
  ms: number;
  items: OcrItem[];
  currency: string | null;
  taxAmount: number | null;
  billDiscount: number | null;
}

/** The model call the route makes, with this repo's prompt and parsing. */
async function scanLocally(file: string, model: string | null): Promise<ScanResult> {
  const bytes = readFileSync(join(RECEIPTS, file));
  const dataUrl = `data:${mimeOf(file)};base64,${bytes.toString("base64")}`;

  const startedAt = Date.now();
  const completion = await chatCompletion(openaiClient(), {
    model: model ?? process.env["OCR_MODEL"] ?? "gpt-4o",
    temperature: 0,
    max_completion_tokens: 2048,
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
  });
  const ms = Date.now() - startedAt;

  const raw = completion.choices[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in model response");
  const parsed = JSON.parse(match[0]) as { items?: unknown[]; currency?: string | null; billDiscount?: unknown; taxAmount?: number | null };

  const items = normalizeLineItems(parsed.items as never) as unknown as OcrItem[];
  const billDiscount = normalizeBillDiscount(parsed.billDiscount);
  return { ms, items, currency: parsed.currency ?? null, taxAmount: parsed.taxAmount ?? null, billDiscount };
}

async function scanOnce(file: string, model: string | null): Promise<ScanResult> {
  if (local) return scanLocally(file, model);
  const bytes = readFileSync(join(RECEIPTS, file));
  const body = JSON.stringify({
    imageBase64: bytes.toString("base64"),
    fileName: file,
  });

  const startedAt = Date.now();
  const res = await fetch(`${BASE}/api/ocr`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const ms = Date.now() - startedAt;

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(text) as { items?: OcrItem[]; currency?: string | null; taxAmount?: number | null; billDiscount?: number | null };
  return { ms, items: parsed.items ?? [], currency: parsed.currency ?? null, taxAmount: parsed.taxAmount ?? null, billDiscount: parsed.billDiscount ?? null };
}

async function run(): Promise<void> {
  if (!existsSync(RECEIPTS)) {
    console.error(`No receipts directory at ${RECEIPTS}`);
    process.exit(1);
  }

  let files = readdirSync(RECEIPTS).filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f));
  if (only) files = files.filter((f) => languageOf(f) === only.toLowerCase());

  if (files.length === 0) {
    console.error(`No receipt images in ${RECEIPTS}${only ? ` for language "${only}"` : ""}.`);
    console.error(`Name them with a language prefix, e.g. he-cafe.jpg, en-diner.jpg`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  console.log(`${files.length} receipt(s) against ${local ? "the model directly (this repo's prompt)" : BASE}, ${repeat} run(s) each\n`);

  const rows: Row[] = [];

  for (const file of files.sort()) {
    const language = languageOf(file);
    const expected = loadExpected(file);

    for (const model of sweep) {
    for (let run = 1; run <= repeat; run++) {
      const label = (model ? `${file} [${model}]` : file) + (repeat > 1 ? ` #${run}` : "");
      try {
        const { ms, items, currency, taxAmount, billDiscount } = await scanOnce(file, model);
        const sum = Math.round(items.reduce((s, i) => s + (Number(i.total) || 0), 0) * 100) / 100;
        const maxQuantity = items.reduce((m, i) => Math.max(m, Number(i.quantity) || 1), 1);

        // Item count must match exactly. The total is money, so allow a 1c
        // rounding gap and nothing more.
        const itemsOk = expected?.items == null ? null : items.length === expected.items;
        const totalOk = expected?.total == null ? null : Math.abs(sum - expected.total) <= 0.01;
        const taxOk = scoreTax(taxAmount, expected);
        const discountOk = scoreDiscount(billDiscount, expected);

        const descriptions = items.map((i) => String(i.description ?? ""));
        const want = expected?.itemDescriptions;
        rows.push({
          name: label, language, ms, items: items.length, sum, currency, maxQuantity, taxAmount, billDiscount, expected, itemsOk, totalOk, taxOk, discountOk,
          descriptions,
          namesOk: want ? matchNames(descriptions, want) : null,
          namesTotal: want ? want.length : null,
        });
        writeFileSync(join(OUT, `${basename(file, extname(file))}${repeat > 1 ? `-${run}` : ""}.json`), JSON.stringify(items, null, 2));
        process.stdout.write(".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        rows.push({ name: label, language, ms: 0, items: 0, sum: 0, currency: null, maxQuantity: 1, taxAmount: null, billDiscount: null, expected, itemsOk: null, totalOk: null, taxOk: null, discountOk: null, descriptions: [], namesOk: null, namesTotal: null, error: message });
        process.stdout.write("!");
      }
    }
    }
  }
  console.log("\n");

  // Per receipt
  // Measured from the header rather than written down, so a new column cannot
  // leave the rule short of the very column that was just added.
  const receiptHeader = pad("receipt", 44) + padL("ms", 7) + padL("items", 7) + padL("sum", 10) +
    padL("cur", 5) + padL("maxQ", 6) + "  count  total    tax   disc  names";
  console.log(receiptHeader);
  console.log("-".repeat(receiptHeader.length));
  for (const r of rows) {
    if (r.error) {
      console.log(pad(r.name, 44) + "  ERROR  " + r.error.slice(0, 48));
      continue;
    }
    const flag = r.ms > BUDGET_MS ? " OVER" : "";
    console.log(
      pad(r.name, 44) + padL(r.ms, 7) + padL(r.items, 7) + padL(r.sum.toFixed(2), 10) +
      padL(r.currency ?? "-", 5) + padL(`x${r.maxQuantity}`, 6) +
      padL(r.itemsOk === null ? "-" : r.itemsOk ? "ok" : "MISS", 7) +
      padL(r.totalOk === null ? "-" : r.totalOk ? "ok" : "OFF", 7) +
      padL(r.taxOk === null ? "-" : r.taxOk ? "ok" : "TAX", 7) +
      padL(r.discountOk === null ? "-" : r.discountOk ? "ok" : "DISC", 7) +
      padL(r.namesTotal === null ? "-" : `${r.namesOk}/${r.namesTotal}`, 7) + flag
    );
  }

  // Per language — never blended, so a Hebrew regression cannot hide behind English.
  const languageHeader = pad("language", 10) + padL("runs", 6) + padL("p50 ms", 8) + padL("p95 ms", 8) +
    padL("over 20s", 10) + padL("count ok", 10) + padL("total ok", 10) + padL("tax ok", 9) +
    padL("disc ok", 9) + padL("errors", 8);
  console.log("\n" + languageHeader);
  console.log("-".repeat(languageHeader.length));
  const languages = [...new Set(rows.map((r) => r.language))].sort();
  for (const language of languages) {
    const group = rows.filter((r) => r.language === language);
    const good = group.filter((r) => !r.error);
    const times = good.map((r) => r.ms);
    const scored = (key: "itemsOk" | "totalOk" | "taxOk" | "discountOk") => {
      const judged = good.filter((r) => r[key] !== null);
      if (judged.length === 0) return "-";
      return `${judged.filter((r) => r[key]).length}/${judged.length}`;
    };
    console.log(
      pad(language, 10) + padL(group.length, 6) + padL(percentile(times, 0.5), 8) + padL(percentile(times, 0.95), 8) +
      padL(good.filter((r) => r.ms > BUDGET_MS).length, 10) + padL(scored("itemsOk"), 10) + padL(scored("totalOk"), 10) +
      padL(scored("taxOk"), 9) + padL(scored("discountOk"), 9) + padL(group.filter((r) => r.error).length, 8)
    );
  }

  // Run-to-run agreement on item names.
  //
  // This needs no hand-read truth, and it is the sharper signal: a name that
  // changes between two runs of the same bytes was not read off the receipt at
  // all. A name that is wrong the same way every time is at least a misreading
  // of something that is there.
  if (repeat > 1) {
    console.log("\n" + pad("receipt", 44) + padL("name agreement", 16) + "  names that moved");
    console.log("-".repeat(80));
    for (const file of [...new Set(rows.map((r) => r.name.replace(/ #\d+$/, "")))]) {
      const runs = rows.filter((r) => !r.error && r.name.replace(/ #\d+$/, "") === file);
      if (runs.length < 2) continue;
      const first = runs[0]!.descriptions.map(normalizeName);
      const stable = first.filter((name) => runs.every((r) => r.descriptions.map(normalizeName).includes(name)));
      const moved = [...new Set(runs.flatMap((r) => r.descriptions).filter((d) => !stable.includes(normalizeName(d))))];
      console.log(
        pad(file, 44) + padL(`${stable.length}/${first.length}`, 16) +
        "  " + (moved.length === 0 ? "-" : moved.slice(0, 4).join(" | ")),
      );
    }
  }

  const unscored = rows.filter((r) => !r.error && !r.expected).length;
  if (unscored > 0) {
    console.log(`\n${unscored} run(s) had no fixtures/expected/*.json, so only their timing counts.`);
    console.log(`Add one per receipt to score accuracy: { "items": 12, "total": 431.25 }`);
  }
  console.log(`\nRaw model output written to ${OUT}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
