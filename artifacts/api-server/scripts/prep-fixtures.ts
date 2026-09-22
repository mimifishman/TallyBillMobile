/**
 * Writes prepared copies of the receipt fixtures, so an image change can be
 * scored without deploying it.
 *
 *   pnpm run prep:fixtures -- --out /tmp/prepped
 *   OCR_FIXTURES=/tmp/prepped OCR_BASE=<a deployment> pnpm run eval:ocr -- --repeat 3
 *
 * This is the trick that makes image work measurable at all. The preparation
 * runs here, and the prepared photo goes to whichever /api/ocr is already
 * running — so the only thing that differs between two eval runs is the image,
 * and no deploy is needed to find out whether a change helps.
 *
 * It is also how the current pipeline got cut down to just the rotation: resize
 * and contrast variants were written into separate directories and scored the
 * same way, and neither earned its place. See src/lib/receipt-image.ts.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { prepareReceipt } from "../src/lib/receipt-image.ts";

const here = dirname(fileURLToPath(import.meta.url));
const RECEIPTS = process.env["OCR_FIXTURES"] ?? join(here, "..", "fixtures", "receipts");

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}
const out = arg("--out") ?? join(here, "..", "fixtures", "prepped");

if (!existsSync(RECEIPTS)) {
  console.error(`No receipts directory at ${RECEIPTS}`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const files = readdirSync(RECEIPTS).filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f)).sort();
if (files.length === 0) {
  console.error(`No receipt images in ${RECEIPTS}`);
  process.exit(1);
}

console.log(`${files.length} receipt(s) -> ${out}\n`);
console.log("receipt".padEnd(30) + "ms".padStart(5) + "rotated".padStart(9) + "cropped".padStart(9) + "size".padStart(11) + "  mean");
console.log("-".repeat(75));

for (const file of files) {
  const input = readFileSync(join(RECEIPTS, file));
  const prepared = await prepareReceipt(input);
  const name = `${basename(file, extname(file))}${extname(file)}`;
  writeFileSync(join(out, name), prepared.buffer);

  // Assert on brightness rather than trusting the pipeline composed correctly:
  // a receipt is never mostly dark, and sharp has form here — resize plus
  // normalize plus sharpen in one pipeline silently inverts the image.
  const stats = await sharp(prepared.buffer).greyscale().stats();
  const mean = stats.channels[0]!.mean;
  console.log(
    file.padEnd(30) +
    String(prepared.durationMs).padStart(5) +
    (prepared.rotated ? "yes" : "no").padStart(9) +
    (prepared.croppedTop > 0 ? `${Math.round(prepared.croppedTop * 100)}%` : "no").padStart(9) +
    `${Math.round(prepared.buffer.length / 1024)}kB`.padStart(11) +
    `  ${mean.toFixed(0)}${mean < 100 ? "  <- TOO DARK" : ""}`,
  );
}
