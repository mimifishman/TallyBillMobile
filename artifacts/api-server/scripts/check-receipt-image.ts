/**
 * Pins the header crop. Run: pnpm run check:receipt-image
 *
 * The crop removes the top quarter so the model does not spend its resolution
 * on a shop name and a VAT number. The fraction has to be a quarter of the
 * RECEIPT, not a quarter of the PICTURE. Those are only the same thing when the
 * receipt fills the frame, which every photo fixture happened to do — so the
 * bug stayed hidden until a French A4 test page arrived with the receipt sitting
 * small at the top of a mostly blank page. The cut landed four lines into the
 * items, three of them were thrown away along with a discount, and the model
 * never saw them: production returned 7 items summing to 121,30 against a
 * printed 143,40.
 *
 * The invariant worth pinning is the one that was broken: the SAME receipt must
 * prepare to the SAME thing whether it fills the frame or sits in a margin.
 *
 * Fixtures are real photos and cannot be committed, so the receipts here are
 * drawn — a dark header band and dark item rows on pale paper. That is enough,
 * because what is being pinned is geometry, not anything about reading text.
 * The photos themselves are covered a different way: trimming leaves all eight
 * of them byte-identical, which is what keeps the measurements the crop was
 * justified on intact.
 */
import sharp from "sharp";
import { prepareReceipt, receiptDataUrl, imageMimeType } from "../src/lib/receipt-image.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) {
    failed++;
    console.log(`FAIL  ${name}`);
    if (got !== undefined) console.log("      got ", JSON.stringify(got));
  } else console.log(`PASS  ${name}`);
}

/**
 * How many bands of ink the picture still has, counted down the page.
 *
 * This is the question the crop actually has to answer — did an item survive —
 * and counting bands answers it without depending on where the cut landed or
 * on how much pale paper was trimmed off around it.
 */
async function inkRows(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let rows = 0;
  let inBand = false;
  for (let y = 0; y < info.height; y++) {
    let dark = 0;
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width * info.channels + x * info.channels]! < 100) dark++;
    }
    // A band of item ink spans most of the width; stray edge pixels do not.
    const isBand = dark > info.width * 0.5;
    if (isBand && !inBand) rows++;
    inBand = isBand;
  }
  return rows;
}

