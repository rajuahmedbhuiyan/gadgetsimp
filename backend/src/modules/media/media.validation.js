"use strict";

const { z } = require("zod");
const { integerIdParam } = require("../../shared/validators");
const { PAGINATION, MEDIA_TYPE_VALUES } = require("../../shared/constants");

/**
 * The upload body is multipart, so the file itself is validated by multer and
 * Cloudinary, not Zod. Only the text fields alongside it are checked here.
 */
const upload = {
  body: z
    .object({
      tag: z.string().trim().max(40).optional(),
    })
    .strict(),
};

/**
 * Shared filter shape. `POST /media/filter` extends it with `uploadedBy`;
 * `POST /media/my` does not, because that endpoint pins the owner to the
 * caller and accepting the field would invite the belief it does something.
 */
const baseFilter = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),

  // Matches the original filename.
  search: z.string().trim().min(1).max(120).optional(),

  type: z.enum(MEDIA_TYPE_VALUES).optional(),
  tag: z.union([z.string().trim().max(40), z.array(z.string().trim().max(40)).min(1)]).optional(),

  format: z.string().trim().max(16).optional(),

  minBytes: z.coerce.number().int().min(0).optional(),
  maxBytes: z.coerce.number().int().min(0).optional(),

  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),

  sortBy: z.enum(["createdAt", "bytes", "originalFilename"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const dateRangeIsSane = (data) =>
  !data.createdFrom || !data.createdTo || data.createdFrom <= data.createdTo;

const sizeRangeIsSane = (data) =>
  data.minBytes == null || data.maxBytes == null || data.minBytes <= data.maxBytes;

const filterMedia = {
  body: baseFilter
    .extend({
      // Staff-only: narrow to one uploader.
      uploadedBy: z.coerce.number().int().positive().optional(),
    })
    .strict()
    .refine(dateRangeIsSane, {
      message: "createdFrom must be before createdTo",
      path: ["createdFrom"],
    })
    .refine(sizeRangeIsSane, {
      message: "minBytes must not exceed maxBytes",
      path: ["minBytes"],
    }),
};

const myMedia = {
  body: baseFilter
    .strict()
    .refine(dateRangeIsSane, {
      message: "createdFrom must be before createdTo",
      path: ["createdFrom"],
    })
    .refine(sizeRangeIsSane, {
      message: "minBytes must not exceed maxBytes",
      path: ["minBytes"],
    }),
};

const mediaById = { params: integerIdParam };

module.exports = { upload, filterMedia, myMedia, mediaById };
