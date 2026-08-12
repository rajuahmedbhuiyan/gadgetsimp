"use strict";

const nodemailer = require("nodemailer");
const env = require("./env");
const logger = require("./logger");

/**
 * Outbound email.
 *
 * Three transports, selected by MAIL_PROVIDER:
 *
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

// Gmail's cap is a hard daily ceiling, and hitting it silently breaks signup
// for everyone. This counts sends so the log warns on approach. It is
// per-process and resets on restart, so treat it as an early-warning signal
// rather than an accurate ledger - Google's own count is authoritative.
let quota = { date: today(), sent: 0 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isLogTransport() {
  return env.MAIL_PROVIDER === "log";
}

function buildTransport() {
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
      "Daily email quota exhausted - Gmail will start rejecting messages and signups will fail"
    );
  } else if (remaining <= env.MAIL_DAILY_QUOTA * 0.2) {
    logger.warn(
      { sent: quota.sent, remaining },
      "Approaching the daily email quota"
    );
  }
}

/**
 * @param {{to: string, subject: string, html: string, text: string}} message
 */
async function sendMail({ to, subject, html, text }) {
  const info = await getTransport().sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    html,
    text,
  });

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
