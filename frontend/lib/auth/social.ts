/**
 * Provider SDK plumbing for `POST /auth/social-login`.
 *
 * The two vendors hand the browser different things, which is why the API's
 * field is named neutrally:
 *
 *   GOOGLE   - the ID token (`credential`) from Google Identity Services
 *   FACEBOOK - the opaque user access token from `FB.login()`
 *
 * Both are verified server-side against the provider, so nothing here is
 * trusted; this file only has to obtain the credential and hand it over.
 */

export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const facebookAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "";
const facebookVersion = process.env.NEXT_PUBLIC_FACEBOOK_API_VERSION ?? "v21.0";

/* ------------------------------ SDK types ------------------------------- */

export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
  logo_alignment?: "left" | "center";
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  disableAutoSelect(): void;
  cancel(): void;
}

interface FacebookAuthResponse {
  accessToken: string;
  userID: string;
  expiresIn: number;
  grantedScopes?: string;
}

interface FacebookLoginResponse {
  status: "connected" | "not_authorized" | "unknown";
  authResponse: FacebookAuthResponse | null;
}

interface FacebookSdk {
  init(options: {
    appId: string;
    version: string;
    cookie?: boolean;
    xfbml?: boolean;
  }): void;
  login(
    callback: (response: FacebookLoginResponse) => void,
    options?: { scope?: string; auth_type?: string; return_scopes?: boolean },
  ): void;
  logout(callback?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

/* ------------------------------ script load ----------------------------- */

const pending = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = pending.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      pending.delete(src);
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(script);
  });

  pending.set(src, promise);
  return promise;
}

/* -------------------------------- Google -------------------------------- */

export function isGoogleConfigured() {
  return googleClientId.length > 0;
}

export async function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (!isGoogleConfigured()) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
  }

  await loadScript("https://accounts.google.com/gsi/client");

  if (!window.google?.accounts?.id) {
    throw new Error("Google Identity Services failed to initialise");
  }

  return window.google.accounts.id;
}

/* ------------------------------- Facebook ------------------------------- */

export function isFacebookConfigured() {
  return facebookAppId.length > 0;
}

let facebookReady: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(): Promise<FacebookSdk> {
  if (!isFacebookConfigured()) {
    return Promise.reject(new Error("NEXT_PUBLIC_FACEBOOK_APP_ID is not set"));
  }

  facebookReady ??= new Promise<FacebookSdk>((resolve, reject) => {
    // The SDK calls fbAsyncInit itself once it has parsed; setting it before
    // the script is injected is the documented handshake.
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: facebookAppId,
        version: facebookVersion,
        // The session lives in our own httpOnly cookie, so the SDK has no
        // reason to write one of its own.
        cookie: false,
        xfbml: false,
      });
      if (window.FB) resolve(window.FB);
      else reject(new Error("Facebook SDK failed to initialise"));
    };

    loadScript("https://connect.facebook.net/en_US/sdk.js").catch(reject);
  });

  return facebookReady;
}

export class SocialCancelledError extends Error {
  constructor() {
    super("Sign-in was cancelled");
    this.name = "SocialCancelledError";
  }
}

/**
 * Resolves with the access token to post to `/auth/social-login`.
 *
 * Must be called straight out of a click handler - awaiting anything first
 * loses the user gesture and the popup gets blocked, which is why the SDK is
 * preloaded on mount.
 */
export function facebookLogin(sdk: FacebookSdk): Promise<string> {
  return new Promise((resolve, reject) => {
    sdk.login(
      (response) => {
        if (response.status === "connected" && response.authResponse) {
          resolve(response.authResponse.accessToken);
          return;
        }
        // "not_authorized" and "unknown" both come back when the user closes
        // the dialog or declines - neither is an error worth shouting about.
        reject(new SocialCancelledError());
      },
      { scope: "email", auth_type: "rerequest", return_scopes: true },
    );
  });
}
