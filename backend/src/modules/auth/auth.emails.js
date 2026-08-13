"use strict";

const env = require("../../config/env");
const {
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
} = require("../../shared/constants");
const {
  layout,
  button,
  fallbackLink,
  paragraph: p,
  mutedParagraph: pMuted,
  greetingName,
} = require("../../shared/emailLayout");

/**
 * Transactional email for the auth flows. The client-proof chrome lives in
 * `shared/emailLayout.js`; this file is only the wording.
 *
 * Every message ships a text/plain part as well as HTML - some clients refuse
 * to render HTML-only mail, and spam filters score it down.
 */

const appUrl = () => env.APP_URL.replace(/\/$/, "");

function verificationUrl(token) {
  // Points at the frontend, which reads the token and calls the API. Emailing
  // an API endpoint directly would leave the user staring at raw JSON.
  return `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function resetUrl(token) {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Renders a TTL the way a person would say it, so a 10-minute window does not
 * round to "0 hours".
 */
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function verificationEmail({ fullName, token }) {
  const name = greetingName(fullName);
  const url = verificationUrl(token);
  const validFor = formatDuration(EMAIL_VERIFICATION_TTL_MINUTES);

  return {
    subject: "Confirm your email to finish signing up",
    text: [
      `Hi ${name},`,
      "",
      "Confirm your email address to finish creating your GadgetSimp account:",
      "",
      url,
      "",
      `This link is valid for ${validFor}. Your account is not created until you confirm.`,
      "",
      "If you did not request this, you can ignore this email - nothing has been created.",
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: "One click to finish setting up your GadgetSimp account.",
      heading: `Hi ${name}, confirm your email`,
      body: `
        <p style="${p}">
          You are one step away from your GadgetSimp account. Tap the button below
          to confirm this address.
        </p>
        ${button({ url, label: "Confirm email address" })}
        <p style="${pMuted}">
          This link is valid for ${validFor}.
          <strong style="color:#1a1a1a;">Your account is not created until you confirm.</strong>
        </p>
        ${fallbackLink(url)}
      `,
      footerNote:
        "If you did not request this, you can safely ignore this email - nothing has been created.",
    }),
  };
}

/**
 * Sent when a guest checkout asked for an account to be created.
 *
 * Different from the normal verification email in the two ways that matter to
 * the person reading it: their order is already placed and is not waiting on
 * this, and there is a password step waiting on the other side of the link. Not
 * saying the first would make a customer anxious that ignoring the email costs
 * them their purchase; not saying the second makes the password modal look
 * like an unexpected demand for a credential.
 */
function checkoutAccountEmail({ fullName, orderNumber, token }) {
  const name = greetingName(fullName);
  const url = verificationUrl(token);
  const validFor = formatDuration(EMAIL_VERIFICATION_TTL_MINUTES);

  return {
    subject: `Confirm your email to track order #${orderNumber}`,
    text: [
      `Hi ${name},`,
      "",
      `Thanks for your order - #${orderNumber} is confirmed and on its way, whatever you do next.`,
      "",
      "You asked us to set up an account so you can track it and check out faster next time.",
      "Confirm your email address here, then choose a password:",
      "",
      url,
      "",
      `This link is valid for ${validFor}.`,
      "",
      "If you did not ask for an account, ignore this email - your order is unaffected.",
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: `Order #${orderNumber} is confirmed. Confirm your email to set up your account.`,
      heading: `Thanks, ${name}!`,
      body: `
        <p style="${p}">
          Your order <strong style="color:#1a1a1a;">#${orderNumber}</strong> is confirmed
          and on its way - nothing below is needed for that.
        </p>
        <p style="${p}">
          You asked us to set up an account so you can track this order and check
          out faster next time. Confirm your email, then pick a password.
        </p>
        ${button({ url, label: "Confirm email address" })}
        <p style="${pMuted}">This link is valid for ${validFor}.</p>
        ${fallbackLink(url)}
      `,
      footerNote:
        "If you did not ask for an account, you can ignore this email - your order is unaffected.",
    }),
  };
}

