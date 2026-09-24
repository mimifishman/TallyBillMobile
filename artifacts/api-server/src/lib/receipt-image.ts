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
 * The fraction is taken of the RECEIPT, not of the picture. Those are the same
 * thing only when the receipt fills the frame, which is what every fixture
 * happened to do. Give the same code a receipt sitting in a wide blank margin —
 * a scan of a page, a screenshot, a photo taken from too far back — and a
 * quarter of the picture is far more than a quarter of the receipt. On a
 * French A4 test page the old cut landed four lines into the items and threw
 * away three of them along with a discount, and the model never saw them.
 *
 * So the blank border is trimmed off first and the fraction is measured from
 * what is left. Trimming costs nothing on a real photo: on all eight fixtures
 * `trim` finds no uniform border at all and returns the picture whole, so the
 * cut lands exactly where it did before and the measurements above still hold.
 * It only moves on the pictures that were broken. Cropping to the receipt also
 * stops the model spending its fixed resolution budget on blank paper — on that
 * A4 page the receipt is 18% of the pixels.
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
 * How far off the border colour a pixel has to be to count as content.
 *
 * Low, because the border being looked for is the flat white of a page scan or
 * a screenshot. A photograph's background is never this even, which is why
 * trimming leaves all eight fixtures untouched.
 */
const TRIM_THRESHOLD = 10;
/**
 * A trim this drastic is not believed.
 *
 * Trimming is only ever meant to remove blank surround. If it claims almost the
 * whole picture was surround, the picture is more likely to be something this
 * code has not anticipated than a receipt in a very large margin, and cropping
 * an already-wrong region is worse than not cropping at all.
 */
const MIN_TRIM_AREA = 0.03;
/** Below this a region is too small to be a readable receipt. */
const MIN_TRIM_SIDE = 200;

/** The picture with its blank surround removed, in the rotated frame. */
interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Located {
  region: Region;
  /**
   * Whether a fraction of that region means anything.
   *
   * False when trimming DID find a receipt but one too small or too odd to
   * believe. That is positive evidence the picture is not a framed photo, and
   * taking a blind quarter of it is the very cut that has to be avoided — on a
   * 150x380 receipt at the top of a 1600x4200 page it removes the receipt
   * entirely and hands the model a blank sheet. Sending the picture whole is
   * worse than a good crop and far better than a wrong one.
   */
  croppable: boolean;
}

/**
 * Where the receipt actually sits, once a flat border is discounted.
 *
 * Trimming finding nothing is the ordinary case for a photograph, and is not a
 * failure: the whole frame comes back croppable, exactly as before this
 * existed. Trimming throwing is not evidence about the picture either, so that
 * also falls back to the long-standing behaviour. Only a region that trimming
 * located and that cannot be believed switches the crop off.
 */
async function receiptRegion(input: Buffer, width: number, height: number): Promise<Located> {
  const whole: Region = { left: 0, top: 0, width, height };
  try {
    const { info } = await sharp(input, { failOn: "none" })
      .rotate()
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });

    // sharp reports the offsets as negative — how far the content was moved.
    const region: Region = {
      left: Math.abs(info.trimOffsetLeft ?? 0),
      top: Math.abs(info.trimOffsetTop ?? 0),
      width: info.width,
      height: info.height,
    };
    const believable =
      region.width >= MIN_TRIM_SIDE &&
      region.height >= MIN_TRIM_SIDE &&
      (region.width * region.height) / (width * height) >= MIN_TRIM_AREA &&
      region.left + region.width <= width &&
      region.top + region.height <= height;
    if (!believable) return { region: whole, croppable: false };
    return { region, croppable: true };
  } catch {
    return { region: whole, croppable: true };
  }
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
/**
 * `crop: false` keeps the photo whole — still turned upright and trimmed of blank
 * surround, but with no header cut. See receiptDataUrl for when that is asked for.
 */
export async function prepareReceipt(input: Buffer, opts: { crop?: boolean } = {}): Promise<PreparedReceipt> {
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

    // The shape that decides the crop is the receipt's, not the picture's. A
    // receipt in a wide margin is squarer than it looks and would otherwise be
    // measured, and cut, as though the margin were part of it.
    const { region, croppable } = await receiptRegion(input, width, height);
    const trimmed = region.width !== width || region.height !== height;
    const shouldCrop =
      opts.crop !== false &&
      croppable &&
      region.height / region.width >= MIN_RATIO_TO_CROP &&
      region.height >= MIN_HEIGHT_TO_CROP;

    // Nothing to do: already upright, nothing to trim, and too square or too
    // small to crop. Returned byte-for-byte so the common case cannot lose
    // anything to a re-encode it did not need.
    if (orientation === 1 && !trimmed && !shouldCrop) {
      return { buffer: input, rotated: false, croppedTop: 0, durationMs: Date.now() - startedAt };
    }

    let pipeline = sharp(input, { failOn: "none" }).rotate();
    if (shouldCrop || trimmed) {
      const off = shouldCrop ? Math.round(region.height * HEADER_FRACTION) : 0;
      pipeline = pipeline.extract({
        left: region.left,
        top: region.top + off,
        width: region.width,
        height: region.height - off,
      });
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

/**
 * The image format, read from the bytes rather than trusted from a filename.
 *
 * The route used to label the upload by its name: anything not rotated and
 * called ".png" went out as image/png. But prepareReceipt re-encodes to JPEG
 * whenever it changes anything, so a PNG that was only cropped or trimmed — a
 * screenshot, a page scan — was sent as JPEG bytes labelled PNG. The bytes say
 * what they are; ask them.
 */
export function imageMimeType(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") return "image/heic";
  return "image/jpeg";
}

/**
 * Exactly what the model is sent for a receipt photo.
 *
 * ONE path, used by both the route and the eval harness, so they cannot drift.
 * They had: the eval's --local mode sent the raw photo with no rotation and no
 * crop, while the route sent it prepared. Every Hebrew fixture carries EXIF
 * orientation 6, so a model sweep would have compared models on receipts lying
 * on their side — and the rotation is the single largest accuracy fix this
 * scanner has had. A comparison run that way measures nothing.
 */
export async function receiptDataUrl(
  input: Buffer,
  opts: { crop?: boolean } = {},
): Promise<{ dataUrl: string; prepared: PreparedReceipt }> {
  const prepared = await prepareReceipt(input, opts);
  const dataUrl = `data:${imageMimeType(prepared.buffer)};base64,${prepared.buffer.toString("base64")}`;
  return { dataUrl, prepared };
}
