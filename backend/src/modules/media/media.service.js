"use strict";

const Media = require("./media.model");
const ApiError = require("../../shared/ApiError");
const logger = require("../../config/logger");
const env = require("../../config/env");
const { uploadBuffer, destroyAsset } = require("../../config/cloudinary");
const { toWebp, savingsPercent } = require("../../shared/imageProcessor");
const { MEDIA, MEDIA_TYPE } = require("../../shared/constants");

/**
 * Uploads a file and records it.
 *
 * Order matters: the asset goes to Cloudinary first, then the row is written.
 * Doing it the other way round would leave a database row pointing at nothing
 * whenever the upload fails, and a broken URL is worse than a missing one.
 *
 * The cost of this ordering is the opposite failure - an asset in Cloudinary
 * with no row, if the database write fails - which is why that path deletes
 * the just-uploaded asset before rethrowing. A storage bill for orphans nobody
 * can find is the one outcome with no way back.
 */
async function upload({ file, tag }, actor) {
  if (!file) {
    throw ApiError.badRequest("No file was uploaded. Send one in a 'file' field.", {
      code: "FILE_MISSING",
    });
  }

  // multer already aborts past the limit; this catches a caller that reaches
  // the service another way (a script, a queue worker) and keeps the rule in
  // the layer that owns it.
  if (file.size > MEDIA.MAX_BYTES) {
    throw new ApiError(413, `File is too large. The maximum size is ${megabytes()}MB.`, {
      code: "FILE_TOO_LARGE",
    });
  }

  /**
   * Convert before uploading, not after.
   *
   * Doing it here rather than asking Cloudinary to transform on ingest means
   * only the smaller file crosses the network, and - more importantly - the
   * decode doubles as the real file-type check. Anything that is not genuinely
   * an image fails here, before it is ever stored.
   */
  const image = await toWebp(file.buffer, { filename: file.originalname });

  let asset;

  try {
    asset = await uploadBuffer(image.buffer, {
      folder: env.CLOUDINARY_FOLDER,
      resourceType: "image",
      filename: file.originalname,
    });
  } catch (error) {
    // Cloudinary rejects anything that is not really the image it claims to
    // be, which is the check that actually matters - a forged Content-Type
    // gets past multer's filter but not past decoding.
    logger.error({ err: error, uploadedBy: actor.id }, "Cloudinary upload failed");

    throw new ApiError(502, "Could not store the file. Please try again.", {
      code: "UPLOAD_FAILED",
      cause: error,
    });
  }

  try {
    const media = await Media.create({
      publicId: asset.public_id,
      url: asset.secure_url ?? asset.url,
      type: MEDIA_TYPE.IMAGE,
      // Trust the local encode over Cloudinary's echo: these describe the
      // bytes actually sent, and are present even when the provider omits a
      // field from its response.
      format: image.format,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      // Kept so the saving is visible and support can tell what was sent.
      originalFormat: image.originalFormat,
      originalBytes: image.originalBytes,
      animated: image.animated,
      originalFilename: file.originalname,
      uploadedBy: actor.id,
      tag,
    });

    logger.info(
      {
        mediaId: media.id,
        publicId: asset.public_id,
        from: `${image.originalFormat} ${image.originalBytes}B`,
        to: `webp ${image.bytes}B`,
        savedPercent: savingsPercent(image.originalBytes, image.bytes),
        by: actor.id,
      },
      "Media uploaded"
    );

    return media.toJSON();
  } catch (error) {
    // Roll the asset back so a failed write does not leave an unreferenced
    // file accruing storage cost with nothing pointing at it.
    await destroyAsset(asset.public_id).catch((cleanupError) =>
      logger.error(
        { err: cleanupError, publicId: asset.public_id },
        "Failed to roll back an orphaned Cloudinary asset - remove it by hand"
      )
    );

    throw error;
  }
}

/**
 * Filtered, paginated listing.
 *
 * `scopeToUploader` is applied last and overwrites anything the body asked
 * for, which is what makes `/media/my` safe: the caller cannot widen it to
 * someone else's uploads by sending `uploadedBy`.
 */
async function list(params, { scopeToUploader } = {}) {
  const filter = {};

  if (params.search) {
    // Escaped: an unescaped user pattern is both a ReDoS and a way to match
    // everything with `.*`.
    filter.originalFilename = { $regex: escapeRegex(params.search), $options: "i" };
  }

  if (params.type) filter.type = params.type;
  if (params.format) filter.format = params.format;

  if (params.tag) {
    filter.tag = Array.isArray(params.tag) ? { $in: params.tag } : params.tag;
  }

  if (params.minBytes != null || params.maxBytes != null) {
    filter.bytes = {};
    if (params.minBytes != null) filter.bytes.$gte = params.minBytes;
    if (params.maxBytes != null) filter.bytes.$lte = params.maxBytes;
  }

  if (params.createdFrom || params.createdTo) {
    filter.createdAt = {};
    if (params.createdFrom) filter.createdAt.$gte = params.createdFrom;
    if (params.createdTo) filter.createdAt.$lte = params.createdTo;
  }

  if (params.uploadedBy != null) filter.uploadedBy = params.uploadedBy;

  // Last word, deliberately.
  if (scopeToUploader != null) filter.uploadedBy = scopeToUploader;

  const sort = { [params.sortBy]: params.sortOrder === "asc" ? 1 : -1 };
  // Zero-based pages, so no off-by-one correction is needed here.
  const skip = params.page * params.limit;

  const [items, total] = await Promise.all([
    Media.find(filter).sort(sort).skip(skip).limit(params.limit).lean(),
    Media.countDocuments(filter),
  ]);

  return {
    items: items.map(({ _id, __v, ...rest }) => ({ id: _id, ...rest })),
    total,
    page: params.page,
    limit: params.limit,
  };
}

/**
 * Deletes the asset and its record.
 *
 * Cloudinary goes first: if the row were removed first and the remote delete
 * then failed, the file would be stranded with nothing left pointing at it.
 * This way a failure leaves both sides intact and the call can be retried.
 */
async function remove(mediaId, actor) {
  const media = await Media.findById(mediaId);

  if (!media) throw ApiError.notFound("Media not found");

  await destroyAsset(media.publicId, "image");

  await media.deleteOne();

  logger.info(
    { mediaId: media.id, publicId: media.publicId, by: actor.id },
    "Media deleted"
  );

  return { id: media.id, publicId: media.publicId };
}

function megabytes() {
  return Math.round(MEDIA.MAX_BYTES / (1024 * 1024));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { upload, list, remove };
