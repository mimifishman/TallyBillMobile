import sharp from "sharp";

/**
 * Receipt image preparation.
 *
 * Photos of receipts — especially faded thermal paper — arrive with the print
 * only a few shades away from the paper.  The model sees whatever we send it,
 * so the contrast has to be recovered here, before the image is uploaded.
 *
 * Doing this on the server rather than on the device also means iOS and Android
 * captures go through exactly the same processing, which removes the platform
 * as a variable in scan quality.
 */

/** Width each slice is resized to before encoding. */
const TARGET_WIDTH = 1024;

/** Aspect ratios (height / width) above which a receipt is split into bands. */
const SLICE_AT_RATIO = 2.2;
const THIRD_SLICE_AT_RATIO = 4;

/** Fraction of a band's height repeated into its neighbours. */
const SLICE_OVERLAP = 0.15;

const JPEG_QUALITY = 92;

/**
 * Fraction of pixels allowed to clip at each end of the contrast stretch.
 * Clipping a little is what produces genuinely black text and white paper
 * instead of a washed-out grey; a dust speck or a blown highlight would
 * otherwise anchor the range and undo most of the stretch.
 */
const CLIP_LOW = 0.005;
const CLIP_HIGH = 0.005;

/** Ceiling on the stretch, so a nearly blank frame cannot amplify pure noise. */
const MAX_STRETCH = 8;

/**
 * Adds local (adaptive) contrast on top of the global stretch, which helps when
 * a shadow falls across part of the receipt.  Off by default — enable to
 * compare against the baseline on real fixtures.
 */
const USE_CLAHE = process.env["OCR_CLAHE"] === "1";

export interface ReceiptSlice {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface EnhanceResult {
  slices: ReceiptSlice[];
  /** Dimensions after EXIF rotation is applied, before any resizing. */
  source: { width: number; height: number; bytes: number };
  durationMs: number;
}

/**
 * EXIF-rotated dimensions, without decoding the image.
 *
 * Orientation values 5-8 are the transposed ones, where the stored pixel buffer
 * is 90 degrees off from how the photo should be displayed.  iOS portrait
 * captures routinely land here; Android ones often do not, which is exactly the
 * kind of difference that makes one platform scan worse than the other.
 */
function rotatedDimensions(meta: sharp.Metadata): { width: number; height: number } {
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const transposed = meta.orientation != null && meta.orientation >= 5;
  return transposed ? { width: height, height: width } : { width, height };
}

/** How many horizontal bands to split a receipt of this aspect ratio into. */
function sliceCountForRatio(ratio: number): number {
  if (ratio > THIRD_SLICE_AT_RATIO) return 3;
  if (ratio > SLICE_AT_RATIO) return 2;
  return 1;
}

/**
 * Top/height of each band, in source pixels.
 *
 * Bands overlap so an item sitting on a cut line is fully visible in at least
 * one of them; the prompt tells the model to deduplicate across the overlap.
 */
function bandRects(height: number, count: number): Array<{ top: number; height: number }> {
  if (count <= 1) return [{ top: 0, height }];

  const step = Math.floor(height / count);
  const overlap = Math.round(step * SLICE_OVERLAP);

  return Array.from({ length: count }, (_, i) => {
    const top = Math.max(0, i * step - overlap);
    const bottom = i === count - 1 ? height : Math.min(height, (i + 1) * step + overlap);
    return { top, height: bottom - top };
  });
}

/**
 * Grey levels to map to pure black and pure white, from the image's histogram.
 *
 * This is a plain auto-levels calculation.  sharp's own `normalize()` does
 * something similar but works in LAB, and combining it with `resize()` and
 * `sharpen()` in one pipeline produced a badly wrong result (a light receipt
 * came back 98% dark).  Computing the range here keeps the maths in 8-bit grey
 * where it is predictable, and allows the percentile clipping above.
 */
function stretchParams(data: Buffer | Uint8Array): { scale: number; offset: number } {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) histogram[data[i]!]++;

  const total = data.length;
  let low = 0;
  let high = 255;

