"use strict";

const sharp = require("sharp");
const env = require("../config/env");
const ApiError = require("./ApiError");
const logger = require("../config/logger");

/**
 * Normalises an uploaded image to WebP before it is stored.
 *
 * The obvious benefit is size - WebP typically lands 25-70% below an
 * equivalent JPEG or PNG, which is less storage, less bandwidth and a faster
 * page. But re-encoding buys two things that matter more than bytes:
 *
 *   1. **It is the real file-type check.** A Content-Type header is
 *      client-supplied and forged in a second; `.png` in a filename means
 *      nothing. Decoding the bytes is the only way to know a file is actually
 *      an image, and anything that fails to decode is rejected here rather
 *      than being stored and served back later.
 *
 *   2. **It strips everything that is not pixels.** Re-encoding discards EXIF,
 *      which routinely carries the GPS coordinates of where a photo was taken
 *      and the device that took it - handed over by users who have no idea it
 *      is in there. It also destroys any payload smuggled into the original's
 *      metadata or trailing bytes, which is what makes polyglot files (a valid
 *      image that is also a valid script) work.
 *
 * EXIF orientation is the one tag worth keeping the *effect* of: `rotate()`
 * bakes the rotation into the pixels before the tag is dropped, so a photo
 * taken sideways does not end up sideways forever.
 */

/** Formats sharp will decode. SVG is deliberately absent - see below. */
const DECODABLE = new Set(["jpeg", "jpg", "png", "webp", "gif", "avif", "tiff", "heif"]);

/**
 * @param {Buffer} buffer Raw uploaded bytes.
 * @param {{filename?: string}} [context] For log lines only.
 * @returns {Promise<{buffer: Buffer, format: string, width: number, height: number,
 *   bytes: number, originalFormat: string, originalBytes: number, animated: boolean}>}
 */
async function toWebp(buffer, { filename } = {}) {
  let metadata;

  try {
    // `limitInputPixels` is left at sharp's default, which caps decoded
    // dimensions and is the guard against decompression bombs: a few KB of
    // PNG can otherwise declare itself 50000x50000 and exhaust memory on
    // decode, long before any size limit on the file itself would notice.
    metadata = await sharp(buffer).metadata();
  } catch (error) {
    throw rejectAsNotAnImage(error);
  }

  if (!metadata?.format || !DECODABLE.has(metadata.format)) {
    // Reached by anything that decodes to something we do not want to serve -
    // SVG most notably, which sharp will happily rasterise but which arrives
    // as markup that can carry script.
    throw ApiError.badRequest(
      `Unsupported image format${metadata?.format ? ` '${metadata.format}'` : ""}. Send a JPEG, PNG, WebP, GIF or AVIF.`,
      { code: "UNSUPPORTED_MEDIA_TYPE" }
    );
  }

  // `pages` is only set for multi-frame formats. Reading it decides whether to
  // open the image in animated mode, which is what preserves a GIF's frames
  // instead of silently flattening it to the first one.
  const animated = (metadata.pages ?? 1) > 1;

  try {
    const pipeline = sharp(buffer, {
      animated,
      /**
       * `none` refers to *warnings*, not to validation.
       *
       * Stricter settings reject images that are perfectly displayable but
       * carry a minor encoder quirk - which real cameras, phones and design
       * tools produce constantly, so anything stricter turns into users being
       * told a photo they can see on their screen is "corrupt".
       *
       * It does not weaken the type check: a buffer that cannot be decoded at
       * all still throws, which is what rejects non-images.
       */
      failOn: "none",
    });

    // Before resize, not after: sharp applies operations in pipeline order,
    // and rotating a already-resized image would fit the box to the wrong
    // axis on a portrait photo.
    if (!animated) pipeline.rotate();

    // Downscale only. `withoutEnlargement` matters: without it a 200px avatar
    // would be blown up to the cap, costing bytes and looking worse.
    pipeline.resize({
      width: env.MEDIA_MAX_DIMENSION,
      height: env.MEDIA_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

    const output = await pipeline
      .webp({
        quality: env.MEDIA_WEBP_QUALITY,
        effort: 4, // encode speed vs size; 4 is the sensible middle
      })
      .toBuffer({ resolveWithObject: true });

    const result = {
      buffer: output.data,
      format: "webp",
      width: output.info.width,
      // For an animated WebP sharp reports the height of the whole filmstrip,
      // so divide it back down to one frame.
      height: animated ? Math.round(output.info.height / (metadata.pages ?? 1)) : output.info.height,
      bytes: output.data.length,
      originalFormat: metadata.format,
      originalBytes: buffer.length,
      animated,
    };

    logger.debug(
      {
        filename,
        from: `${metadata.format} ${buffer.length}B`,
        to: `webp ${result.bytes}B`,
        saved: `${savingsPercent(buffer.length, result.bytes)}%`,
      },
      "Image converted to WebP"
    );

    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw rejectAsNotAnImage(error);
  }
}

/**
 * A decode failure is the client's problem, not ours - the bytes were not a
 * readable image - so it is a 400 rather than a 500.
 */
function rejectAsNotAnImage(cause) {
  return ApiError.badRequest(
    "That file could not be read as an image. It may be corrupt, or not an image at all.",
    { code: "INVALID_IMAGE", cause }
  );
}

/** Negative when the re-encode came out larger, which is why it is signed. */
function savingsPercent(before, after) {
  if (!before) return 0;
  return Math.round((1 - after / before) * 100);
}

module.exports = { toWebp, savingsPercent };
