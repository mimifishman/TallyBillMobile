import sharp from "sharp";

/**
 * Receipt photo preparation.
 *
 * Two things happen here: the photo is turned the right way up, and the header
 * above the items is cut off.
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
 * The header cut is there because a receipt's shop name, address, VAT number and
 * date are of no use to a bill splitter, and carrying them costs resolution:
 * the model scales whatever it is sent down to a fixed size, so every pixel
 * spent on a header is a pixel not spent on an item. Measured on the fixtures,
 * three runs each, dropping the top quarter took totals from 9 correct runs in
 * 15 to 18 in 18, and item counts from 6 in 9 to 12 in 12 — the only change
 * tested that made every amount right every time. It is also faster, because
 * there is less image to send.
 *
 * A fixed fraction is cruder than it should be. A detector was tried first,
 * looking for the first row with ink at both margins on the theory that headers
 * are centred while item rows carry a name at one edge and a price at the
 * other. It put the item table between 42% and 89% down on the six fixtures —
 * 89% would have cut away nearly everything — so the signal is not clean enough
 * to trust, and a wrong cut is far worse than a crude one.
 *
 * What makes the crude version safe to ship is the check that already runs on
 * every scan: the receipt's own printed total is compared against what was
 * read, and a mismatch is shown to the user. The total sits at the FOOT of a
 * receipt, so a crop at the top can never remove the evidence that the crop
 * went wrong.
 *
 * Deliberately nothing else. Resizing, a contrast stretch and sharpening were
 * all measured the same way and none of them earned a place:
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
  /** Fraction of the height removed from the top, 0 when nothing was cut. */
  croppedTop: number;
  durationMs: number;
}

/** How much of the top to drop. Measured; see the note above. */
const HEADER_FRACTION = 0.25;

/**
 * Shapes that are not a photo of a receipt get left alone.
 *
 * A receipt photographed upright is tall. Anything squarer is either framed
 * tightly on the items already — where there is no header to lose and a crop
 * would take food instead — or is not a receipt at all.
 */
const MIN_RATIO_TO_CROP = 1.2;
/** Below this there is not enough resolution for the crop to buy anything. */
const MIN_HEIGHT_TO_CROP = 900;

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
    const transposed = orientation >= 5;
    const width = (transposed ? meta.height : meta.width) ?? 0;
    const height = (transposed ? meta.width : meta.height) ?? 0;
    if (!width || !height) {
      return { buffer: input, rotated: false, croppedTop: 0, durationMs: Date.now() - startedAt };
    }

    const shouldCrop = height / width >= MIN_RATIO_TO_CROP && height >= MIN_HEIGHT_TO_CROP;

    // Nothing to do: already upright, and too square or too small to crop.
    // Returned byte-for-byte so the common case cannot lose anything to a
    // re-encode it did not need.
    if (orientation === 1 && !shouldCrop) {
      return { buffer: input, rotated: false, croppedTop: 0, durationMs: Date.now() - startedAt };
    }

    let pipeline = sharp(input, { failOn: "none" }).rotate();
    if (shouldCrop) {
      const top = Math.round(height * HEADER_FRACTION);
      pipeline = pipeline.extract({ left: 0, top, width, height: height - top });
    }

    const buffer = await pipeline
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return {
      buffer,
      rotated: orientation !== 1,
      croppedTop: shouldCrop ? HEADER_FRACTION : 0,
      durationMs: Date.now() - startedAt,
    };
  } catch {
    // A photo this cannot decode is still a photo the model might manage, and a
    // scan that fails outright is worse than a scan of an untouched receipt.
    return { buffer: input, rotated: false, croppedTop: 0, durationMs: Date.now() - startedAt };
  }
}
