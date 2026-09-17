import sharp from "sharp";

/**
 * Receipt photo preparation.
 *
 * Right now this does exactly one thing: it turns the photo the right way up.
 *
 * A phone camera usually leaves the pixels exactly as the sensor read them and
 * records how the photo should be turned in an EXIF orientation tag. Every one
 * of the Hebrew fixtures carries orientation 6 — "rotate this to display it" —
 * and the vision model does not appear to honour that tag, so it has been
 * reading those receipts sideways.
 *
 * Measured against the fixtures on a real deployment, three runs each, applying
 * the tag took the Holy receipt from 1 correct run in 3 to 3 in 3, and left the
 * three already-correct receipts untouched.
 *
 * Deliberately nothing else. Resizing, a contrast stretch and sharpening were
 * all measured the same way and none of them earned a place yet:
 *
 *   - Resizing to 1024px helps a dim creased receipt but *breaks* a clean one,
 *     because it adds a second lossy resample before the model's own. Sending
 *     the full-resolution image leaves the model's downscale as the only one.
 *   - A contrast stretch at full resolution changed nothing on these photos —
 *     they are well lit, and the computed stretch was only 1.1x to 1.4x.
 *
 * Those belong in a separate experiment aimed at the receipts that still fail,
 * most likely alongside band slicing. See scripts/prep-fixtures.ts for how to
 * score a change like that without deploying it.
 */

export interface PreparedReceipt {
  buffer: Buffer;
  /** True when the photo actually carried a rotation that needed applying. */
  rotated: boolean;
  durationMs: number;
}

/**
 * Applies a photo's EXIF orientation, leaving the image otherwise untouched.
 *
 * `rotate()` with no argument is the operation that reads the tag and bakes it
 * into the pixels. Quality is kept high and chroma subsampling off: this re-
 * encodes the JPEG, and the whole point is to avoid losing detail the model
 * still has to read.
 *
 * A photo that needs no rotation is returned exactly as it arrived, so the
 * common case costs nothing and cannot lose anything to a re-encode.
 */
export async function prepareReceipt(input: Buffer): Promise<PreparedReceipt> {
  const startedAt = Date.now();
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const orientation = meta.orientation ?? 1;
    if (orientation === 1) {
      return { buffer: input, rotated: false, durationMs: Date.now() - startedAt };
    }

    const buffer = await sharp(input, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return { buffer, rotated: true, durationMs: Date.now() - startedAt };
  } catch {
    // A photo this cannot decode is still a photo the model might manage, and a
    // scan that fails outright is worse than a scan of a sideways receipt.
    return { buffer: input, rotated: false, durationMs: Date.now() - startedAt };
  }
}
