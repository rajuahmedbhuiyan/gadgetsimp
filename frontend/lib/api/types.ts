/**
 * Shapes the API speaks. Mirrors the envelope described in
 * `documentation/FRONTEND-INSTRUCTIONS.md` and the auth spec.
 */

export type Role =
  | "ROLE_CUSTOMER"
  | "ROLE_MODERATOR"
  | "ROLE_ADMIN"
  | "ROLE_OWNER";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export type AuthProviderName = "EMAIL" | "GOOGLE" | "FACEBOOK";

/** The providers `POST /auth/social-login` accepts - everything but EMAIL. */
export type SocialProviderName = Exclude<AuthProviderName, "EMAIL">;

export interface User {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  authProviders: AuthProviderName[];
  phone: string | null;
  image: string | null;
  status: UserStatus;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What every endpoint that establishes a session returns in `data`. */
export interface Session {
  user: User;
  accessToken: string;
  /**
   * Only present because the server runs with `REFRESH_TOKEN_IN_BODY=true`,
   * for clients that cannot hold cookies. A browser ignores it and relies on
   * the httpOnly `gs_refresh_token` cookie.
   */
  refreshToken?: string;
}

export interface ApiFieldError {
  /** Dot-pathed and prefixed with its location: `body.email`, `params.id`. */
  field: string;
  code?: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  /** Stable machine code. Branch on this, never on `message`. */
  code?: string;
  errors?: ApiFieldError[];
  meta?: PaginationMeta;
}
