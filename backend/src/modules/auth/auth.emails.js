"use strict";

const env = require("../../config/env");
const { EMAIL_VERIFICATION_TTL_MINUTES, BRAND } = require("../../shared/constants");

/**
 * Transactional email bodies.
 *
 * Email HTML is not web HTML. Outlook renders through Word, Gmail strips
 * <style> blocks and anything it does not recognise, and there is no reliable
 * flexbox, grid, or CSS cascade. So this file deliberately uses the old
 * techniques that still work everywhere:
 *
 *   - tables for layout, not divs;
 *   - inline styles on every element, since <style> is discarded;
 *   - a bulletproof VML fallback so the call-to-action renders as a real
 *     button in Outlook rather than a bare link;
 *   - a text/plain part on every message, because HTML-only mail scores badly
 *     with spam filters and some clients refuse to render it.
 *
 * Buttons are dark ink on the amber brand colour, not white. White on
 * #febc01 measures 1.69:1 against WCAG's 4.5:1 minimum - it looks washed out
 * on a good screen and is unreadable on a bad one.
 */

function verificationUrl(token) {
  // Points at the frontend, which reads the token and calls the API. Emailing
  // an API endpoint directly would leave the user staring at raw JSON.
  return `${env.APP_URL.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Renders the TTL the way a person would say it, so a 10-minute window does
 * not round to "0 hours".
 */
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function verificationEmail({ firstName, token }) {
  const url = verificationUrl(token);
  const validFor = formatDuration(EMAIL_VERIFICATION_TTL_MINUTES);

  return {
    subject: "Confirm your email to finish signing up",
    text: [
      `Hi ${firstName},`,
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
      heading: `Hi ${firstName}, confirm your email`,
      body: `
        <p style="${p}">
          You are one step away from your GadgetSimp account. Tap the button below
          to confirm this address.
        </p>
        ${button({ url, label: "Confirm email address" })}
        <p style="${pMuted}">
          This link is valid for ${validFor}.
          <strong style="color:${BRAND.INK};">Your account is not created until you confirm.</strong>
        </p>
        ${fallbackLink(url)}
      `,
      footerNote:
        "If you did not request this, you can safely ignore this email - nothing has been created.",
    }),
  };
}

function welcomeEmail({ firstName }) {
  return {
    subject: "Your GadgetSimp account is ready",
    text: [
      `Hi ${firstName},`,
      "",
      "Your email is confirmed and your GadgetSimp account is live. Happy shopping.",
      "",
      env.APP_URL,
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: "Your account is confirmed and ready to use.",
      heading: `Welcome aboard, ${firstName}`,
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

function existingAccountEmail({ firstName }) {
  const loginUrl = `${env.APP_URL.replace(/\/$/, "")}/login`;

  return {
    subject: "Someone tried to sign up with your email",
    text: [
      `Hi ${firstName},`,
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
      heading: `Hi ${firstName}`,
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

/* ------------------------------- building blocks ------------------------- */

const p = `margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.INK};`;
const pMuted = `margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.MUTED};`;

/**
 * A call-to-action that survives Outlook.
 *
 * Outlook ignores padding on <a>, collapsing the button to plain text. The
 * MSO conditional wraps a VML rounded rectangle that Outlook draws instead,
 * while every other client ignores the comment and uses the anchor.
 */
function button({ url, label }) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND.PRIMARY}" style="border-radius:8px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${url}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%"
          strokecolor="${BRAND.PRIMARY_DARK}" fillcolor="${BRAND.PRIMARY}">
          <w:anchorlock/>
          <center style="color:${BRAND.INK};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${url}"
           style="display:inline-block;padding:14px 32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                  font-size:16px;font-weight:700;color:${BRAND.INK};text-decoration:none;border-radius:8px;
                  background-color:${BRAND.PRIMARY};">${label}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

// Buttons get blocked or stripped often enough that the raw URL has to be
// present too, or the user is simply stuck.
function fallbackLink(url) {
  return `
  <p style="${pMuted}">
    If the button does not work, copy this into your browser:<br>
    <a href="${url}" style="color:${BRAND.PRIMARY_DARK};word-break:break-all;">${url}</a>
  </p>`;
}

function layout({ preheader, heading, body, footerNote }) {
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <!-- Transactional mail is a fixed light design; opting out stops iOS and
       Outlook dark modes from inverting the amber into something muddy. -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.BACKGROUND};-webkit-font-smoothing:antialiased;">

  <!-- Preheader: the grey preview line beside the subject in most inboxes.
       Hidden in the body itself, then padded so no other copy leaks into it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${preheader}${"&#847;&zwnj;&nbsp;".repeat(60)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background-color:${BRAND.BACKGROUND};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="max-width:560px;background-color:${BRAND.SURFACE};border-radius:14px;overflow:hidden;
                      border:1px solid ${BRAND.BORDER};">

          <!-- Brand bar -->
          <tr>
            <td style="background-color:${BRAND.PRIMARY};padding:22px 32px;">
              <span style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                           font-size:22px;font-weight:800;letter-spacing:-0.3px;color:${BRAND.INK};">
                GadgetSimp
              </span>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:700;color:${BRAND.INK};">
                ${heading}
              </h1>
              ${body}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.BORDER};
                       font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.MUTED};">
                ${footerNote}
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                  font-size:12px;color:${BRAND.MUTED};">
          &copy; ${new Date().getFullYear()} GadgetSimp
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  verificationEmail,
  welcomeEmail,
  existingAccountEmail,
  verificationUrl,
};
