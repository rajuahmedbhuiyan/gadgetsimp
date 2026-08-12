"use strict";

// Must precede the app require so config/env freezes with Cloudinary enabled.
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";

const request = require("supertest");
const createApp = require("../src/app");
const Media = require("../src/modules/media/media.model");
const { API, createUserAndLogin, uniqueEmail } = require("./helpers");
const { ROLES, MEDIA } = require("../src/shared/constants");
const sharp = require("sharp");

/**
 * Cloudinary is stubbed at the SDK boundary - `upload_stream` and `destroy` -
 * rather than at our own config module, so the code that builds the upload
 * options and reads the response is actually exercised. Nothing reaches the
 * network.
 */
jest.mock("cloudinary", () => {
  const uploadStream = jest.fn();
  const destroy = jest.fn();
  const ping = jest.fn().mockResolvedValue({ status: "ok" });

  return {
    v2: {
      config: jest.fn(),
      uploader: { upload_stream: uploadStream, destroy },
      api: { ping },
    },
    __stubs: { uploadStream, destroy, ping },
  };
});

const { __stubs: cloudinaryStubs } = require("cloudinary");

const app = createApp();

/** Set by the upload stub so tests can inspect what actually got sent. */
let lastUploadedBuffer = null;

/**
 * Fixtures are generated as real encoded images rather than hand-written byte
 * strings, because uploads are now decoded and re-encoded - so a fixture that
 * is not genuinely an image is correctly rejected, and would only test the
 * rejection path.
 */
let PNG;
let JPEG_LARGE;
let GIF_ANIMATED;

