"use strict";

const mongoose = require("mongoose");
const { nextSequence } = require("../../shared/sequence");
const { MEDIA_TYPE, MEDIA_TYPE_VALUES } = require("../../shared/constants");

/**
 * A file stored in Cloudinary, recorded here so the application has its own
 * view of what exists.
 *
 * Keeping a local row rather than treating Cloudinary as the source of truth
 * buys three things the provider cannot: ownership (who uploaded it), the
 * ability to list and filter without an API round trip per page, and a stable
 * integer id to reference from other documents. `publicId` is the join key
 * back to Cloudinary, and the only value needed to delete the asset.
 */
const mediaSchema = new mongoose.Schema(
  {
    // Integer primary key from the shared sequence, matching users. Declaring
    // `_id` as a Number replaces Mongo's ObjectId rather than adding a second key.
    _id: { type: Number },

    /**
     * Cloudinary's identifier, e.g. `gadgetsimp/abc123`. Unique because two
     * rows pointing at one asset would mean deleting either orphans the other.
     */
    publicId: { type: String, required: true, unique: true, trim: true },

    url: { type: String, required: true, trim: true, maxlength: 1024 },

    type: { type: String, enum: MEDIA_TYPE_VALUES, default: MEDIA_TYPE.IMAGE },

    // Always "webp" - every upload is re-encoded before storage.
    format: { type: String, trim: true, maxlength: 16 },
    bytes: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },

    /**
     * What arrived, kept so the saving is reportable and support can tell what
     * a user actually sent. The original bytes themselves are not retained -
     * storing both would defeat the point of converting.
     */
    originalFormat: { type: String, trim: true, maxlength: 16 },
    originalBytes: { type: Number, min: 0 },

    // Animated GIFs become animated WebP rather than being flattened.
    animated: { type: Boolean, default: false },

    // What the user called it. Kept for display and search only - it never
    // reaches Cloudinary as a path, since a filename can contain traversal.
    originalFilename: { type: String, trim: true, maxlength: 255 },

    /**
     * Who uploaded it. Integer to match the user key, and indexed because the
     * "my uploads" endpoint filters on it for every request.
     */
    uploadedBy: { type: Number, ref: "User", required: true, index: true },

    // Free-form label so a caller can group uploads, e.g. "avatar", "banner".
    tag: { type: String, trim: true, maxlength: 40, index: true },
  },
  {
    timestamps: true,
    // Suppress Mongoose's built-in `id` virtual, which stringifies `_id`.
    // Ours returns the integer.
    id: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

mediaSchema.virtual("id").get(function id() {
  return this._id;
});

// The two access patterns: an owner's uploads newest-first, and the admin
// listing newest-first. Equality field before the sort field in both.
mediaSchema.index({ uploadedBy: 1, createdAt: -1 });
mediaSchema.index({ createdAt: -1 });

mediaSchema.pre("save", async function assignId() {
  if (this.isNew && this._id == null) {
    this._id = await nextSequence("media");
  }
});

const Media = mongoose.model("Media", mediaSchema);

module.exports = Media;
