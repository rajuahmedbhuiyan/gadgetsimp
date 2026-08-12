"use strict";

const { v2: cloudinary } = require("cloudinary");
const env = require("./env");
const logger = require("./logger");
const ApiError = require("../shared/ApiError");

/**
 * Cloudinary integration.
 *
 * Uploads go **through the API rather than straight from the browser**. A
 * direct-to-Cloudinary upload is faster and cheaper in bandwidth, but it means
 * handing the browser an upload credential and trusting whatever it reports
 * back - so the size cap, the type check and the ownership record all become
 * advisory. Routing through here keeps them enforceable, at the cost of the
 * file crossing this process.
 *
 * The API secret signs every request and never leaves the server.
 */

let configured = false;

function isConfigured() {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  );
}

function getClient() {
  if (!isConfigured()) {
    throw new ApiError(503, "Media uploads are not configured on this server", {
      code: "MEDIA_NOT_CONFIGURED",
    });
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true, // always hand back https URLs
    });
    configured = true;
  }

  return cloudinary;
}

/**
 * Uploads a buffer.
 *
 * `upload_stream` is used rather than the base64 `upload` helper because the
 * latter requires building a data URI of the whole file in memory - roughly a
 * 33% size increase on top of the buffer already held, for no benefit.
 *
 * @param {Buffer} buffer
 * @param {{folder: string, resourceType: string, filename: string}} options
 */
function uploadBuffer(buffer, { folder, resourceType, filename }) {
  const client = getClient();

  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Let Cloudinary assign the public id; a user-supplied filename could
        // collide, or contain path segments that escape the folder.
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        context: filename ? { original_filename: filename } : undefined,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );

    stream.end(buffer);
  });
}

/**
 * Removes an asset. Safe to call for something already gone - Cloudinary
 * answers `not found` rather than erroring, and the caller treats the record
 * as removable either way.
 */
async function destroyAsset(publicId, resourceType = "image") {
  const client = getClient();

  const result = await client.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true, // purge the CDN edge copies too
  });

  if (result.result !== "ok" && result.result !== "not found") {
    logger.error({ publicId, result }, "Cloudinary delete returned an unexpected result");
  }

  return result;
}

/**
 * Confirms the credentials at boot rather than on a user's first upload.
 */
async function verifyCloudinary() {
  if (!isConfigured()) {
    logger.warn(
      "Cloudinary not configured - media upload endpoints will answer 503. Set CLOUDINARY_* to enable."
    );
    return;
  }

  await getClient().api.ping();
  logger.info(`Cloudinary ready (cloud: ${env.CLOUDINARY_CLOUD_NAME})`);
}

module.exports = { getClient, uploadBuffer, destroyAsset, verifyCloudinary, isConfigured };
