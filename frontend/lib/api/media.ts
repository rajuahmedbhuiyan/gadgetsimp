/**
 * Uploads.
 *
 * `POST /media/upload` is open to any signed-in role precisely so a customer
 * can set a profile picture - listing and deleting are the staff-only parts.
 * The server re-encodes through Cloudinary and answers with the stored asset,
 * so the URL to save is the one that comes back, never the local file.
 */

import { api } from "./client";

/** Enforced by multer while streaming, so an oversized file never buffers. */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** What the browser's file picker should offer, derived from the same list. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export interface Media {
  id: string;
  publicId: string;
  url: string;
  type: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  originalFilename: string;
  createdAt: string;
}

/**
 * Rejects the two failures worth catching locally - wrong type and too big.
 * Both are answered by the server anyway, but only after the bytes have gone
 * up, which on a Bangladeshi mobile connection is a slow way to learn that a
 * 12MB photo was never going to work.
 */
export function checkImage(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a JPEG, PNG, WebP, GIF or AVIF image.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 3MB.`;
  }
  return null;
}

export const mediaApi = {
  upload(file: File, tag?: string) {
    const form = new FormData();
    // The field name is fixed by `uploadSingle("file")` on the route.
    form.append("file", file);
    if (tag) form.append("tag", tag);

    return api<{ media: Media }>("/media/upload", {
      method: "POST",
      body: form,
    });
  },
};
