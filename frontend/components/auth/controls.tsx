"use client";

/**
 * The form controls the auth screens share.
 *
 * The base `Input` is 32px tall with `rounded-lg`, which suits a dense admin
 * table and is too small for the one form a shopper fills in on a phone.
 * Height and corner radius come from here so a field, the box beside it and
 * the submit button below it can never disagree.
 */

import { useId, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  passwordRules,
  passwordStrength,
} from "@/lib/auth/password-strength";

/** 48px, on `--radius-field`. Shared by every control and button on these pages. */
export const CONTROL = "h-12 rounded-field text-base md:text-sm";

/** The submit button on every auth form. Same height and radius as the fields. */
export const AUTH_BUTTON =
  "mt-1 h-12 w-full cursor-pointer gap-2 rounded-field text-sm font-semibold transition-colors";

export function AuthInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return <Input className={cn(CONTROL, className)} {...props} />;
}

/**
 * A password box with a reveal toggle.
 *
 * The toggle is a real `button` with `tabIndex={-1}`: reachable by pointer,
 * skipped when tabbing from the field to the submit button, which is the path
 * someone typing a password actually takes. It never renders the value into an
 * attribute - only the `type` changes.
 */
export function PasswordField({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn(CONTROL, "pr-12", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {visible ? (
          <EyeOff className="size-4.5" aria-hidden />
        ) : (
          <Eye className="size-4.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

/**
 * A Bangladeshi mobile number, as the local 11 digits.
 *
 * `+88` is fixed and rendered as a prefix box rather than as part of the
 * value, so there is one format to type and nothing to get wrong: no country
 * code, no leading `+`, no spaces. The schema puts the two halves back
 * together before the request goes out.
 *
 * Non-digits are stripped as they are typed - pasting `+880 1602-817341` from
 * a contact card should not be a validation error.
 */
export function PhoneField({
  className,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <span
        // Painted inside the field rather than in a box beside it, so the
        // whole thing reads as one number. `pointer-events-none` keeps a click
        // on the prefix focusing the input behind it, and it is not a label -
        // the digits alone are the value, and the format is in the field's own
        // description.
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-medium text-muted-foreground"
      >
        +88
      </span>
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={11}
        placeholder="01602817341"
        // Clears the prefix with a gap after it, so `+88` and the typed digits
        // do not run together.
        className={cn(CONTROL, "pl-14", className)}
        {...props}
        onChange={(event) => {
          event.target.value = event.target.value
            .replace(/\D/g, "")
            .slice(0, 11);
          onChange?.(event);
        }}
      />
    </div>
  );
}

/**
 * A strength bar plus the live rule checklist.
 *
 * Rendered only once there is something to judge, so an untouched form is not
 * covered in red crosses before the shopper has typed a character.
 */
export function PasswordStrengthMeter({ value }: { value: string }) {
  const listId = useId();
  const { score, label, met } = passwordStrength(value);

  if (!value) return null;

  return (
    <div className="mt-2 flex flex-col gap-2" aria-describedby={listId}>
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                "flex-1 rounded-full transition-colors duration-300",
                step <= score ? BAR_TONE[score] : "bg-border",
              )}
            />
          ))}
        </div>
        <span
          className={cn("text-xs font-medium tabular-nums", TEXT_TONE[score])}
          // Announced on change rather than on every keystroke.
          aria-live="polite"
        >
          {label}
        </span>
      </div>

      <ul id={listId} className="grid gap-1 sm:grid-cols-2">
        {passwordRules.map((rule, index) => (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              met[index] ? "text-success" : "text-muted-foreground",
            )}
          >
            {met[index] ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <X className="size-3.5 shrink-0 opacity-50" aria-hidden />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const BAR_TONE: Record<number, string> = {
  0: "bg-border",
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-brand",
  4: "bg-success",
};

const TEXT_TONE: Record<number, string> = {
  0: "text-muted-foreground",
  1: "text-destructive",
  2: "text-warning",
  3: "text-brand-foreground dark:text-brand",
  4: "text-success",
};
