"use strict";

const env = require("../../config/env");
const {
  layout,
  button,
  codeBlock,
  paragraph: p,
  mutedParagraph: pMuted,
  greetingName,
} = require("../../shared/emailLayout");

/**
 * Email for an account created by staff rather than by the person themselves.
 *
 * The recipient did not ask for this and has no context, so the message has
 * to say who made it and what to do next. Where the password was generated it
 * is included, because otherwise there is no way in - with an explicit
 * instruction to change it.
 *
 * A temporary password in an inbox is a real, if bounded, exposure: mail sits
 * in plain text on a server that is not ours. The better long-term shape is a
 * one-time "set your password" link reusing the reset-token machinery, and
 * that is a small change now that `/auth/reset-password` exists.
 */
function accountCreatedEmail({ fullName, email, temporaryPassword, role }) {
  const name = greetingName(fullName);
  const loginUrl = `${env.APP_URL.replace(/\/$/, "")}/login`;

  const roleLine =
    role && role !== "ROLE_CUSTOMER"
      ? `You have been given the ${role.replace("ROLE_", "").toLowerCase()} role.`
      : null;

  const textLines = [
    `Hi ${name},`,
    "",
    "An account has been created for you on GadgetSimp.",
    roleLine,
    "",
    `Email: ${email}`,
  ].filter((line) => line !== null);

  if (temporaryPassword) {
    textLines.push(
      `Temporary password: ${temporaryPassword}`,
      "",
      "Please sign in and change this password straight away - it was generated",
      "for you and has been sent by email, so treat it as temporary."
    );
  } else {
    textLines.push("", "Sign in with the password you were given.");
  }

  textLines.push("", loginUrl, "", "- The GadgetSimp team");

  return {
    subject: "Your GadgetSimp account has been created",
    text: textLines.join("\n"),
    html: layout({
      preheader: "An account has been created for you.",
      heading: `Hi ${name}, your account is ready`,
      body: `
        <p style="${p}">
          An account has been created for you on GadgetSimp.
          ${roleLine ? `<br>${roleLine}` : ""}
        </p>
        <p style="${pMuted}">Email</p>
        ${codeBlock(email)}
        ${
          temporaryPassword
            ? `<p style="${pMuted}">Temporary password</p>
               ${codeBlock(temporaryPassword)}
               <p style="${p}">
                 <strong style="color:#1a1a1a;">Change this as soon as you sign in.</strong>
                 It was generated for you and sent by email, so treat it as temporary.
               </p>`
            : `<p style="${p}">Sign in with the password you were given.</p>`
        }
        ${button({ url: loginUrl, label: "Sign in" })}
      `,
      footerNote:
        "If you were not expecting this account, please contact us - do not sign in.",
    }),
  };
}

module.exports = { accountCreatedEmail };
