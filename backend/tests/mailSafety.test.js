"use strict";

/**
 * The suite must never send a real email.
 *
 * A developer's `.env` legitimately holds working Gmail credentials, and
 * dotenv hands them to anything that loads `config/env`. Without a hard
 * override, one `npm test` run sends hundreds of messages to fake addresses,
 * exhausts Gmail's ~500/day cap - which then breaks signup for real users -
 * and puts a live SMTP round trip in front of every test.
 *
 * That happened. These assertions exist so it cannot happen again quietly.
 */

// Deliberately pretend a real provider is configured, exactly as a developer's
// .env would. The guards below must override it regardless.
process.env.MAIL_PROVIDER = "gmail";
process.env.GMAIL_USER = "someone@gmail.com";
process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";

const nodemailer = require("nodemailer");
const request = require("supertest");
const createApp = require("../src/app");
const mailer = require("../src/config/mailer");
const { API, uniqueEmail } = require("./helpers");

const app = createApp();

describe("tests can never send real email", () => {
  it("reports the log transport even when MAIL_PROVIDER says gmail", () => {
    expect(mailer.isLogTransport()).toBe(true);
  });

  it("builds a jsonTransport, never an SMTP connection", () => {
    const spy = jest.spyOn(nodemailer, "createTransport");
    mailer.closeMailer(); // drop any cached transport so a fresh one is built

    // Force transport construction through a real send.
    return mailer
      .sendMail({ to: "nobody@test.dev", subject: "x", text: "x", html: "<p>x</p>" })
      .then(() => {
        expect(spy).toHaveBeenCalledWith({ jsonTransport: true });

        // Nothing that would open a socket to Gmail.
        const config = spy.mock.calls.at(-1)[0];
        expect(config.host).toBeUndefined();
        expect(config.auth).toBeUndefined();
        expect(config.pool).toBeUndefined();

        spy.mockRestore();
      });
  });

  it("captures signup mail in memory instead of sending it", async () => {
    const email = uniqueEmail("safety");

    await request(app)
      .post(`${API}/auth/register`)
      .send({ fullName: "Mail Safety", email, password: "Str0ngPass" });

    // Present in the in-memory outbox, which only the log transport populates.
    expect(mailer.getSentMessages().some((message) => message.to === email)).toBe(true);
  });

  it("never sends mail to internal social placeholder emails", async () => {
    const result = await mailer.sendMail({
      to: "facebook-123@social.local.gadgetsimp",
      subject: "x",
      text: "x",
      html: "<p>x</p>",
    });

    expect(result).toEqual({
      skipped: true,
      reason: "INTERNAL_PLACEHOLDER_EMAIL",
    });
    expect(mailer.getSentMessages()).not.toContainEqual(
      expect.objectContaining({ to: "facebook-123@social.local.gadgetsimp" })
    );
  });

  it("keeps the guard in the mailer itself, not only in tests/setup.js", () => {
    // setup.js forces MAIL_PROVIDER=log, but a stray script that loads the
    // mailer directly would bypass that. `env.isTest` is the backstop.
    const source = require("node:fs").readFileSync(
      require.resolve("../src/config/mailer"),
      "utf8"
    );

    expect(source).toMatch(/env\.isTest/);
  });
});
