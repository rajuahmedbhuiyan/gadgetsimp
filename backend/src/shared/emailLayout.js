"use strict";

const env = require("../config/env");
const { BRAND } = require("./constants");

/**
 * Shared chrome for transactional email.
 *
 * Email HTML is not web HTML. Outlook renders through Word, Gmail strips
 * `<style>` blocks, and there is no dependable flexbox, grid or cascade. So
 * this module keeps the old techniques that still work everywhere in one
 * place, rather than having every template rediscover them:
 *
 *   - tables for layout, not divs;
 *   - inline styles on every element, since `<style>` is discarded;
 *   - a VML fallback so the call to action renders as a real button in
 *     Outlook instead of collapsing to bare text;
 *   - a preheader, the grey preview line shown beside the subject.
 *
 * Buttons are dark ink on the amber brand colour, never white: white on
 * #febc01 measures 1.69:1 against WCAG AA's 4.5:1 minimum.
 */

const paragraph = `margin:0 0 16px;font-size:16px;line-height:1.65;color:${BRAND.INK};`;
const mutedParagraph = `margin:0 0 16px;font-size:14px;line-height:1.65;color:${BRAND.MUTED};`;

/**
 * A call to action that survives Outlook.
 *
 * Outlook ignores padding on `<a>`, which collapses the button to plain text.
 * The MSO conditional wraps a VML rounded rectangle that Outlook draws
 * instead, while every other client ignores the comment and uses the anchor.
 */
function button({ url, label }) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND.PRIMARY}" style="border-radius:10px;box-shadow:0 8px 18px rgba(254,188,1,0.25);">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${url}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="21%"
          strokecolor="${BRAND.PRIMARY_DARK}" fillcolor="${BRAND.PRIMARY}">
          <w:anchorlock/>
          <center style="color:${BRAND.INK};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${url}"
           style="display:inline-block;padding:14px 32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                  font-size:16px;font-weight:800;color:${BRAND.INK};text-decoration:none;border-radius:10px;
                  background-color:${BRAND.PRIMARY};">${label}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

/**
 * Buttons get stripped or blocked often enough that the raw URL has to be
 * present too, or the recipient is simply stuck.
 */
function fallbackLink(url) {
  return `
  <p style="${mutedParagraph}">
    If the button does not work, copy this into your browser:<br>
    <a href="${url}" style="color:${BRAND.PRIMARY_DARK};word-break:break-all;">${url}</a>
  </p>`;
}

/**
 * A monospaced block for values the recipient has to read and retype -
 * a temporary password, most obviously. Letter-spaced so visually similar
 * characters are easier to tell apart.
 */
function codeBlock(value) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;">
    <tr>
      <td style="background:#f8fafc;border:1px solid ${BRAND.BORDER};border-radius:12px;padding:16px 20px;
                 font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:18px;
                 letter-spacing:1px;color:${BRAND.INK};word-break:break-all;">
        ${value}
      </td>
    </tr>
  </table>`;
}

function logoMarkup() {
  if (env.LOGO_URL) {
    return `<img src="${env.LOGO_URL}" width="180" alt="GadgetSimp"
                 style="display:block;width:180px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
  }

  return `<span style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                       font-size:24px;font-weight:900;color:${BRAND.INK};">GadgetSimp</span>`;
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
<body style="margin:0;padding:0;background-color:#eef1f5;-webkit-font-smoothing:antialiased;">

  <!-- Preheader: the grey preview line beside the subject in most inboxes.
       Hidden in the body itself, then padded so no other copy leaks into it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${preheader}${"&#847;&zwnj;&nbsp;".repeat(60)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background-color:#eef1f5;">
    <tr>
      <td align="center" style="padding:36px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="max-width:600px;background-color:${BRAND.SURFACE};border-radius:18px;overflow:hidden;
                      border:1px solid ${BRAND.BORDER};box-shadow:0 18px 48px rgba(15,23,42,0.12);">

          <!-- Brand bar -->
          <tr>
            <td style="background:#0f1115;padding:22px 32px;border-bottom:4px solid ${BRAND.PRIMARY};">
              ${logoMarkup()}
            </td>
          </tr>

          <tr>
            <td style="padding:34px 32px 30px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 18px;font-size:24px;line-height:1.28;font-weight:850;color:${BRAND.INK};">
                ${heading}
              </h1>
              ${body}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.BORDER};background:#fafafa;
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

/**
 * How to address someone in a greeting, given the one name field we store.
 *
 * The first word rather than the whole string: "Hi Raju" is how a person
 * writes to another person, while "Hi Raju Ahmed Bhuiyan" reads like a form
 * letter. This is presentation only - nothing is split on the way in, so a
 * mononym greets by itself and nothing is ever guessed wrong on the stored
 * record. Falls back to "there" so a greeting never reads "Hi ,".
 */
function greetingName(fullName) {
  return String(fullName ?? "").trim().split(/\s+/)[0] || "there";
}

module.exports = {
  layout,
  button,
  fallbackLink,
  codeBlock,
  paragraph,
  mutedParagraph,
  greetingName,
};
