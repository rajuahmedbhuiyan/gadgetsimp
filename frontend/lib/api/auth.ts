/**
 * Every `/auth` endpoint, typed.
 *
 * Calls that establish a session store the access token through
 * `applySession`, which also notifies the auth context - so a component only
 * has to await the call, never wire the token anywhere itself.
 */

import { api, applySession, clearSession } from "./client";
import type {
  ApiEnvelope,
  AuthProviderName,
  Session,
  SocialProviderName,
  User,
} from "./types";

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  /** Omit the key entirely when blank - request schemas are strict. */
  phone?: string;
}

/** `data` of the `REQUIRED_PASSWORD` branch of `POST /auth/verify-email`. */
export interface PendingRegistration {
  registrationToken: string;
  email: string;
  fullName: string;
}

/**
 * `/auth/verify-email` has two success outcomes and they are told apart by
 * `code`, not by status. Modelled as a union so a caller cannot forget one.
 */
export type VerifyEmailResult =
  | { kind: "signed-in"; session: Session; message: string }
  | { kind: "password-required"; registration: PendingRegistration; message: string };

export const authApi = {
  /**
   * Step 1 of signup. Creates no account - it records the signup and emails a
   * link, and answers 202 whether or not the address was already taken.
   */
  async register(input: RegisterInput): Promise<ApiEnvelope<{ email: string }>> {
    return api<{ email: string }>("/auth/register", {
      method: "POST",
      body: {
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        ...(input.phone ? { phone: input.phone } : {}),
      },
    });
  },

  /** Step 2 of signup: spend the emailed token. */
  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    const response = await api<Session | PendingRegistration>(
      "/auth/verify-email",
      { method: "POST", body: { token } },
    );

    if (response.code === "REQUIRED_PASSWORD") {
      return {
        kind: "password-required",
        registration: response.data as PendingRegistration,
        message: response.message,
      };
    }

    const session = response.data as Session;
    applySession(session);
    return { kind: "signed-in", session, message: response.message };
  },

  /**
   * Step 3, only for the `REQUIRED_PASSWORD` branch. The token is the
   * `registrationToken` from step 2 - the emailed one was spent and rotated
   * away, and sending it here returns `REGISTRATION_TOKEN_INVALID`.
   */
  async completeRegistration(token: string, password: string) {
    const response = await api<Session>("/auth/complete-registration", {
      method: "POST",
      body: { token, password },
    });
    applySession(response.data);
    return response;
  },

  /** Issues a fresh link and invalidates the previous one. Always 200. */
  resendVerification(email: string) {
    return api<Record<string, never>>("/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
  },

  async login(email: string, password: string) {
    const response = await api<Session>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    applySession(response.data);
    return response;
  },

  /**
   * One endpoint for every provider and for both signup and sign-in. `token`
   * is Google's ID token (`credential`) or Facebook's access token; the server
   * verifies it against the provider and never trusts it as presented.
   */
  async socialLogin(type: SocialProviderName, token: string) {
    const response = await api<Session>("/auth/social-login", {
      method: "POST",
      body: { type, token },
    });
    applySession(response.data);
    return response;
  },

  /** What this deployment actually has configured. Drives which buttons render. */
  providers() {
    return api<{ providers: AuthProviderName[] }>("/auth/providers");
  },

  /*
   * No `refresh` here on purpose. Middleware owns it - see `proxy.ts`. A
   * second caller anywhere in the app would rotate a token the server had
   * already spent, and the API drops every session when it sees that.
   */

  forgotPassword(email: string) {
    return api<Record<string, never>>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  },

  /**
   * Revokes every session and issues none, so there is nothing to sign in
   * with afterwards. Route to login with a success message.
   */
  async resetPassword(token: string, newPassword: string) {
    const response = await api<Record<string, never>>("/auth/reset-password", {
      method: "POST",
      body: { token, newPassword },
    });
    clearSession();
    return response;
  },

  /** Ends all sessions including this one - that is the point of it. */
  async changePassword(currentPassword: string, newPassword: string) {
    const response = await api<Record<string, never>>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
    clearSession();
    return response;
  },

  /** A failed logout call still signs the user out locally. */
  async logout() {
    try {
      await api<Record<string, never>>("/auth/logout", { method: "POST" });
    } finally {
      clearSession();
    }
  },

  async logoutAll() {
    try {
      await api<Record<string, never>>("/auth/logout-all", { method: "POST" });
    } finally {
      clearSession();
    }
  },
};

export const usersApi = {
  /**
   * The authoritative user record - freshly read, unlike the JWT's
   * 15-minute-old claims. `/auth/me` returns the same thing; this one is
   * metered on the read tier (120/min) rather than the auth tier.
   */
  me() {
    return api<{ user: User }>("/users/me");
  },

  updateMe(patch: { fullName?: string; phone?: string; image?: string }) {
    return api<{ user: User }>("/users/me", { method: "PATCH", body: patch });
  },
};
