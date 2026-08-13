/**
 * The password rules, as data.
 *
 * These are the same four constraints `passwordSchema` enforces in
 * `lib/auth/schemas.ts`, expressed as predicates so the UI can show a live
 * checklist rather than waiting for a submit to report them one at a time. If
 * a rule changes it has to change in both places - the schema is what rejects,
 * this is only what explains.
 */

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

export const passwordRules: readonly PasswordRule[] = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /\d/.test(v) },
];

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** 0-4. Reaching 4 needs more than the minimum the server accepts. */
  score: StrengthScore;
  label: string;
  /** Per-rule results, in `passwordRules` order. */
  met: boolean[];
  /** True once every rule passes - i.e. the server would accept it. */
  valid: boolean;
}

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

/**
 * How good the password is, not merely whether it is allowed.
 *
 * Meeting all four rules earns "Good", not "Strong" - `Passw0rd` satisfies
 * every one of them and is still a bad password. The top band asks for length
 * or a symbol on top, so the meter keeps meaning something after the minimum
 * is cleared.
 */
export function passwordStrength(value: string): PasswordStrength {
  const met = passwordRules.map((rule) => rule.test(value));

  if (!value) {
    return { score: 0, label: "", met, valid: false };
  }

  const passed = met.filter(Boolean).length;
  const valid = passed === passwordRules.length;

  let score: StrengthScore;
  if (!valid) {
    // Cap below "Good" until the server would actually accept it.
    score = Math.min(passed, 2) as StrengthScore;
  } else {
    const bonus = value.length >= 12 || /[^A-Za-z0-9]/.test(value);
    score = bonus ? 4 : 3;
  }

  return { score, label: LABELS[score], met, valid };
}
