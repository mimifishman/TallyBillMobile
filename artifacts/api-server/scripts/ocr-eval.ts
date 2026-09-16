/**
 * Receipt scan eval harness.
 *
 *   pnpm run eval:ocr                     score every fixture
 *   pnpm run eval:ocr -- --only he        only Hebrew fixtures
 *   pnpm run eval:ocr -- --repeat 3       run each receipt 3 times (latency spread)
 *   OCR_BASE=http://localhost:5000 pnpm run eval:ocr
 *   OCR_FIXTURES=/path/to/other/photos pnpm run eval:ocr
 *
 * Posts each photo to the running server's /api/ocr, so what it measures is the
 * real path the app takes — the same prompt, the same model, the same network.
 * Latency here is what a user actually waits.
 *
 * Put photos in fixtures/receipts/ (gitignored — real receipts carry personal
 * data). Prefix the filename with the language so English and Hebrew are scored
 * apart, never blended: `he-cafe-faded.jpg`, `en-diner-long.jpg`. A blended
 * average hides a Hebrew regression, which is the whole reason this splits.
 *
 * Hand-checked truth is optional but is what turns timing into accuracy. Put it
 * in fixtures/expected/<same basename>.json:
 *
 *   { "items": 12, "total": 431.25, "currency": "ILS" }
 *
 * where `items` counts line items as a person reads them (a quantity-3 line is
 * ONE item) and `total` is the printed sum of those items, before tax and tip.
 *
 * Raw model output for each run lands in fixtures/out/, to diff after a change.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
const repeat = Number(arg("--repeat") ?? 1);

interface Expected {
  items?: number;
  total?: number;
  currency?: string;
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
  ms: number;
  items: number;
  sum: number;
  currency: string | null;
  maxQuantity: number;
  expected?: Expected;
  itemsOk: boolean | null;
  totalOk: boolean | null;
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

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

const pad = (s: string | number, w: number) => String(s).padEnd(w);
const padL = (s: string | number, w: number) => String(s).padStart(w);

async function scanOnce(file: string): Promise<{ ms: number; items: OcrItem[]; currency: string | null }> {
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

  const parsed = JSON.parse(text) as { items?: OcrItem[]; currency?: string | null };
  return { ms, items: parsed.items ?? [], currency: parsed.currency ?? null };
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
  console.log(`${files.length} receipt(s) against ${BASE}, ${repeat} run(s) each\n`);

  const rows: Row[] = [];

  for (const file of files.sort()) {
    const language = languageOf(file);
    const expected = loadExpected(file);

    for (let run = 1; run <= repeat; run++) {
      const label = repeat > 1 ? `${file} #${run}` : file;
      try {
        const { ms, items, currency } = await scanOnce(file);
        const sum = Math.round(items.reduce((s, i) => s + (Number(i.total) || 0), 0) * 100) / 100;
        const maxQuantity = items.reduce((m, i) => Math.max(m, Number(i.quantity) || 1), 1);

        // Item count must match exactly. The total is money, so allow a 1c
        // rounding gap and nothing more.
        const itemsOk = expected?.items == null ? null : items.length === expected.items;
        const totalOk = expected?.total == null ? null : Math.abs(sum - expected.total) <= 0.01;

        rows.push({ name: label, language, ms, items: items.length, sum, currency, maxQuantity, expected, itemsOk, totalOk });
        writeFileSync(join(OUT, `${basename(file, extname(file))}${repeat > 1 ? `-${run}` : ""}.json`), JSON.stringify(items, null, 2));
        process.stdout.write(".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        rows.push({ name: label, language, ms: 0, items: 0, sum: 0, currency: null, maxQuantity: 1, expected, itemsOk: null, totalOk: null, error: message });
        process.stdout.write("!");
      }
    }
  }
  console.log("\n");

  // Per receipt
  console.log(pad("receipt", 30) + padL("ms", 7) + padL("items", 7) + padL("sum", 10) + padL("cur", 5) + padL("maxQ", 6) + "  count  total");
  console.log("-".repeat(88));
  for (const r of rows) {
    if (r.error) {
      console.log(pad(r.name, 30) + "  ERROR  " + r.error.slice(0, 48));
      continue;
    }
    const flag = r.ms > BUDGET_MS ? " OVER" : "";
    console.log(
      pad(r.name, 30) + padL(r.ms, 7) + padL(r.items, 7) + padL(r.sum.toFixed(2), 10) +
      padL(r.currency ?? "-", 5) + padL(`x${r.maxQuantity}`, 6) +
      padL(r.itemsOk === null ? "-" : r.itemsOk ? "ok" : "MISS", 7) +
      padL(r.totalOk === null ? "-" : r.totalOk ? "ok" : "OFF", 7) + flag
    );
  }

  // Per language — never blended, so a Hebrew regression cannot hide behind English.
  console.log("\n" + pad("language", 10) + padL("runs", 6) + padL("p50 ms", 8) + padL("p95 ms", 8) + padL("over 20s", 10) + padL("count ok", 10) + padL("total ok", 10) + padL("errors", 8));
  console.log("-".repeat(70));
  const languages = [...new Set(rows.map((r) => r.language))].sort();
  for (const language of languages) {
    const group = rows.filter((r) => r.language === language);
    const good = group.filter((r) => !r.error);
    const times = good.map((r) => r.ms);
    const scored = (key: "itemsOk" | "totalOk") => {
      const judged = good.filter((r) => r[key] !== null);
      if (judged.length === 0) return "-";
      return `${judged.filter((r) => r[key]).length}/${judged.length}`;
    };
    console.log(
      pad(language, 10) + padL(group.length, 6) + padL(percentile(times, 0.5), 8) + padL(percentile(times, 0.95), 8) +
      padL(good.filter((r) => r.ms > BUDGET_MS).length, 10) + padL(scored("itemsOk"), 10) + padL(scored("totalOk"), 10) +
      padL(group.filter((r) => r.error).length, 8)
    );
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
