"use strict";

const nodemailer = require("nodemailer");
const env = require("./env");
const logger = require("./logger");
const ApiError = require("../shared/ApiError");

/**
 * Outbound email.
 *
 * Mail providers, selected by MAIL_PROVIDER:
 *
 *   - **brevo** - Brevo transactional email over HTTPS. This works on hosts
 *     such as Render Free that block outbound SMTP ports.
 *   - **gmail** - smtp.gmail.com over STARTTLS, authenticated with a Google
 *     App Password. Free, and capped at roughly 500 messages per day.
 *   - **smtp**  - any other SMTP server, configured through SMTP_*.
 *   - **log**   - the default. Writes the message (verification link included)
 *     to the logger instead of sending it. Registration gates every other
 *     flow, so requiring a mail account before the API can be run at all
 *     would make the project needlessly hard to start. In tests the same
 *     transport records messages in memory for assertions.
 *
 * Sending is deliberately awaited at the call site rather than fired and
 * forgotten: an account that can never be verified is worse than a signup
 * that fails loudly.
 */

let transport = null;
const sentMessages = [];

// Provider free-tier caps are hard daily ceilings, and hitting one breaks signup
// for everyone. This counts sends so the log warns on approach. It is
// per-process and resets on restart, so treat it as an early-warning signal
// rather than an accurate ledger - the provider's own count is authoritative.
let quota = { date: today(), sent: 0 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tests never send real mail, whatever MAIL_PROVIDER says.
 *
 * The belt to `tests/setup.js`'s braces, and worth having: a `.env` holding
 * real Gmail credentials is normal, and one test run that picks them up sends
 * hundreds of messages to fake addresses and exhausts the daily quota. This
 * makes that impossible rather than merely unlikely.
 */
function isLogTransport() {
  return env.isTest || env.MAIL_PROVIDER === "log";
}

function buildTransport() {
  // Checked first, so a test run can never construct a real SMTP transport.
  if (env.isTest) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (env.MAIL_PROVIDER === "gmail") {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS is negotiated on 587; `true` is for 465 only
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },

      // Gmail drops connections that open too fast or too often. Pooling
      // reuses a small number of authenticated connections and paces sends,
      // which is what keeps a burst of signups from tripping its throttles.
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      rateDelta: 1000,
      rateLimit: 3, // at most 3 messages per second
    });
  }

  if (env.MAIL_PROVIDER === "smtp") {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      pool: true,
      maxConnections: 5,
    });
  }

  // `jsonTransport` builds the complete message without a network call, so
  // the dev path exercises the same nodemailer code as production.
  return nodemailer.createTransport({ jsonTransport: true });
}

function getTransport() {
  if (!transport) transport = buildTransport();
  return transport;
}

function parseMailFrom(value) {
  const match = String(value).match(/^\s*(?:"?([^"<]*)"?)?\s*<([^<>]+)>\s*$/);
  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].trim(),
    };
  }

  return { email: String(value).trim() };
}

async function brevoRequest(path, options = {}) {
  const response = await fetch(`https://api.brevo.com/v3${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "api-key": env.BREVO_API_KEY,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.ok) return response;

  const body = await response.text();
  const error = new Error(`Brevo API ${response.status}: ${body}`);
  error.code = "EBREVO";
  error.responseCode = response.status;
  error.response = body;
  error.provider = "brevo";
  throw error;
}

async function sendBrevoMail({ to, subject, html, text }) {
  const sender = parseMailFrom(env.MAIL_FROM);

  const response = await brevoRequest("/smtp/email", {
    method: "POST",
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { messageId: data.messageId };
}

/**
 * Confirms the mail credentials at startup rather than on a real user's
 * first signup.
 */
async function verifyMailer() {
  if (isLogTransport()) {
    logger.warn(
      "MAIL_PROVIDER=log - emails are written to the log, not sent. Set MAIL_PROVIDER=gmail to send for real."
    );
    return;
  }

  if (env.MAIL_PROVIDER === "brevo") {
    await brevoRequest("/account");
    logger.info("Brevo transactional email API ready");
    return;
  }

  await getTransport().verify();

  if (env.MAIL_PROVIDER === "gmail") {
    logger.info(
      `Gmail SMTP ready as ${env.GMAIL_USER} (daily quota ~${env.MAIL_DAILY_QUOTA})`
    );
  } else {
    logger.info(`SMTP ready at ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  }
}

