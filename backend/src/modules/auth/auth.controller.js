"use strict";

const authService = require("./auth.service");
const { sendResponse } = require("../../shared/sendResponse");
const { refreshCookieOptions, REFRESH_COOKIE_NAME } = require("../../shared/tokens");
const { configuredProviders } = require("./providers");
const env = require("../../config/env");

/**
 * Tells a browser apart from a server-side or native client.
 *
 * `Origin` and `Sec-Fetch-*` are forbidden header names: the browser sets them
 * on every cross-origin request and page script cannot remove or forge them.
 * A server-to-server call (the storefront's own backend-for-frontend), a
 * native app, a CLI or Postman sends neither.
 *
 * The direction that matters is the one that cannot be faked - script running
 * on a page cannot pretend to be a native client, so it cannot talk its way
 * into being handed a refresh token it could exfiltrate.
 */
function isBrowserRequest(req) {
  return Boolean(req.get("origin") || req.get("sec-fetch-mode"));
}

/**
 * Builds the auth payload, and sets the refresh cookie as a side effect.
 *
 * The refresh token always goes out as an httpOnly cookie - that is the path
 * a browser should use, because JavaScript cannot read it and therefore XSS
 * cannot steal it. It is *additionally* placed in the body when
 * REFRESH_TOKEN_IN_BODY is on, for clients that cannot hold cookies at all
 * (native apps, CLIs, a server-side BFF).
 *
 * Never for a browser, whatever the flag says. httpOnly stops a cookie being
 * *read*, not being *used*: an XSS payload can already call this endpoint with
 * `credentials: "include"`, so answering with the token in the body would hand
 * that payload a 30-day credential it can carry off the machine. The flag
 * exists for clients with nowhere to put a cookie, and a browser is not one.
 */
function issue(res, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

  const inBody = env.REFRESH_TOKEN_IN_BODY && !isBrowserRequest(res.req);

  return {
    user,
    accessToken,
    ...(inBody ? { refreshToken } : {}),
  };
}

/**
 * Controllers are intentionally thin: read the validated input, call the
 * service, write the response. No business rules, no database access, no
 * try/catch - Express 5 forwards a rejected promise to the error handler on
 * its own.
 *
 * Cookies are handled here rather than in the service: HTTP concerns belong to
 * this layer, and the service just hands back a token string.
 */

function requestContext(req) {
  return { userAgent: req.headers["user-agent"], ip: req.ip };
}

/**
 * Signup only records the request and sends an email - no account exists yet,
 * so there is no user or token to return. 202 Accepted says exactly that:
 * understood, not yet acted upon.
 *
 * The response is identical whether or not the address was already taken.
 * Anything else would let a caller test which emails are registered.
 */
async function register(req, res) {
  await authService.register(req.validated.body);

  return sendResponse(res, {
    statusCode: 202,
    message:
      "Check your inbox. We have sent a link to confirm your email address - your account is created once you confirm.",
    data: { email: req.validated.body.email },
  });
}

/**
 * Consumes the emailed token. What happens next depends on how the signup
 * started, and the client must be able to tell the two apart:
 *
 *   - **Normal signup** - the password was chosen up front, so the account is
 *     created and a session issued. 201.
 *   - **Guest checkout signup** - there never was a password field, so the
 *     address is confirmed and nothing else. 200 with
 *     `code: "REQUIRED_PASSWORD"` and a `registrationToken`; the frontend
 *     collects a password and posts both to `/auth/complete-registration`.
 *
 * No session is issued in the second case, deliberately. A link that arrived
 * by email is not proof of anything but access to the mailbox, and treating it
 * as a login would make a forwarded message an account takeover.
 */
async function verifyEmail(req, res) {
  const result = await authService.verifyEmail(
    req.validated.body.token,
    requestContext(req)
  );

  if (result.outcome === "REQUIRED_PASSWORD") {
    return sendResponse(res, {
      statusCode: 200,
      code: "REQUIRED_PASSWORD",
      message: "Email confirmed. Choose a password to finish creating your account.",
      data: {
        registrationToken: result.registrationToken,
        email: result.email,
        fullName: result.fullName,
      },
    });
  }

  const { user, accessToken, refreshToken } = result;

  return sendResponse(res, {
    statusCode: 201,
    message: "Email confirmed and account created",
    data: issue(res, { user, accessToken, refreshToken }),
  });
}

