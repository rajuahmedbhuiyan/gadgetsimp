"use strict";

const authService = require("./auth.service");
const { sendResponse } = require("../../shared/sendResponse");
const { refreshCookieOptions, REFRESH_COOKIE_NAME } = require("../../shared/tokens");
const { configuredProviders } = require("./providers");
const env = require("../../config/env");

/**
 * Builds the auth payload, and sets the refresh cookie as a side effect.
 *
 * The refresh token always goes out as an httpOnly cookie - that is the path
 * a browser should use, because JavaScript cannot read it and therefore XSS
 * cannot steal it. It is *additionally* placed in the body when
 * REFRESH_TOKEN_IN_BODY is on, for clients that cannot hold cookies at all
 * (native apps, CLIs, Postman) and for visibility while developing.
 */
function issue(res, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

  return {
    user,
    accessToken,
    ...(env.REFRESH_TOKEN_IN_BODY ? { refreshToken } : {}),
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
 * Consumes the emailed token, creates the account, and signs the user in.
 */
async function verifyEmail(req, res) {
  const { user, accessToken, refreshToken } = await authService.verifyEmail(
    req.validated.body.token,
    requestContext(req)
  );

  return sendResponse(res, {
    statusCode: 201,
    message: "Email confirmed and account created",
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
 * Cookie first, body second.
 *
 * A browser sends the cookie automatically and should keep using it. A client
 * that cannot hold cookies has nowhere to put one, so it may present the token
 * it was given in the body instead - otherwise returning it there would be
 * pointless. The cookie takes precedence when both arrive.
 */
async function refresh(req, res) {
  const presented = req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;

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