function trackQuota(to) {
  if (quota.date !== today()) quota = { date: today(), sent: 0 };

  quota.sent += 1;

  const remaining = env.MAIL_DAILY_QUOTA - quota.sent;

  if (remaining <= 0) {
    logger.error(
      { sent: quota.sent, quota: env.MAIL_DAILY_QUOTA, to },
      "Daily email quota exhausted - the provider may start rejecting messages and signups will fail"
    );
  } else if (remaining <= env.MAIL_DAILY_QUOTA * 0.2) {
    logger.warn(
      { sent: quota.sent, remaining },
      "Approaching the daily email quota"
    );
  }
}

/**
 * Turns a raw SMTP failure into something the API can answer with.
 *
 * Left alone, a provider rejection propagates as an unrecognised error and
 * the caller gets a bare 500 "Something went wrong" - which tells a developer
 * nothing and a user less. These are upstream failures, not bugs in the
 * request, so they map to 503 with a code the client can branch on.
 */
function asDeliveryError(error) {
  const response = String(error?.response ?? error?.message ?? "");

  if (error?.provider === "brevo") {
    let providerMessage = response;

    try {
      const body = JSON.parse(response);
      providerMessage = body.message || body.code || response;
    } catch (_parseError) {
      // Brevo usually returns JSON, but keep the raw text for non-JSON errors.
    }

    logger.error(
      { err: error, status: error.responseCode, response },
      "Brevo email delivery failed - check BREVO_API_KEY, verified sender/domain, and transactional email activation"
    );

    return new ApiError(503, "Brevo could not send that email. Check your verified sender and API key.", {
      code: "BREVO_DELIVERY_FAILED",
      errors: [
        { field: "BREVO_API_KEY", message: `Brevo status ${error.responseCode}` },
        { field: "MAIL_FROM", message: providerMessage },
      ],
      cause: error,
    });
  }

  // Gmail's daily cap. Distinctive enough to name, because the operator fix
  // (wait for the rolling 24h reset, or switch provider) is entirely
  // different from a wrong password or a DNS failure.
  if (error?.responseCode === 550 && /sending limit exceeded/i.test(response)) {
    logger.fatal(
      { err: error, quota: env.MAIL_DAILY_QUOTA },
      "Gmail daily sending limit reached - signup emails are failing for everyone. " +
        "It resets on a rolling 24h basis. Use MAIL_PROVIDER=log for local development."
    );

    return new ApiError(503, "We cannot send emails right now. Please try again later.", {
      code: "EMAIL_QUOTA_EXCEEDED",
      cause: error,
    });
  }

  if (error?.code === "EAUTH") {
    logger.fatal(
      { err: error },
      "SMTP authentication failed - check GMAIL_APP_PASSWORD (it must be a 16-character App Password, not the account password)"
    );
  } else {
    logger.error({ err: error }, "Email delivery failed");
  }

  return new ApiError(503, "We could not send that email. Please try again shortly.", {
    code: "EMAIL_DELIVERY_FAILED",
    cause: error,
  });
}

/**
 * @param {{to: string, subject: string, html: string, text: string}} message
 */
async function sendMail({ to, subject, html, text }) {
  let info;

  try {
    if (env.MAIL_PROVIDER === "brevo" && !env.isTest) {
      info = await sendBrevoMail({ to, subject, html, text });
    } else {
      info = await getTransport().sendMail({
        from: env.MAIL_FROM,
        to,
        subject,
        html,
        text,
      });
    }
  } catch (error) {
    throw asDeliveryError(error);
  }

  if (isLogTransport()) {
    sentMessages.push({ to, subject, text, html });
    // Warn level so the link is visible at default verbosity - the entire
    // point of this transport is that a developer can click it.
    logger.warn({ to, subject }, `EMAIL NOT SENT (MAIL_PROVIDER=log). Body:\n${text}`);
  } else {
    trackQuota(to);
    logger.info({ to, subject, messageId: info.messageId }, "Email sent");
  }

  return info;
}

async function closeMailer() {
  if (transport?.close) transport.close();
  transport = null;
}

/** Test helpers - the log transport keeps messages so assertions can read them. */
function getSentMessages() {
  return sentMessages;
}

function clearSentMessages() {
  sentMessages.length = 0;
}

module.exports = {
  sendMail,
  verifyMailer,
  closeMailer,
  isLogTransport,
  getSentMessages,
  clearSentMessages,
};