  let seen = 0;
  for (let value = 0; value < 256; value++) {
    seen += histogram[value]!;
    if (seen >= total * CLIP_LOW) {
      low = value;
      break;
    }
  }

  seen = 0;
  for (let value = 255; value >= 0; value--) {
    seen += histogram[value]!;
    if (seen >= total * CLIP_HIGH) {
      high = value;
      break;
    }
  }

  // A band with almost no spread — a blank stretch of paper, or the tail of a
  // receipt past the last line — has no faint print to recover. Stretching it
  // anyway would just amplify sensor noise, so leave it as it is.
  const span = high - low;
  if (span < 255 / MAX_STRETCH) {
    return { scale: 1, offset: 0 };
  }

  const scale = 255 / span;
  return { scale, offset: -low * scale };
}

/**
 * The actual legibility work, applied to one already-resized band.
 *
 * The contrast stretch is per band, so a band lying in shadow gets its own
 * range rather than being dragged around by the brightest part of the receipt.
 * `sharpen` then recovers stroke edges softened by resizing and by the phone's
 * own noise reduction (heavier on iOS than Android).
 *
 * Deliberately no thresholding: a hard black/white cut destroys the faintest
 * strokes, which are the characters that are already failing.
 */
function enhanceBand(
  gray: Buffer,
  width: number,
  height: number,
  channels: sharp.Channels,
): sharp.Sharp {
  const { scale, offset } = stretchParams(gray);

  const stretched = sharp(gray, { raw: { width, height, channels } }).linear(scale, offset);
  const contrasted = USE_CLAHE ? stretched.clahe({ width: 64, height: 64, maxSlope: 5 }) : stretched;
  return contrasted.sharpen({ sigma: 1 });
}

/**
 * Prepare a receipt photo for the vision model.
 *
 * Long receipts are cut into overlapping horizontal bands. A 1:4 image loses
 * enormous detail when the API rescales its shortest side, so squarer bands
 * reach the model at a far higher effective resolution. The cut is always
 * horizontal — on a Hebrew receipt the description and price columns are
 * mirrored relative to English, so a vertical split would separate items from
 * their prices differently depending on the language.
 */
export async function enhanceReceipt(input: Buffer): Promise<EnhanceResult> {
  const startedAt = Date.now();

  const meta = await sharp(input, { failOn: "none" }).metadata();
  const { width, height } = rotatedDimensions(meta);
  if (!width || !height) {
    throw new Error("Could not read image dimensions.");
  }

  const count = sliceCountForRatio(height / width);
  const rects = bandRects(height, count);

  // Each band runs its own pipeline straight from the source buffer. Decoding
  // once into a shared raw buffer sounds cheaper, but measured slower on
  // exactly the case that matters: libvips only decodes the region a band
  // actually needs, and can shrink on load while doing it.
  const slices = await Promise.all(
    rects.map(async (rect) => {
      // `rotate()` with no argument applies the EXIF orientation, so the
      // extract below operates on the upright image rather than the raw buffer.
      let pipeline = sharp(input, { failOn: "none" }).rotate();
      if (count > 1) {
        pipeline = pipeline.extract({ left: 0, top: rect.top, width, height: rect.height });
      }

      // Decode/resize/grayscale first, then read the band back as raw grey to
      // measure its histogram.  The buffer here is already scaled down to
      // TARGET_WIDTH, so this round trip is cheap.
      const { data: gray, info: grayInfo } = await pipeline
        .resize({ width: TARGET_WIDTH, fit: "inside", withoutEnlargement: false })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info: out } = await enhanceBand(
        gray,
        grayInfo.width,
        grayInfo.height,
        grayInfo.channels as sharp.Channels,
      )
        .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
        .toBuffer({ resolveWithObject: true });

      return { buffer: data, width: out.width, height: out.height };
    }),
  );

  return {
    slices,
    source: { width, height, bytes: input.length },
    durationMs: Date.now() - startedAt,
  };
}

/** Data URLs ready to hand to the vision model, in top-to-bottom order. */
export function toDataUrls(result: EnhanceResult): string[] {
  return result.slices.map((slice) => `data:image/jpeg;base64,${slice.buffer.toString("base64")}`);
}
