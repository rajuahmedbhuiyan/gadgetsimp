"use strict";

// Must precede the app require so config/env freezes with both providers on.
process.env.FACEBOOK_APP_ID = "1234567890";
process.env.FACEBOOK_APP_SECRET = "test-app-secret";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";

const request = require("supertest");
const createApp = require("../src/app");
const User = require("../src/modules/user/user.model");
const PendingRegistration = require("../src/modules/auth/pendingRegistration.model");
const { API, createUserAndLogin, uniqueEmail } = require("./helpers");
const { AUTH_PROVIDERS, ROLES, USER_STATUS } = require("../src/shared/constants");

const app = createApp();
const SOCIAL = `${API}/auth/social-login`;

/**
 * Each provider is stubbed at its real boundary:
 *
 *   - Facebook talks HTTP, so `fetch` is replaced.
 *   - Google verifies a JWT locally through google-auth-library, so
 *     `OAuth2Client.verifyIdToken` is mocked.
 *
 * Stubbing our own provider modules instead would test nothing but the
 * registry wiring.
 */
const realFetch = global.fetch;

function stubFacebook({ appId = "1234567890", isValid = true, expiresAt = 0, profile = {} } = {}) {
  global.fetch = jest.fn(async (url) => {
    const json = String(url).includes("debug_token")
      ? {
          data: {
            app_id: appId,
            is_valid: isValid,
            user_id: profile.id ?? "fb-1",
            expires_at: expiresAt,
          },
        }
      : {
          id: profile.id ?? "fb-1",
          first_name: profile.first_name ?? "Rafi",
          last_name: profile.last_name ?? "Hasan",
          email: "email" in profile ? profile.email : "rafi@facebook-user.dev",
          picture: { data: { url: "https://cdn.fb/pic.jpg" } },
        };

    return { ok: true, status: 200, json: async () => json };
  });
}

jest.mock("google-auth-library", () => {
  const verifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
    __verifyIdToken: verifyIdToken,
  };
});

const { __verifyIdToken: verifyIdToken } = require("google-auth-library");

