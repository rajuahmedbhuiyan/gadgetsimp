"use strict";

const multer = require("multer");
const ApiError = require("../shared/ApiError");
const { MEDIA } = require("../shared/constants");

/**
 * Multipart parsing for the media endpoints.
 *
 * **Memory storage, not disk.** The file is forwarded to Cloudinary and never
 * needed locally, so writing it to a temp directory only adds an I/O round
 * trip plus a cleanup obligation that leaks files whenever a request fails
 * between write and unlink. The 3 MB cap is what makes buffering safe.
 *
 * The limit is enforced by multer itself, so an oversized upload is aborted
 * mid-stream rather than being read into memory and then rejected - which is
 * the difference between a cheap 413 and a way to exhaust the process.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MEDIA.MAX_BYTES,
    files: MEDIA.MAX_FILES_PER_REQUEST,
    // Bounded so a malformed multipart body cannot balloon the parser.
    fields: 10,
    parts: 15,
  },

  /**
   * MIME is checked here as a first pass, but it is client-supplied and
   * trivially forged. The real guarantee comes from Cloudinary, which decodes
   * the file and rejects anything that is not the image it claims to be.
   */
  fileFilter(_req, file, callback) {
    if (MEDIA.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(null, true);
    }

    return callback(
      ApiError.badRequest(
        `Unsupported file type '${file.mimetype}'. Allowed: ${MEDIA.ALLOWED_MIME_TYPES.join(", ")}`,
        { code: "UNSUPPORTED_MEDIA_TYPE" }
      )
    );
  },
});

/**
 * Accepts one file on the `file` field and normalises multer's own errors
 * into the standard envelope.
 *
 * Without this wrapper a `MulterError` reaches the error handler unrecognised
 * and becomes a bare 500, which tells the client nothing about a limit it
 * could simply respect.
 */
function uploadSingle(fieldName = "file") {
  const handler = upload.single(fieldName);

  return (req, res, next) => {
    handler(req, res, (error) => {
      if (!error) return next();

      if (error instanceof multer.MulterError) {
        return next(translateMulterError(error, fieldName));
      }

      // Errors raised by fileFilter are already ApiErrors.
      return next(error);
    });
  };
}

function translateMulterError(error, fieldName) {
  const megabytes = Math.round(MEDIA.MAX_BYTES / (1024 * 1024));

  switch (error.code) {
    case "LIMIT_FILE_SIZE":
      return new ApiError(413, `File is too large. The maximum size is ${megabytes}MB.`, {
        code: "FILE_TOO_LARGE",
        errors: [{ field: fieldName, message: `Must be ${megabytes}MB or smaller` }],
        cause: error,
      });

    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return ApiError.badRequest(
        `Send exactly one file, in a field named '${fieldName}'.`,
        { code: "UNEXPECTED_FILE", cause: error }
      );

    default:
      return ApiError.badRequest(`Upload failed: ${error.message}`, {
        code: "UPLOAD_FAILED",
        cause: error,
      });
  }
}

module.exports = { uploadSingle };
