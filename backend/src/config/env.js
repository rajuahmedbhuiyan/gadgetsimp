"use strict";

/**
 * Environment loading + validation.
 *
 * Nothing else in the codebase reads `process.env` directly. Every module
 * imports this frozen object instead, so a missing or malformed variable
 * crashes at boot with a readable message rather than surfacing as
 * `undefined` deep inside a request months later.
 */

const path = require("node:path");
const { z } = require("zod");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env"),
  quiet: true,
});

const durationString = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, "expected a duration like 15m, 7d, 900s");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith("/").default("/api/v1"),

  // Number of reverse proxies in front of the app. This is what makes
  // `req.ip` trustworthy, which is what makes IP rate limiting trustworthy.
  // 0 = no proxy (local). 1 = one proxy (Nginx / Render / Railway).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  // Checked in more detail than "is a non-empty string" because every way of
  // getting this wrong surfaces as the same opaque driver error minutes later.
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine((uri) => /^mongodb(\+srv)?:\/\//.test(uri), {
      message: "must start with mongodb:// or mongodb+srv:// (Atlas uses mongodb+srv://)",
    })
    // Atlas hands you the string with `<db_password>` still in it. Left in
    // place it reads as an authentication failure.
    .refine((uri) => !/<[^>]+>/.test(uri), {
      message:
        "still contains a placeholder like <db_password> - replace it, angle brackets included",
    })
    .refine((uri) => /^mongodb(\+srv)?:\/\/[^/]*@?[^/@]+/.test(uri) && uri.split("//")[1]?.length > 0, {
      message: "is missing a host, e.g. mongodb+srv://user:pass@cluster0.abc.mongodb.net/dbname",
    })
    // An unencoded @ or / in the password splits the URI in the wrong place,
    // and the driver reports it as bad credentials rather than a bad URI.
    .refine(
      (uri) => {
        const credentials = uri.replace(/^mongodb(\+srv)?:\/\//, "").split("@");
        return credentials.length <= 2;
      },
      {
        message:
          "has more than one '@' - percent-encode special characters in the password (@ becomes %40, # becomes %23, / becomes %2F)",
      }
    ),

  // Optional. Without it, rate limit counters live in process memory and are
  // lost on restart and unshared between instances. See config/redis.js.
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: durationString.default("15m"),
  JWT_REFRESH_EXPIRES_IN: durationString.default("30d"),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Comma-separated list of browser origins allowed to send credentials.
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  COOKIE_DOMAIN: z.string().optional(),

  /**
   * SameSite policy for the refresh cookie. See shared/tokens.js - this is the
   * setting that decides whether the browser keeps the cookie at all when the
   * frontend and API are on different sites.
   */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

  /**
   * Also return the refresh token in the JSON body, not only as the httpOnly
   * cookie.
   *
   * Needed by any client that cannot hold cookies - a native mobile app, a
   * CLI, Postman - and convenient while developing, where the cookie is
   * invisible in a response viewer.
   *
   * The cost is real: a token in the body is a token JavaScript can read, so
   * an XSS on the storefront can exfiltrate it, which is exactly what the
   * httpOnly cookie exists to prevent. The cookie is still set either way, so
   * a browser client should keep using it and ignore the body field. Set this
   * to false for a web-only deployment.
   */
  REFRESH_TOKEN_IN_BODY: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  // Where the verification link points - the frontend, not the API.
  APP_URL: z.url("APP_URL must be a valid URL").default("http://localhost:3000"),

  /**
   * Mail transport.
   *
   * `gmail` fills in smtp.gmail.com automatically and only needs
   * GMAIL_USER + GMAIL_APP_PASSWORD. `smtp` uses the SMTP_* values. `log`
   * (the default) writes messages to the logger instead of sending them, so
   * the signup flow works on a fresh clone with no mail account at all.
   */
  MAIL_PROVIDER: z.enum(["log", "gmail", "smtp"]).default("log"),

  GMAIL_USER: z.string().optional(),
  // Google rejects account passwords over SMTP; this must be a 16-character
  // App Password, which requires 2-Step Verification to be enabled.
  GMAIL_APP_PASSWORD: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("GadgetSimp <no-reply@gadgetsimp.dev>"),

  // Free Gmail allows roughly 500 messages/day (Workspace ~2000). Used to warn
  // as the budget is consumed rather than discovering it via bounced signups.
  MAIL_DAILY_QUOTA: z.coerce.number().int().positive().default(500),

  /**
   * Social sign-in. Each provider is independently optional - an unconfigured
   * one reports itself as unavailable through /auth/social-login rather than
   * failing in a confusing way, so you can ship with Google only, or neither.
   *
   * Facebook: Meta app dashboard, Settings > Basic.
   */
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),

  /**
   * Google: the OAuth 2.0 **Web application** client ID from Google Cloud
   * Console. Only the client ID is needed here - verifying a Google ID token
   * checks a signature against Google's public keys and the `aud` claim, so
   * no client secret is involved.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),

  /**
   * Cloudinary, for media uploads. All three come from the dashboard and must
   * be set together - like the social providers, an unconfigured integration
   * reports itself rather than failing mid-request.
   *
   * The API secret signs upload requests, so it stays server-side.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Where uploads land in the Cloudinary media library. Keeping them under one
  // folder makes the account browsable and the assets easy to purge.
  CLOUDINARY_FOLDER: z.string().default("gadgetsimp"),

  /**
   * WebP encode quality, 1-100. Every upload is re-encoded to WebP before
   * storage - see shared/imageProcessor.js.
   *
   * 80 is the usual sweet spot: visually indistinguishable from the original
   * for photographs while cutting size substantially. Above ~90 the file grows
   * fast for differences nobody can see; below ~60 artefacts start showing on
   * flat colour and text.
   */
  MEDIA_WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(80),

  /**
   * Longest edge, in pixels. Larger images are scaled down, never up.
   * 2000px covers full-bleed hero images on a retina display; a 6000px phone
   * photo stored at full size is bytes nobody will ever see.
   */
  MEDIA_MAX_DIMENSION: z.coerce.number().int().min(64).max(8000).default(2000),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  SWAGGER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
})
  /**
   * Cross-field checks. A half-configured provider is worse than an
   * unconfigured one: it looks set up, then fails on a real user's signup.
   */
  .superRefine((config, ctx) => {
    if (config.MAIL_PROVIDER === "gmail") {
      if (!config.GMAIL_USER) {
        ctx.addIssue({
          code: "custom",
          path: ["GMAIL_USER"],
          message: "required when MAIL_PROVIDER=gmail (your full Gmail address)",
        });
      }
      if (!config.GMAIL_APP_PASSWORD) {
        ctx.addIssue({
          code: "custom",
          path: ["GMAIL_APP_PASSWORD"],
          message:
            "required when MAIL_PROVIDER=gmail - a 16-character App Password, not your Google account password",
        });
      }
    }

    if (config.MAIL_PROVIDER === "smtp" && !config.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "required when MAIL_PROVIDER=smtp",
      });
    }

    // One without the other cannot verify a Facebook token, so treat a
    // partial pair as a configuration error rather than silently disabling.
    const hasAppId = Boolean(config.FACEBOOK_APP_ID);
    const hasSecret = Boolean(config.FACEBOOK_APP_SECRET);

    if (hasAppId !== hasSecret) {
      ctx.addIssue({
        code: "custom",
        path: [hasAppId ? "FACEBOOK_APP_SECRET" : "FACEBOOK_APP_ID"],
        message: "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set together",
      });
    }

    // A Google client ID that is not actually a client ID is a common
    // copy-paste slip (the API key or the client *secret* gets pasted here),
    // and it surfaces as an opaque "audience mismatch" on a real sign-in.
    if (config.GOOGLE_CLIENT_ID && !config.GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com")) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message:
          "should end with .apps.googleusercontent.com - use the OAuth 2.0 Web application client ID, not an API key or client secret",
      });
    }

    // `SameSite=None` without `Secure` is rejected outright by every current
    // browser, so the cookie would simply never be stored.
    if (config.COOKIE_SAMESITE === "none" && config.NODE_ENV !== "production") {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SAMESITE"],
        message:
          "'none' requires HTTPS (Secure), so it only works in production - use 'lax' locally",
      });
    }

    // All three Cloudinary values or none - two out of three cannot sign an
    // upload, and a partial config looks configured right up until someone
    // tries to upload.
    const cloudinaryValues = [
      config.CLOUDINARY_CLOUD_NAME,
      config.CLOUDINARY_API_KEY,
      config.CLOUDINARY_API_SECRET,
    ];
    const cloudinarySet = cloudinaryValues.filter(Boolean).length;

    if (cloudinarySet !== 0 && cloudinarySet !== cloudinaryValues.length) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_CLOUD_NAME"],
        message:
          "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set together",
      });
    }

    if (config.NODE_ENV === "production" && config.MAIL_PROVIDER === "log") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_PROVIDER"],
        message:
          "cannot be 'log' in production - signup emails would never send and nobody could register",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  console.error(`\nInvalid environment configuration:\n${details}\n`);
  console.error("Copy .env.example to .env and fill in the missing values.\n");
  process.exit(1);
}

const env = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  isDevelopment: parsed.data.NODE_ENV === "development",
});

module.exports = env;
