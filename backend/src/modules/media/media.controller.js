"use strict";

const mediaService = require("./media.service");
const { sendResponse, paginationMeta } = require("../../shared/sendResponse");

function actor(req) {
  return { id: req.user.id, role: req.user.role };
}

/**
 * `req.file` is placed by multer; `req.validated.body` holds the text fields
 * beside it.
 */
async function upload(req, res) {
  const media = await mediaService.upload(
    { file: req.file, tag: req.validated?.body?.tag },
    actor(req)
  );

  return sendResponse(res, {
    statusCode: 201,
    message: "File uploaded",
    data: { media },
  });
}

/** Staff listing - every upload, from anyone. */
async function filterMedia(req, res) {
  const { items, total, page, limit } = await mediaService.list(req.validated.body);

  return sendResponse(res, {
    message: "Media retrieved",
    data: { media: items },
    meta: paginationMeta({ page, limit, total }),
  });
}

/**
 * The caller's own uploads. The owner is pinned from the token rather than
 * read from the body, so there is no field to tamper with.
 */
async function myMedia(req, res) {
  const { items, total, page, limit } = await mediaService.list(req.validated.body, {
    scopeToUploader: req.user.id,
  });

  return sendResponse(res, {
    message: "Your media retrieved",
    data: { media: items },
    meta: paginationMeta({ page, limit, total }),
  });
}

async function remove(req, res) {
  const deleted = await mediaService.remove(req.validated.params.id, actor(req));

  return sendResponse(res, { message: "Media deleted", data: { deleted } });
}

module.exports = { upload, filterMedia, myMedia, remove };