/**
 * Finishes a guest-checkout signup by setting the password.
 *
 * No second verification email: the address was confirmed minutes ago by the
 * call that issued this token, and asking again would be theatre. The session
 * is issued here because this is the point the user proved knowledge of a
 * secret they chose.
 */
async function completeRegistration(req, res) {
  const { user, accessToken, refreshToken } = await authService.completeRegistration(
    req.validated.body,
    requestContext(req)
  );

  return sendResponse(res, {
    statusCode: 201,
    message: "Account created",
    data: issue(res, { user, accessToken, refreshToken }),
  });
}

async function resendVerification(req, res) {
  await authService.resendVerification(req.validated.body.email);

  return sendResponse(res, {
    message: "If a pending signup exists for that address, a new link is on its way.",
  });
}

/**
 * One endpoint for every social provider, sign-up and sign-in alike - the
 * user taps a button and expects to end up signed in either way. 200 rather
 * than 201 because the caller cannot tell (and should not care) whether an
 * account was created.
 */
async function socialLogin(req, res) {
  const { type, token } = req.validated.body;

  const { user, accessToken, refreshToken } = await authService.socialLogin(
    type,
    token,
    requestContext(req)
  );

  return sendResponse(res, {
    message: `Signed in with ${type.charAt(0)}${type.slice(1).toLowerCase()}`,
    data: issue(res, { user, accessToken, refreshToken }),
  });
}

/**
 * Which providers this deployment can serve, so a frontend renders only the
 * buttons that will actually work instead of a Google button that 503s.
 */
async function listProviders(req, res) {
  return sendResponse(res, {
    message: "Available sign-in providers",
    data: { providers: ["EMAIL", ...configuredProviders()] },
  });
}

async function login(req, res) {
  const { user, accessToken, refreshToken } = await authService.login(
    req.validated.body,
    requestContext(req)
  );

  return sendResponse(res, {
    message: "Signed in successfully",
    data: issue(res, { user, accessToken, refreshToken }),
  });
}

/**
 * Cookie first, body second - and for a browser, cookie only.
 *
 * A browser sends the cookie automatically and should keep using it. A client
 * that cannot hold cookies has nowhere to put one, so it may present the token
 * it was given in the body instead - otherwise returning it there would be
 * pointless.
 *
 * The body branch is closed to browsers because it is a session-fixation path:
 * an XSS payload that posts *its own* refresh token here would leave the victim
 * shopping inside the attacker's account, entering an address and a card into
 * it. A page has a cookie; it has no business presenting anything else.
 */
async function refresh(req, res) {
  const presented = isBrowserRequest(req)
    ? req.cookies?.[REFRESH_COOKIE_NAME]
    : (req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken);

  const { user, accessToken, refreshToken } = await authService.refresh(
    presented,
    requestContext(req)
  );

  return sendResponse(res, {
    message: "Session refreshed",
    data: issue(res, { user, accessToken, refreshToken }),
  });
}

async function logout(req, res) {
  await authService.logout(
    req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken,
    req.user.id
  );

  // Same options minus maxAge, otherwise the browser will not match and clear it.
  const { maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);

  return sendResponse(res, { message: "Signed out successfully" });
}

async function logoutAll(req, res) {
  await authService.logoutAll(req.user.id);

  const { maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);

  return sendResponse(res, { message: "Signed out of all devices" });
}

/**
 * Answers 200 whether or not the address has an account. Anything else would
 * turn this into a free membership oracle.
 */
async function forgotPassword(req, res) {
  await authService.forgotPassword(req.validated.body.email);

  return sendResponse(res, {
    message: "If an account exists for that address, a reset link is on its way.",
  });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.validated.body);

  // Every session was revoked, so clear the cookie this browser is holding.
  const { maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);

  return sendResponse(res, {
    message: "Password reset. Please sign in with your new password.",
  });
}

async function changePassword(req, res) {
  await authService.changePassword(req.user.id, req.validated.body);

  const { maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);

  return sendResponse(res, {
    message: "Password changed. Please sign in again.",
  });
}

async function me(req, res) {
  return sendResponse(res, {
    message: "Current user retrieved",
    data: { user: req.user.toJSON() },
  });
}

module.exports = {
  register,
  verifyEmail,
  completeRegistration,
  resendVerification,
  socialLogin,
  listProviders,
  login,
  forgotPassword,
  resetPassword,
  refresh,
  logout,
  logoutAll,
  changePassword,
  me,
};