const ink = (w: number, h: number) =>
  sharp({ create: { width: Math.max(1, w), height: Math.max(1, h), channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .png()
    .toBuffer();

/** Rows of "item" ink, and where the first of them starts. */
interface Receipt {
  png: Buffer;
  width: number;
  height: number;
  /** Distance from the top of the receipt to the first item row. */
  itemsTop: number;
}

/**
 * A drawn receipt: a centred header band, then evenly spaced item rows.
 *
 * `headerFraction` is deliberately larger than the quarter that gets cut. A
 * receipt whose header is shorter than a quarter loses its first line to this
 * crop by design — that is the crudeness the printed-total check exists to
 * catch, and it is not what these checks are about.
 */
async function receipt(width: number, height: number, headerFraction = 0.32, rows = 12): Promise<Receipt> {
  const headerH = Math.round(height * headerFraction);
  const rowGap = Math.round((height - headerH) / (rows + 1));
  const parts: sharp.OverlayOptions[] = [
    { input: await ink(Math.round(width * 0.6), Math.round(headerH * 0.45)), left: Math.round(width * 0.2), top: Math.round(headerH * 0.25) },
  ];
  for (let i = 0; i < rows; i++) {
    parts.push({
      input: await ink(Math.round(width * 0.9), Math.max(2, Math.round(height * 0.012))),
      left: Math.round(width * 0.05),
      top: headerH + rowGap * i,
    });
  }
  const png = await sharp({ create: { width, height, channels: 3, background: { r: 250, g: 250, b: 245 } } })
    .composite(parts)
    .png()
    .toBuffer();
  return { png, width, height, itemsTop: headerH };
}

/** The same receipt placed near the top of a blank page, as a scan would be. */
async function onPage(r: Receipt, pageW: number, pageH: number, topMargin: number): Promise<Buffer> {
  return sharp({ create: { width: pageW, height: pageH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: r.png, left: Math.round((pageW - r.width) / 2), top: topMargin }])
    .png()
    .toBuffer();
}

// The receipt used throughout: tall, as a receipt photographed upright is.
const ROWS = 12;
const r = await receipt(700, 1600, 0.32, ROWS);

// Filling the frame. This is the shape every photo fixture has, and the shape
// the 18-in-18 result was measured on. Nothing here may move.
const alone = await prepareReceipt(r.png);
const aloneMeta = await sharp(alone.buffer).metadata();
const aloneRows = await inkRows(alone.buffer);
check(
  "a receipt filling the frame is still cropped",
  alone.croppedTop === 0.25,
  alone.croppedTop,
);
check("and keeps every item row", aloneRows === ROWS, { kept: aloneRows, drawn: ROWS });

// The bug: the same receipt at the top of an A4 page, most of which is blank.
// A quarter of the PAGE is well past the top of the items.
{
  // A4 proportions: the receipt takes up well under half the page, as the
  // French test page does, and the rest is blank.
  const topMargin = 60;
  const pageH = 3600;
  const page = await onPage(r, 1600, pageH, topMargin);
  const naiveCut = Math.round(pageH * 0.25);
  check(
    "a quarter of the page really does reach into the items",
    naiveCut > topMargin + r.itemsTop,
    { naiveCut, firstItemAt: topMargin + r.itemsTop },
  );

  const prepared = await prepareReceipt(page);
  const meta = await sharp(prepared.buffer).metadata();
  check(
    "the same receipt on a page prepares to the same size",
    meta.width === aloneMeta.width && meta.height === aloneMeta.height,
    { onPage: { w: meta.width, h: meta.height }, alone: { w: aloneMeta.width, h: aloneMeta.height } },
  );
  const keptRows = await inkRows(prepared.buffer);
  check("and no item row is lost to the margin", keptRows === ROWS, { kept: keptRows, drawn: ROWS });
  check("and the blank page is gone", meta.width! < 1600, meta.width);
}

// A receipt too short for the crop to buy anything is left whole rather than
// cut blind, on a page exactly as when it is alone.
{
  const small = await receipt(400, 700, 0.32, 6);
  const prepared = await prepareReceipt(await onPage(small, 1200, 1800, 50));
  check("a short receipt is not cropped", prepared.croppedTop === 0, prepared.croppedTop);
}

// A receipt too small for the guards to believe. Trimming located something,
// but not something worth cropping from — and a blind quarter of the PAGE would
// then land below the whole receipt and hand the model a blank sheet. Sending it
// whole is worse than a good crop and far better than a destroyed one.
{
  const tiny = await receipt(150, 380, 0.32, 6);
  const page = await onPage(tiny, 1600, 4200, 40);
  const prepared = await prepareReceipt(page);
  const meta = await sharp(prepared.buffer).metadata();
  check("a receipt too small to place is not cropped", prepared.croppedTop === 0, prepared.croppedTop);
  check(
    "and it is still in the picture afterwards",
    meta.height! > 40 + tiny.height,
    { height: meta.height, receiptEndsAt: 40 + tiny.height },
  );
}

// Trimming must never be trusted far enough to return a sliver: a page with no
// receipt on it has nothing to find, and cropping a wrong region is worse than
// not cropping.
{
  const blank = await sharp({ create: { width: 1200, height: 2400, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toBuffer();
  const meta = await sharp((await prepareReceipt(blank)).buffer).metadata();
  check("a blank page is not trimmed to nothing", meta.width! >= 200 && meta.height! >= 200, meta);
}

// ONE image path for the route and the eval, labelled by its bytes.
{
  const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer();
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer();
  check("JPEG bytes are recognised as JPEG", imageMimeType(jpeg) === "image/jpeg", imageMimeType(jpeg));
  check("PNG bytes are recognised as PNG", imageMimeType(png) === "image/png", imageMimeType(png));

  // The bug this replaced: a PNG that preparation re-encodes was still labelled
  // image/png by filename. A receipt page trimmed and cropped is exactly that.
  const page = await onPage(r, 1600, 3600, 60);
  const { dataUrl: pageUrl, prepared: pagePrep } = await receiptDataUrl(page);
  check("a PNG that preparation re-encodes goes out labelled JPEG",
    pageUrl.startsWith("data:image/jpeg;base64,") && imageMimeType(pagePrep.buffer) === "image/jpeg",
    pageUrl.slice(0, 30));

  // A small square PNG is left byte-for-byte alone, so it stays PNG.
  const untouched = await receiptDataUrl(png);
  check("an untouched PNG is still sent as PNG, byte for byte",
    untouched.dataUrl.startsWith("data:image/png;base64,") && untouched.prepared.buffer === png,
    untouched.dataUrl.slice(0, 30));

  // A sideways phone photo: EXIF orientation 6 must be applied on this path,
  // or the eval compares models on receipts lying on their side.
  const sideways = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const turned = await receiptDataUrl(sideways);
  const turnedMeta = await sharp(turned.prepared.buffer).metadata();
  // Stored 1600 wide lying down; upright it is 1200 wide. (Its height then loses
  // the header quarter to the crop, so the width is the thing to check.)
  check("an EXIF-rotated photo is turned upright on the shared path",
    turned.prepared.rotated && turnedMeta.width === 1200,
    { rotated: turned.prepared.rotated, w: turnedMeta.width, h: turnedMeta.height });
}

// crop:false — for the re-read of a photo that the crop cut short.
{
  const cut = await prepareReceipt(r.png);
  const whole = await prepareReceipt(r.png, { crop: false });
  const cutRows = await inkRows(cut.buffer);
  const wholeMeta = await sharp(whole.buffer).metadata();
  const cutMeta = await sharp(cut.buffer).metadata();
  check("crop:false does not cut the top", whole.croppedTop === 0 && wholeMeta.height! > cutMeta.height!,
    { whole: wholeMeta.height, cut: cutMeta.height });
  check("and loses no rows the cropped version kept", (await inkRows(whole.buffer)) >= cutRows);
}

console.log(failed === 0 ? "\nall good" : `\n${failed} failing`);
process.exit(failed === 0 ? 0 : 1);
