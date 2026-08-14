"use client";

/**
 * Name and phone.
 *
 * `PATCH /users/me` is strict and takes only `fullName`, `phone` and `image`,
 * and it refuses an empty body - so this sends the changed fields alone and
 * the button stays disabled until something actually differs. Saving a form
 * the shopper has not touched should not be a request.
 *
 * Email is shown but not editable. The API has no endpoint for it, which is
 * not an omission: the verified address is what the account is, and moving it
 * is a re-verification flow rather than a form field.
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Check, Mail } from "lucide-react";

import {
  AuthInput,
  CONTROL,
  normaliseMobile,
  PhoneField,
} from "@/components/auth/controls";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usersApi } from "@/lib/api/auth";
import type { User } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/auth/errors";
import { isApiError } from "@/lib/api/client";
import {
  profileSchema,
  type ProfileData,
  type ProfileValues,
} from "@/lib/auth/schemas";
import { cn } from "@/lib/utils";

/** `+8801602817341` -> `01602817341`, which is what the control holds. */
function localDigits(phone: string | null) {
  // The same helper the control itself uses on every keystroke, so a stored
  // number and a typed one can never disagree about what the local form is.
  return phone ? normaliseMobile(phone) : "";
}

export function ProfileForm({ user }: { user: User }) {
  const { reloadUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const initial = {
    fullName: user.fullName,
    phone: localDigits(user.phone),
  };

  const form = useForm<ProfileValues, unknown, ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial,
    // Matches every other form in the app: nothing is inserted on blur, so a
    // click that lands while a message appears is never swallowed.
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  /*
   * `useWatch`, not `watch()` - the latter returns a fresh function each
   * render, which makes React Compiler skip optimising this whole component.
   * Subscribing to the two fields individually is also less work than
   * re-rendering on every keystroke in any of them.
   */
  const fullName = useWatch({ control, name: "fullName" }) ?? "";
  const phone = useWatch({ control, name: "phone" }) ?? "";

  // Drives the save button: an untouched form should not be a request.
  const changed = fullName.trim() !== initial.fullName || phone !== initial.phone;

  async function onSubmit(values: ProfileData) {
    setFormError(null);
    setSaved(false);

    /*
     * The schema turns an empty control into `undefined`, which drops the key
     * from the patch - fine for someone who never had a number, misleading for
     * someone who just cleared theirs, since the old one would survive and
     * reappear on reload. There is no way to unset it: `phone` is optional but
     * not nullable, so `null` is a 422. Say so instead of pretending.
     */
    if (user.phone && values.phone === undefined) {
      setError("phone", {
        type: "manual",
        message: "A number cannot be removed here - enter a new one instead.",
      });
      return;
    }

    const patch: { fullName?: string; phone?: string } = {};
    if (values.fullName !== user.fullName) patch.fullName = values.fullName;
    if (values.phone && values.phone !== user.phone) patch.phone = values.phone;

    // Guards the server's "provide at least one field" refusal. The button is
    // already disabled when nothing differs; this covers the whitespace-only
    // edit that trims back to the original.
    if (Object.keys(patch).length === 0) {
      reset(initial);
      return;
    }

    try {
      const { data } = await usersApi.updateMe(patch);
      // Re-baselines the form on what the server stored, not on what was
      // typed - it trims and normalises, and the phone comes back prefixed.
      reset({
        fullName: data.user.fullName,
        phone: localDigits(data.user.phone),
      });
      setSaved(true);
      await reloadUser();
    } catch (error) {
      if (isApiError(error)) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          if (field === "fullName" || field === "phone") {
            setError(field, { type: "server", message });
          }
        }
      }
      setFormError(errorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError ? <FormAlert message={formError} className="mb-4" /> : null}

      <FieldGroup>
        <Field data-invalid={Boolean(errors.fullName)}>
          <FieldLabel htmlFor="account-name">
            Full name <span className="text-destructive">*</span>
          </FieldLabel>
          <AuthInput
            id="account-name"
            placeholder="Rahim Uddin"
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            {...register("fullName")}
          />
          <FieldError errors={[errors.fullName]} />
        </Field>

        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="account-phone">
            Mobile number
            {/* Only honest while there is no number. Once one is saved it
                cannot be cleared, so calling it optional would be wrong for
                exactly the people who already have one. */}
            {user.phone ? null : (
              <span className="font-normal text-muted-foreground">
                {" "}
                (optional)
              </span>
            )}
          </FieldLabel>
          <PhoneField
            id="account-phone"
            aria-invalid={Boolean(errors.phone)}
            {...register("phone")}
          />
          {/* Same rule and same wording as the signup form - one format to
              learn, stated the same way wherever a number is asked for. */}
          <FieldDescription>
            11 digits, starting with 01. We use it to confirm your order.
          </FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <div className="relative">
            <Mail
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="account-email"
              value={user.email}
              readOnly
              disabled
              className={cn(CONTROL, "pl-10 disabled:opacity-100")}
            />
          </div>
          <FieldDescription>
            Your email identifies your account and cannot be changed here.
          </FieldDescription>
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            className="h-12 w-full shrink-0 cursor-pointer rounded-field px-6 text-sm font-semibold sm:w-auto"
            disabled={isSubmitting || !changed}
          >
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>

          {/*
            * Only while there is something to discard. A permanently visible
            * Cancel on a settings form is a button that does nothing most of
            * the time, and next to a disabled Save it reads as the live one.
            *
            * `type="button"` matters: the default inside a form is submit,
            * which would save the edits it is meant to throw away.
            */}
          {changed ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => {
                reset(initial);
                setFormError(null);
                setSaved(false);
              }}
              className="h-12 w-full shrink-0 cursor-pointer rounded-field px-5 text-sm font-medium text-muted-foreground sm:w-auto"
            >
              Discard
            </Button>
          ) : null}

          {/* Replaces the button's own label rather than sitting under the
              form, so the confirmation is where the eye already is. */}
          {saved && !changed ? (
            <span
              role="status"
              className="flex items-center gap-1.5 text-sm font-medium text-success"
            >
              <Check className="size-4" aria-hidden />
              Saved
            </span>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}
