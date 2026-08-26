/**
 * Receipt scan eval harness.
 *
 *   pnpm eval:ocr                 full pipeline, including model calls
 *   pnpm eval:ocr -- --enhance    image enhancement only (no API calls, free)
 *
 * Put receipt photos in fixtures/receipts/ (gitignored — real receipts carry
 * personal data). Prefix the filename with the language so English and Hebrew
 * are scored separately: `he-cafe-faded.jpg`, `en-diner-long.jpg`.
 *
 * Optionally add fixtures/expected/<basename>.json with hand-checked truth:
 *   { "items": 12, "total": 431.25 }
 *
 * Enhanced images are written to fixtures/out/ so you can see what the model
 * actually receives. If you cannot read a line there, the model will not
 * either — that comparison is how the contrast settings get tuned.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { enhanceReceipt } from "../src/lib/receipt-image";
import { scanReceipt, OCR_MODEL } from "../src/lib/receipt-scan";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "fixtures", "receipts");
const EXPECTED = join(here, "..", "fixtures", "expected");
const OUT = join(here, "..", "fixtures", "out");

const enhanceOnly = process.argv.includes("--enhance");

interface Expected {
  items?: number;
  total?: number;
}

interface Row {
  name: string;
  language: string;
  slices: number;
  enhanceMs: number;
  modelMs: number;
  totalMs: number;
  items: number;
  lowConfidence: number;
  itemsTotal: number;
  printedTotal: number | null;
  reconciled: boolean | null;
  legibility: string | null;
  expected?: Expected;
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

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index]!;
}

function fmt(value: number | null | undefined, width: number, digits = 0): string {
  return (value == null ? "-" : value.toFixed(digits)).padStart(width);
}

function tick(ok: boolean | null): string {
  return ok === null ? " -" : ok ? " ok" : "OFF";
}

async function run(): Promise<void> {
  if (!existsSync(FIXTURES)) {
    console.error(`No fixtures directory at ${FIXTURES}`);
    console.error("Create it and add receipt photos (it is gitignored).");
    process.exit(1);
  }

  const files = readdirSync(FIXTURES).filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f));
  if (files.length === 0) {
    console.error(`No receipt images found in ${FIXTURES}`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });

  console.log(
    `${files.length} fixture(s) | mode: ${enhanceOnly ? "enhance only" : `full scan via ${OCR_MODEL}`}\n`,
  );

  const rows: Row[] = [];

  for (const file of files) {
    const input = readFileSync(join(FIXTURES, file));
    const language = languageOf(file);
    const stem = basename(file, extname(file));

    try {
      // Always write out what the model would see, in both modes.
      const enhanced = await enhanceReceipt(input);
      enhanced.slices.forEach((slice, i) => {
        const suffix = enhanced.slices.length > 1 ? `-slice${i}` : "";
        writeFileSync(join(OUT, `${stem}${suffix}.jpg`), slice.buffer);
      });

      if (enhanceOnly) {
        rows.push({
          name: file,
          language,
          slices: enhanced.slices.length,
          enhanceMs: enhanced.durationMs,
          modelMs: 0,
          totalMs: enhanced.durationMs,
          items: 0,
          lowConfidence: 0,
          itemsTotal: 0,
          printedTotal: null,
          reconciled: null,
          legibility: null,
        });
        continue;
      }

      const outcome = await scanReceipt(input);
      rows.push({
        name: file,
        language,
        slices: outcome.diagnostics.slices,
        enhanceMs: outcome.timings.enhanceMs,
        modelMs: outcome.timings.modelMs,
        totalMs: outcome.timings.totalMs,
        items: outcome.items.length,
        lowConfidence: outcome.items.filter((i) => i.confidence === "low").length,
        itemsTotal: outcome.diagnostics.itemsTotal,
        printedTotal: outcome.printedTotal,
        reconciled: outcome.reconciled,
        legibility: outcome.legibility,
        expected: loadExpected(file),
      });
    } catch (err) {
      rows.push({
        name: file,
        language,
        slices: 0,
        enhanceMs: 0,
        modelMs: 0,
        totalMs: 0,
        items: 0,
        lowConfidence: 0,
        itemsTotal: 0,
        printedTotal: null,
        reconciled: null,
        legibility: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    "fixture".padEnd(30) +
      "lang  sl  enh_ms  mdl_ms  tot_ms  items  low  items_tot  printed  rec  leg",
  );
  console.log("-".repeat(105));

  for (const r of rows) {
    if (r.error) {
      console.log(`${r.name.padEnd(30)}${r.language.padEnd(6)}ERROR: ${r.error}`);
      continue;
    }
    console.log(
      r.name.slice(0, 29).padEnd(30) +
        r.language.padEnd(6) +
        fmt(r.slices, 2) +
        fmt(r.enhanceMs, 8) +
        fmt(r.modelMs, 8) +
        fmt(r.totalMs, 8) +
        fmt(r.items, 7) +
        fmt(r.lowConfidence, 5) +
        fmt(r.itemsTotal, 11, 2) +
        fmt(r.printedTotal, 9, 2) +
        tick(r.reconciled).padStart(5) +
        (r.legibility ?? "-").padStart(6),
    );

    // Only compare against hand-checked truth where it exists.
    if (r.expected) {
      const notes: string[] = [];
      if (r.expected.items != null && r.expected.items !== r.items) {
        notes.push(`items ${r.items} != expected ${r.expected.items}`);
      }
      if (r.expected.total != null && Math.abs(r.expected.total - r.itemsTotal) > 0.02) {
        notes.push(`total ${r.itemsTotal.toFixed(2)} != expected ${r.expected.total.toFixed(2)}`);
      }
      if (notes.length > 0) console.log(`${" ".repeat(30)}^^ ${notes.join("; ")}`);
    }
  }

  const ok = rows.filter((r) => !r.error);
  const languages = [...new Set(ok.map((r) => r.language))].sort();

  console.log(`\n${"—".repeat(60)}`);
  console.log("Per language (a blended score hides a Hebrew regression):\n");

  for (const language of languages) {
    const group = ok.filter((r) => r.language === language);
    const totals = group.map((r) => r.totalMs);
    const checked = group.filter((r) => r.reconciled !== null);
    const matched = checked.filter((r) => r.reconciled === true).length;
    const items = group.reduce((s, r) => s + r.items, 0);
    const low = group.reduce((s, r) => s + r.lowConfidence, 0);

    console.log(
      `  ${language}  n=${group.length}  ` +
        `p50 ${percentile(totals, 0.5)}ms  p95 ${percentile(totals, 0.95)}ms  ` +
        `items ${items}  low-conf ${items > 0 ? ((100 * low) / items).toFixed(0) : "0"}%  ` +
        `reconciled ${checked.length > 0 ? `${matched}/${checked.length}` : "n/a"}`,
    );
  }

  if (!enhanceOnly) {
    const p95 = percentile(
      ok.map((r) => r.totalMs),
      0.95,
    );
    // The server side is only part of the story — capture and upload sit on top
    // of this, so leave real headroom rather than aiming at the 20s line.
    const BUDGET_MS = 15_000;
    console.log(
      `\n  overall p95 ${p95}ms — ${p95 <= BUDGET_MS ? "within" : "OVER"} the ${BUDGET_MS}ms server-side budget`,
    );
    if (p95 > BUDGET_MS) process.exitCode = 1;
  }

  console.log(`\nEnhanced images written to ${OUT}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