function stubGoogle(payload) {
  verifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

function stubGoogleFailure(message) {
  verifyIdToken.mockRejectedValue(new Error(message));
}

const googlePayload = (overrides = {}) => ({
  sub: "google-1",
  email: "nadia@gmail.com",
  email_verified: true,
  given_name: "Nadia",
  family_name: "Khan",
  picture: "https://cdn.google/pic.jpg",
  ...overrides,
});

const TOKEN = "t".repeat(40);

afterEach(() => {
  global.fetch = realFetch;
  verifyIdToken.mockReset();
});

describe("POST /auth/social-login - shared behaviour", () => {
  it("rejects an unknown provider type", async () => {
    const response = await request(app).post(SOCIAL).send({ type: "TWITTER", token: TOKEN });

    expect(response.status).toBe(422);
  });

  it("requires both type and token", async () => {
    const response = await request(app).post(SOCIAL).send({ token: TOKEN });

    expect(response.status).toBe(422);
    expect(response.body.errors.some((issue) => issue.field === "body.type")).toBe(true);
  });

  it("validates the token before calling the provider", async () => {
    global.fetch = jest.fn();

    const response = await request(app)
      .post(SOCIAL)
      .send({ type: "FACEBOOK", token: "short" });

    expect(response.status).toBe(422);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("GET /auth/providers", () => {
  it("lists what this deployment can serve", async () => {
    const response = await request(app).get(`${API}/auth/providers`);

    expect(response.status).toBe(200);
    expect(response.body.data.providers).toEqual(
      expect.arrayContaining(["EMAIL", "FACEBOOK", "GOOGLE"])
    );
  });
});

describe.each([
  [
    "FACEBOOK",
    (opts) => stubFacebook(opts),
    (id, email) => ({ profile: { id, email } }),
    (id) => ({ profile: { id, email: null } }),
  ],
  [
    "GOOGLE",
    (opts) => stubGoogle(opts.payload),
    (id, email) => ({ payload: googlePayload({ sub: id, email }) }),
    (id) => ({ payload: googlePayload({ sub: id, email: undefined }) }),
  ],
])("POST /auth/social-login - %s", (type, stub, withEmail, withoutEmail) => {
  it("creates an account on first sign-in, already verified", async () => {
    const email = `${type.toLowerCase()}-new@social.dev`;
    stub(withEmail(`${type}-100`, email));

    const response = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(response.status).toBe(200);
    const { user } = response.body.data;

    expect(user.email).toBe(email);
    expect(user.authProviders).toEqual([type]);
    // The provider already proved the address - no second verification step.
    expect(user.emailVerifiedAt).toEqual(expect.any(String));
    expect(user.role).toBe(ROLES.CUSTOMER);
    expect(typeof user.id).toBe("number");
    expect(response.body.data.accessToken).toEqual(expect.any(String));
  });

  it("never exposes the provider id", async () => {
    const providerId = `${type}-secret-id`;
    stub(withEmail(providerId, `${type.toLowerCase()}-hidden@social.dev`));

    const response = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(response.body.data.user).not.toHaveProperty("socialAccounts");
    expect(JSON.stringify(response.body)).not.toContain(providerId);
  });

  it("signs the same user back in without creating a duplicate", async () => {
    const email = `${type.toLowerCase()}-repeat@social.dev`;

    stub(withEmail(`${type}-103`, email));
    const first = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    stub(withEmail(`${type}-103`, email));
    const second = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(await User.countDocuments({ email })).toBe(1);
  });

  it("refuses social login for an existing email/password account", async () => {
    const email = uniqueEmail(`link-${type.toLowerCase()}`);
    await createUserAndLogin(app, { email });

    stub(withEmail(`${type}-200`, email));
    const response = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("EMAIL_LOGIN_REQUIRED");
    expect(response.body.message).toMatch(/email and password/i);
    expect(await User.countDocuments({ email })).toBe(1);

    const stored = await User.findOne({ email }).select("+socialAccounts");
    expect(stored.authProviders).toEqual([AUTH_PROVIDERS.EMAIL]);
    expect(stored.socialAccounts).toHaveLength(0);
  });

  it("leaves the original password working after refusing social login", async () => {
    const email = uniqueEmail(`stillworks-${type.toLowerCase()}`);
    await createUserAndLogin(app, { email });

    stub(withEmail(`${type}-201`, email));
    await request(app).post(SOCIAL).send({ type, token: TOKEN });

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "Passw0rd!" });

    expect(login.status).toBe(200);
  });

  it("explains itself when the provider shares no email", async () => {
    stub(withoutEmail(`${type}-400`));

    const response = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("SOCIAL_EMAIL_MISSING");
    expect(await User.countDocuments({})).toBe(0);
  });

  it("refuses a deactivated account", async () => {
    const email = `${type.toLowerCase()}-disabled@social.dev`;

    stub(withEmail(`${type}-500`, email));
    await request(app).post(SOCIAL).send({ type, token: TOKEN });
    await User.updateOne({ email }, { status: USER_STATUS.SUSPENDED });

    stub(withEmail(`${type}-500`, email));
    const response = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("clears a redundant pending email signup for the same address", async () => {
    const email = uniqueEmail(`pending-${type.toLowerCase()}`);

    await request(app)
      .post(`${API}/auth/register`)
      .send({ fullName: "Rafi Hasan", email, password: "Str0ngPass" });
    expect(await PendingRegistration.exists({ email })).not.toBeNull();

    stub(withEmail(`${type}-600`, email));
    await request(app).post(SOCIAL).send({ type, token: TOKEN });

    expect(await PendingRegistration.exists({ email })).toBeNull();
  });

  it("has no password, so password login and change are refused", async () => {
    const email = `${type.toLowerCase()}-nopw@social.dev`;
    stub(withEmail(`${type}-700`, email));
    const signIn = await request(app).post(SOCIAL).send({ type, token: TOKEN });

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email, password: "AnythingAtAll1" });
    expect(login.status).toBe(401);
    expect(login.body.code).toBe("SOCIAL_LOGIN_REQUIRED");
    expect(login.body.message).toMatch(new RegExp(type, "i"));
    expect(login.body.message).toMatch(/does not have an email password/i);

    const change = await request(app)
      .post(`${API}/auth/change-password`)
      .set("Authorization", `Bearer ${signIn.body.data.accessToken}`)
      .send({ currentPassword: "Whatever1", newPassword: "BrandNewP4ss" });
    expect(change.status).toBe(400);
    expect(change.body.code).toBe("PASSWORD_NOT_SET");
    expect(change.body.message).toMatch(new RegExp(type, "i"));
  });
});

describe("Facebook-specific verification", () => {
  it("rejects a token issued to a different Facebook app", async () => {
    // The check that stops a token from someone else's app being replayed
    // here to sign in as that user.
    stubFacebook({ appId: "9999999999", profile: { id: "fb-300" } });

    const response = await request(app)
      .post(SOCIAL)
      .send({ type: "FACEBOOK", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_TOKEN_WRONG_AUDIENCE");
    expect(await User.countDocuments({})).toBe(0);
  });

  it("rejects an invalid token", async () => {
    stubFacebook({ isValid: false });

    const response = await request(app)
      .post(SOCIAL)
      .send({ type: "FACEBOOK", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_TOKEN_INVALID");
  });

  it("rejects an expired token", async () => {
    stubFacebook({ expiresAt: Math.floor(Date.now() / 1000) - 60, profile: { id: "fb-301" } });

    const response = await request(app)
      .post(SOCIAL)
      .send({ type: "FACEBOOK", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_TOKEN_EXPIRED");
  });
});

describe("Google-specific verification", () => {
  it("verifies the ID token against our client id as the audience", async () => {
    stubGoogle(googlePayload({ sub: "google-aud", email: "aud@gmail.com" }));

    await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: TOKEN,
      audience: "test-client.apps.googleusercontent.com",
    });
  });

  it("rejects an ID token issued for a different client", async () => {
    stubGoogleFailure("Wrong recipient, payload audience != requiredAudience");

    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_TOKEN_WRONG_AUDIENCE");
  });

  it("rejects an expired ID token", async () => {
    stubGoogleFailure("Token used too late, 1700000000 > 1699999999");

    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_TOKEN_EXPIRED");
  });

  it("rejects a forged or malformed ID token", async () => {
    stubGoogleFailure("Invalid token signature");

    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_TOKEN_INVALID");
  });

  it("refuses an account whose Google email is unverified", async () => {
    // Trusting an unverified address would let someone claim a stranger's
    // account through the email-linking branch.
    stubGoogle(googlePayload({ email: "victim@example.com", email_verified: false }));

    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("SOCIAL_EMAIL_UNVERIFIED");
    expect(await User.countDocuments({})).toBe(0);
  });

  it("takes `name` verbatim when given/family names are absent", async () => {
    stubGoogle({
      sub: "google-noname",
      email: "solo@gmail.com",
      email_verified: true,
      name: "Ayesha Siddiqua",
    });

    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.body.data.user.fullName).toBe("Ayesha Siddiqua");
  });

  // A single-word display name is stored as-is rather than padded with an
  // invented surname.
  it("stores a mononym from the provider unchanged", async () => {
    stubGoogle({
      sub: "google-mononym",
      email: "mononym@gmail.com",
      email_verified: true,
      name: "Ayesha",
    });

    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.body.data.user.fullName).toBe("Ayesha");
  });
});

describe("one person, both providers", () => {
  it("allows a social-only account to link another social provider", async () => {
    const email = uniqueEmail("both");

    stubFacebook({ profile: { id: "fb-both", email } });
    const facebook = await request(app)
      .post(SOCIAL)
      .send({ type: "FACEBOOK", token: TOKEN });

    stubGoogle(googlePayload({ sub: "google-both", email }));
    const response = await request(app).post(SOCIAL).send({ type: "GOOGLE", token: TOKEN });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(facebook.body.data.user.id);
    expect(response.body.data.user.authProviders).toEqual(
      expect.arrayContaining(["FACEBOOK", "GOOGLE"])
    );
    expect(await User.countDocuments({ email })).toBe(1);

    const stored = await User.findById(facebook.body.data.user.id).select("+socialAccounts");
    expect(stored.socialAccounts).toHaveLength(2);
  });
});

describe("unconfigured provider", () => {
  /**
   * The provider module's own `isConfigured` is stubbed rather than deleting
   * an environment variable and re-requiring: env juggling makes the result
   * depend on whatever the developer's `.env` happens to contain, which is
   * how a test passes on one machine and fails on another.
   */
  const googleProvider = require("../src/modules/auth/providers/google");

  it("answers 503 instead of failing mid-verification", async () => {
    const spy = jest.spyOn(googleProvider, "isConfigured").mockReturnValue(false);

    const response = await request(app)
      .post(SOCIAL)
      .send({ type: "GOOGLE", token: TOKEN });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("SOCIAL_PROVIDER_NOT_CONFIGURED");

    spy.mockRestore();
  });

  it("omits it from the advertised provider list", async () => {
    const spy = jest.spyOn(googleProvider, "isConfigured").mockReturnValue(false);

    const response = await request(app).get(`${API}/auth/providers`);

    expect(response.body.data.providers).toEqual(["EMAIL", "FACEBOOK"]);

    spy.mockRestore();
  });
});