beforeAll(async () => {
  PNG = await sharp({
    create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();

  // Deliberately big and photographic-ish, so the WebP saving is measurable.
  JPEG_LARGE = await sharp({
    create: { width: 2400, height: 1800, channels: 3, background: { r: 12, g: 120, b: 200 } },
  })
    .jpeg({ quality: 100 })
    .toBuffer();

  // A genuinely animated GIF: two 20x20 frames as a vertical filmstrip,
  // declared with pageHeight so sharp reads it as multi-page.
  const filmstrip = Buffer.alloc(20 * 40 * 4);
  for (let i = 0; i < 20 * 20 * 4; i += 4) {
    filmstrip[i] = 255;
    filmstrip[i + 3] = 255;
  }
  for (let i = 20 * 20 * 4; i < 20 * 40 * 4; i += 4) {
    filmstrip[i + 2] = 255;
    filmstrip[i + 3] = 255;
  }

  GIF_ANIMATED = await sharp(filmstrip, {
    raw: { width: 20, height: 40, channels: 4, pageHeight: 20 },
  })
    .gif()
    .toBuffer();
});

/** Makes `upload_stream` behave like the real thing: a writable that calls back. */
function stubUploadSuccess(overrides = {}) {
  cloudinaryStubs.uploadStream.mockImplementation((options, callback) => {
    const chunks = [];
    return {
      end(buffer) {
        chunks.push(buffer);
        lastUploadedBuffer = Buffer.concat(chunks);
        const bytes = lastUploadedBuffer.length;
        callback(null, {
          public_id: overrides.public_id ?? `gadgetsimp/asset-${Date.now()}-${Math.random()}`,
          secure_url: overrides.secure_url ?? "https://res.cloudinary.com/test-cloud/image/upload/x.png",
          format: "png",
          bytes,
          width: 1,
          height: 1,
          ...overrides,
        });
      },
    };
  });
}

function stubUploadFailure(message = "Invalid image file") {
  cloudinaryStubs.uploadStream.mockImplementation((options, callback) => ({
    end() {
      callback(new Error(message));
    },
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  stubUploadSuccess();
  cloudinaryStubs.destroy.mockResolvedValue({ result: "ok" });
});

function uploadAs(authHeader, { buffer = PNG, filename = "photo.png", contentType = "image/png", tag } = {}) {
  const req = request(app)
    .post(`${API}/media/upload`)
    .set("Authorization", authHeader)
    .attach("file", buffer, { filename, contentType });

  return tag ? req.field("tag", tag) : req;
}

describe("POST /media/upload", () => {
  it("uploads and stores a record", async () => {
    const { authHeader, id } = await createUserAndLogin(app);

    const response = await uploadAs(authHeader);

    expect(response.status).toBe(201);
    const { media } = response.body.data;

    expect(typeof media.id).toBe("number");
    expect(media.url).toMatch(/^https:\/\//);
    expect(media.uploadedBy).toBe(id);
    expect(media.originalFilename).toBe("photo.png");
    expect(media.format).toBe("webp");

    // The row is what makes the asset ours rather than just Cloudinary's.
    expect(await Media.countDocuments({ _id: media.id })).toBe(1);
  });

  it("uploads into the configured folder", async () => {
    const { authHeader } = await createUserAndLogin(app);

    await uploadAs(authHeader);

    const [options] = cloudinaryStubs.uploadStream.mock.calls.at(-1);
    expect(options.folder).toBe("gadgetsimp");
    // A caller-supplied filename must never become the public id - it can
    // collide, or carry path segments that escape the folder.
    expect(options.use_filename).toBe(false);
    expect(options.unique_filename).toBe(true);
  });

  it("accepts an optional tag", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await uploadAs(authHeader, { tag: "avatar" });

    expect(response.body.data.media.tag).toBe("avatar");
  });

  it("is open to any authenticated role", async () => {
    for (const role of [ROLES.CUSTOMER, ROLES.MODERATOR, ROLES.ADMIN, ROLES.OWNER]) {
      const { authHeader } = await createUserAndLogin(app, { role, email: uniqueEmail(role) });

      expect((await uploadAs(authHeader)).status).toBe(201);
    }
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .post(`${API}/media/upload`)
      .attach("file", PNG, { filename: "photo.png", contentType: "image/png" });

    expect(response.status).toBe(401);
  });

  it("rejects a file over 3MB without buffering it whole", async () => {
    const { authHeader } = await createUserAndLogin(app);
    // Random bytes so the buffer cannot be compressed below the cap in transit.
    const oversized = require("node:crypto").randomBytes(MEDIA.MAX_BYTES + 1024);

    const response = await uploadAs(authHeader, { buffer: oversized });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe("FILE_TOO_LARGE");
    expect(response.body.message).toMatch(/3MB/);
    // multer aborts the stream, so nothing reaches Cloudinary.
    expect(cloudinaryStubs.uploadStream).not.toHaveBeenCalled();
  });

  it("accepts a large but valid image and shrinks it", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await uploadAs(authHeader, { buffer: JPEG_LARGE, filename: "big.jpg" });

    expect(response.status).toBe(201);
    expect(response.body.data.media.bytes).toBeLessThan(JPEG_LARGE.length);
  });

  it("rejects a disallowed content type", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await uploadAs(authHeader, {
      buffer: Buffer.from("%PDF-1.4"),
      filename: "invoice.pdf",
      contentType: "application/pdf",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects SVG, which an `image/*` wildcard would have admitted", async () => {
    const { authHeader } = await createUserAndLogin(app);

    // SVG is a document format that can carry script - stored XSS when served
    // back from our own domain.
    const response = await uploadAs(authHeader, {
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
      filename: "x.svg",
      contentType: "image/svg+xml",
    });

    expect(response.status).toBe(400);
  });

  it("requires a file", async () => {
    const { authHeader } = await createUserAndLogin(app);

    const response = await request(app)
      .post(`${API}/media/upload`)
      .set("Authorization", authHeader)
      .field("tag", "avatar");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("FILE_MISSING");
  });

  it("reports a provider failure as 502 and stores nothing", async () => {
    const { authHeader } = await createUserAndLogin(app);
    stubUploadFailure();

    const response = await uploadAs(authHeader);

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("UPLOAD_FAILED");
    expect(await Media.countDocuments({})).toBe(0);
  });

  it("deletes the asset again if the database write fails", async () => {
    const { authHeader } = await createUserAndLogin(app);
    stubUploadSuccess({ public_id: "gadgetsimp/orphan-candidate" });

    const spy = jest
      .spyOn(Media, "create")
      .mockRejectedValueOnce(new Error("write concern failed"));

    const response = await uploadAs(authHeader);

    expect(response.status).toBe(500);
    // Otherwise the file sits in Cloudinary forever with nothing pointing at
    // it, costing storage and impossible to find.
    expect(cloudinaryStubs.destroy).toHaveBeenCalledWith(
      "gadgetsimp/orphan-candidate",
      expect.objectContaining({ invalidate: true })
    );

    spy.mockRestore();
  });
});

describe("POST /media/my", () => {
  async function seedFor(authHeader, count, tag) {
    for (let i = 0; i < count; i += 1) {
      await uploadAs(authHeader, { filename: `file-${i}.png`, tag });
    }
  }

  it("returns only the caller's uploads", async () => {
    const mine = await createUserAndLogin(app, { email: uniqueEmail("mine") });
    const theirs = await createUserAndLogin(app, { email: uniqueEmail("theirs") });

    await seedFor(mine.authHeader, 2);
    await seedFor(theirs.authHeader, 3);

    const response = await request(app)
      .post(`${API}/media/my`)
      .set("Authorization", mine.authHeader)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.media).toHaveLength(2);
    expect(response.body.data.media.every((m) => m.uploadedBy === mine.id)).toBe(true);
  });

  it("cannot be widened to another user's uploads", async () => {
    const mine = await createUserAndLogin(app, { email: uniqueEmail("scoped") });
    const theirs = await createUserAndLogin(app, { email: uniqueEmail("other") });

    await seedFor(theirs.authHeader, 2);

    // `uploadedBy` is not part of this schema, so it is rejected outright
    // rather than silently ignored - and the owner is pinned from the token.
    const response = await request(app)
      .post(`${API}/media/my`)
      .set("Authorization", mine.authHeader)
      .send({ uploadedBy: theirs.id });

    expect(response.status).toBe(422);
  });

  it("is open to any authenticated role", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.CUSTOMER });

    const response = await request(app)
      .post(`${API}/media/my`)
      .set("Authorization", authHeader)
      .send({});

    expect(response.status).toBe(200);
  });

  it("paginates", async () => {
    const mine = await createUserAndLogin(app, { email: uniqueEmail("pages") });
    await seedFor(mine.authHeader, 5);

    const response = await request(app)
      .post(`${API}/media/my`)
      .set("Authorization", mine.authHeader)
      .send({ limit: 2, page: 2 });

    expect(response.body.data.media).toHaveLength(2);
    expect(response.body.meta).toMatchObject({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  it("filters by tag", async () => {
    const mine = await createUserAndLogin(app, { email: uniqueEmail("tags") });
    await seedFor(mine.authHeader, 2, "avatar");
    await seedFor(mine.authHeader, 1, "banner");

    const response = await request(app)
      .post(`${API}/media/my`)
      .set("Authorization", mine.authHeader)
      .send({ tag: "avatar" });

    expect(response.body.data.media).toHaveLength(2);
  });
});

describe("POST /media/filter", () => {
  it.each([
    [ROLES.OWNER, 200],
    [ROLES.ADMIN, 200],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i", async (role, expected) => {
    const { authHeader } = await createUserAndLogin(app, { role, email: uniqueEmail(role) });

    const response = await request(app)
      .post(`${API}/media/filter`)
      .set("Authorization", authHeader)
      .send({});

    expect(response.status).toBe(expected);
  });

  it("returns every user's uploads", async () => {
    const a = await createUserAndLogin(app, { email: uniqueEmail("a") });
    const b = await createUserAndLogin(app, { email: uniqueEmail("b") });
    const admin = await createUserAndLogin(app, { role: ROLES.ADMIN });

    await uploadAs(a.authHeader);
    await uploadAs(b.authHeader);

    const response = await request(app)
      .post(`${API}/media/filter`)
      .set("Authorization", admin.authHeader)
      .send({});

    expect(response.body.data.media).toHaveLength(2);
  });

  it("narrows to one uploader", async () => {
    const a = await createUserAndLogin(app, { email: uniqueEmail("narrow-a") });
    const b = await createUserAndLogin(app, { email: uniqueEmail("narrow-b") });
    const admin = await createUserAndLogin(app, { role: ROLES.ADMIN });

    await uploadAs(a.authHeader);
    await uploadAs(b.authHeader);

    const response = await request(app)
      .post(`${API}/media/filter`)
      .set("Authorization", admin.authHeader)
      .send({ uploadedBy: a.id });

    expect(response.body.data.media).toHaveLength(1);
    expect(response.body.data.media[0].uploadedBy).toBe(a.id);
  });

  it("searches filenames with metacharacters treated literally", async () => {
    const user = await createUserAndLogin(app, { email: uniqueEmail("search") });
    const admin = await createUserAndLogin(app, { role: ROLES.ADMIN });

    await uploadAs(user.authHeader, { filename: "holiday-photo.png" });

    const hit = await request(app)
      .post(`${API}/media/filter`)
      .set("Authorization", admin.authHeader)
      .send({ search: "holiday" });
    expect(hit.body.data.media).toHaveLength(1);

    const wildcard = await request(app)
      .post(`${API}/media/filter`)
      .set("Authorization", admin.authHeader)
      .send({ search: ".*" });
    expect(wildcard.body.data.media).toHaveLength(0);
  });

  it("rejects an unknown filter key", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .post(`${API}/media/filter`)
      .set("Authorization", authHeader)
      .send({ nope: true });

    expect(response.status).toBe(422);
  });
});

describe("DELETE /media/:id", () => {
  async function uploadedId(authHeader) {
    const response = await uploadAs(authHeader);
    return response.body.data.media;
  }

  it("removes the asset from Cloudinary and the record from the database", async () => {
    const user = await createUserAndLogin(app, { email: uniqueEmail("del") });
    const admin = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const media = await uploadedId(user.authHeader);

    const response = await request(app)
      .delete(`${API}/media/${media.id}`)
      .set("Authorization", admin.authHeader);

    expect(response.status).toBe(200);
    expect(cloudinaryStubs.destroy).toHaveBeenCalledWith(
      media.publicId,
      expect.objectContaining({ resource_type: "image" })
    );
    expect(await Media.findById(media.id)).toBeNull();
  });

  it("keeps the record if the provider delete fails, so it can be retried", async () => {
    const user = await createUserAndLogin(app, { email: uniqueEmail("retry") });
    const admin = await createUserAndLogin(app, { role: ROLES.ADMIN });
    const media = await uploadedId(user.authHeader);

    cloudinaryStubs.destroy.mockRejectedValueOnce(new Error("cloudinary unreachable"));

    const response = await request(app)
      .delete(`${API}/media/${media.id}`)
      .set("Authorization", admin.authHeader);

    expect(response.status).toBeGreaterThanOrEqual(500);
    // Deleting the row first would have stranded the file with nothing
    // pointing at it.
    expect(await Media.findById(media.id)).not.toBeNull();
  });

  it.each([
    [ROLES.OWNER, 200],
    [ROLES.ADMIN, 200],
    [ROLES.MODERATOR, 403],
    [ROLES.CUSTOMER, 403],
  ])("%s -> %i", async (role, expected) => {
    const user = await createUserAndLogin(app, { email: uniqueEmail("perm") });
    const actor = await createUserAndLogin(app, { role, email: uniqueEmail(`actor-${role}`) });
    const media = await uploadedId(user.authHeader);

    const response = await request(app)
      .delete(`${API}/media/${media.id}`)
      .set("Authorization", actor.authHeader);

    expect(response.status).toBe(expected);
  });

  it("404s for an unknown id", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .delete(`${API}/media/999999`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(404);
  });

  it("rejects a non-numeric id at the edge", async () => {
    const { authHeader } = await createUserAndLogin(app, { role: ROLES.ADMIN });

    const response = await request(app)
      .delete(`${API}/media/not-a-number`)
      .set("Authorization", authHeader);

    expect(response.status).toBe(422);
  });
});

describe("WebP conversion", () => {
  it("stores every upload as WebP, whatever arrived", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("conv") });

    const jpeg = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 5, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer();

    for (const [buffer, filename, contentType] of [
      [PNG, "a.png", "image/png"],
      [jpeg, "b.jpg", "image/jpeg"],
      [GIF_ANIMATED, "c.gif", "image/gif"],
    ]) {
      const response = await uploadAs(authHeader, { buffer, filename, contentType });

      expect(response.status).toBe(201);
      expect(response.body.data.media.format).toBe("webp");
    }
  });

  it("records what arrived so the saving is visible", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("saving") });

    const response = await uploadAs(authHeader, { buffer: JPEG_LARGE, filename: "big.jpg" });
    const { media } = response.body.data;

    expect(media.originalFormat).toBe("jpeg");
    expect(media.originalBytes).toBe(JPEG_LARGE.length);
    expect(media.bytes).toBeLessThan(media.originalBytes);
  });

  it("sends the converted bytes to Cloudinary, not the original", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("sent") });

    await uploadAs(authHeader, { buffer: JPEG_LARGE, filename: "big.jpg" });

    // The whole point of converting locally: only the smaller file crosses
    // the network.
    const uploaded = await sharp(uploadedBuffer()).metadata();
    expect(uploaded.format).toBe("webp");
    expect(uploadedBuffer().length).toBeLessThan(JPEG_LARGE.length);
  });

  it("caps the longest edge instead of storing full-resolution originals", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("cap") });

    const huge = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .jpeg()
      .toBuffer();

    const response = await uploadAs(authHeader, { buffer: huge, filename: "huge.jpg" });

    expect(response.body.data.media.width).toBe(2000);
    expect(response.body.data.media.height).toBe(1500);
  });

  it("never upscales a small image", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("small") });

    // 40x30 must stay 40x30 - blowing it up to the cap would cost bytes and
    // look worse.
    const response = await uploadAs(authHeader);

    expect(response.body.data.media.width).toBe(40);
    expect(response.body.data.media.height).toBe(30);
  });

  it("keeps an animated GIF animated", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("anim") });

    const response = await uploadAs(authHeader, {
      buffer: GIF_ANIMATED,
      filename: "loop.gif",
      contentType: "image/gif",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.media.animated).toBe(true);

    // Flattening to a single frame would silently destroy the upload.
    const converted = await sharp(uploadedBuffer()).metadata();
    expect(converted.pages).toBe(2);
    // Height is reported per frame, not for the whole filmstrip.
    expect(response.body.data.media.height).toBe(20);
  });

  it("strips EXIF, including GPS coordinates", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("exif") });

    const withExif = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withExif({ IFD0: { Copyright: "Raju", Software: "SecretCamera9000" } })
      .jpeg()
      .toBuffer();

    // Confirm the fixture really carries it, or the assertion proves nothing.
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    await uploadAs(authHeader, { buffer: withExif, filename: "photo.jpg", contentType: "image/jpeg" });

    // Users have no idea their photos carry the location they were taken.
    const stored = await sharp(uploadedBuffer()).metadata();
    expect(stored.exif).toBeUndefined();
  });

  it("rejects a non-image wearing an image content type", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("fake") });

    // Passes multer's header check; fails the decode, which is the check that
    // actually means something.
    const response = await uploadAs(authHeader, {
      buffer: Buffer.from("MZ\x90\x00this is an executable, not a png"),
      filename: "totally-a.png",
      contentType: "image/png",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_IMAGE");
    expect(cloudinaryStubs.uploadStream).not.toHaveBeenCalled();
  });

  it("rejects a truncated image", async () => {
    const { authHeader } = await createUserAndLogin(app, { email: uniqueEmail("trunc") });

    const response = await uploadAs(authHeader, {
      buffer: JPEG_LARGE.subarray(0, 20),
      filename: "half.jpg",
      contentType: "image/jpeg",
    });

    expect(response.status).toBe(400);
  });
});

/** The buffer handed to Cloudinary by the most recent upload. */
function uploadedBuffer() {
  return lastUploadedBuffer;
}