function welcomeEmail({ fullName }) {
  const name = greetingName(fullName);

  return {
    subject: "Your GadgetSimp account is ready",
    text: [
      `Hi ${name},`,
      "",
      "Your email is confirmed and your GadgetSimp account is live. Happy shopping.",
      "",
      env.APP_URL,
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: "Your account is confirmed and ready to use.",
      heading: `Welcome aboard, ${name}`,
      body: `
        <p style="${p}">
          Your email is confirmed and your account is live. Browse the latest
          gadgets, track your orders, and check out in a couple of taps.
        </p>
        ${button({ url: env.APP_URL, label: "Start shopping" })}
      `,
      footerNote: "Questions? Just reply to this email - a human reads it.",
    }),
  };
}

function existingAccountEmail({ fullName }) {
  const name = greetingName(fullName);
  const loginUrl = `${appUrl()}/login`;

  return {
    subject: "Someone tried to sign up with your email",
    text: [
      `Hi ${name},`,
      "",
      "Someone just tried to create a GadgetSimp account with this email address,",
      "but an account already exists. If that was you, sign in instead:",
      "",
      loginUrl,
      "",
      "If you have forgotten your password, use the reset link on the sign-in page.",
      "If this was not you, you can safely ignore this email - nothing changed.",
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: "An account already exists for this address.",
      heading: `Hi ${name}`,
      body: `
        <p style="${p}">
          Someone just tried to create a GadgetSimp account with this email
          address, but you already have one.
        </p>
        ${button({ url: loginUrl, label: "Sign in instead" })}
        <p style="${pMuted}">
          Forgotten your password? Use the reset link on the sign-in page.
        </p>
      `,
      footerNote:
        "If this was not you, you can safely ignore this email - nothing about your account has changed.",
    }),
  };
}

function passwordResetEmail({ fullName, token }) {
  const name = greetingName(fullName);
  const url = resetUrl(token);
  const validFor = formatDuration(PASSWORD_RESET_TTL_MINUTES);

  return {
    subject: "Reset your GadgetSimp password",
    text: [
      `Hi ${name},`,
      "",
      "We received a request to reset your GadgetSimp password. Use this link:",
      "",
      url,
      "",
      `The link is valid for ${validFor} and can only be used once.`,
      "",
      "If you did not request this, you can ignore this email - your password",
      "has not changed, and nobody can reset it without this link.",
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: `Reset your password. Link valid for ${validFor}.`,
      heading: `Hi ${name}, reset your password`,
      body: `
        <p style="${p}">
          We received a request to reset the password on your GadgetSimp account.
        </p>
        ${button({ url, label: "Choose a new password" })}
        <p style="${pMuted}">
          This link is valid for ${validFor} and can only be used once.
        </p>
        ${fallbackLink(url)}
      `,
      footerNote:
        "If you did not request this, ignore this email. Your password has not changed, and nobody can reset it without this link.",
    }),
  };
}

/**
 * Sent after a password actually changes. This is the message that lets a
 * victim notice an account takeover, so it goes out on every change - not
 * only the ones the user initiated.
 */
function passwordChangedEmail({ fullName }) {
  const name = greetingName(fullName);
  const loginUrl = `${appUrl()}/login`;

  return {
    subject: "Your GadgetSimp password was changed",
    text: [
      `Hi ${name},`,
      "",
      "Your GadgetSimp password has just been changed, and every device has",
      "been signed out.",
      "",
      "If this was you, no action is needed - just sign in again:",
      loginUrl,
      "",
      "If this was NOT you, reset your password immediately using the",
      "'Forgot password' link, and contact support.",
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: "Your password was changed and all devices were signed out.",
      heading: `Hi ${name}, your password was changed`,
      body: `
        <p style="${p}">
          Your GadgetSimp password has just been changed, and every device has
          been signed out.
        </p>
        ${button({ url: loginUrl, label: "Sign in again" })}
        <p style="${pMuted}">
          <strong style="color:#1a1a1a;">If this was not you</strong>, reset your
          password immediately using the "Forgot password" link, and contact support.
        </p>
      `,
      footerNote: "You are receiving this because your account's password changed.",
    }),
  };
}

module.exports = {
  verificationEmail,
  checkoutAccountEmail,
  welcomeEmail,
  existingAccountEmail,
  passwordResetEmail,
  passwordChangedEmail,
  verificationUrl,
  resetUrl,
  formatDuration,
};
