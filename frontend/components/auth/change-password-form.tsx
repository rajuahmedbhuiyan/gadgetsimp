"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import {
  AUTH_BUTTON,
  ErrorSlot,
  PasswordField,
  PasswordStrengthMeter,
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
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-context";
import { errorCode, errorMessage } from "@/lib/auth/errors";
import {
  changePasswordSchema,
  type ChangePasswordData,
  type ChangePasswordValues,
} from "@/lib/auth/schemas";

export function ChangePasswordForm() {
  const { status } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [noPassword, setNoPassword] = useState(false);
  const [done, setDone] = useState(false);

  const form = useForm<ChangePasswordValues, unknown, ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  // Feeds the strength meter without re-rendering on the other two fields.
  const newPassword = useWatch({ control, name: "newPassword" }) ?? "";

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(
      () => router.replace("/login?notice=password-changed"),
      1200,
    );
    return () => clearTimeout(timer);
  }, [done, router]);

  async function onSubmit(values: ChangePasswordData) {
    setFormError(null);
    setNoPassword(false);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      // Success ends every session, including this one - the API client has
      // already dropped the local token.
      setDone(true);
    } catch (error) {
      const code = errorCode(error);
      // A 401 here means the current password was wrong, and it arrives
      // without an `errors[]` entry to hang on the control.
      if (code === "INVALID_CREDENTIALS") {
        setError("currentPassword", {
          type: "server",
          message: "That is not your current password",
        });
      }
      if (code === "PASSWORD_NOT_SET") setNoPassword(true);
      setFormError(errorMessage(error));
    }
  }

  // Checked before `status`, because succeeding here signs the user out and
  // would otherwise flash the signed-out state.
  if (done) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <FormAlert
          message="Password changed. Every device has been signed out."
          tone="info"
        />
        <p className="text-muted-foreground">Taking you to sign in…</p>
        <Link href="/login" className="underline underline-offset-4">
          Sign in now
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Checking your session…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <p className="text-sm text-muted-foreground">
        You need to be signed in to change your password.{" "}
        <Link
          href="/login?next=/change-password"
          className="underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    );
  }

  return (
    <div>
      {formError ? (
        <FormAlert message={formError}>
          {noPassword ? (
            <Link href="/forgot-password" className="underline underline-offset-4">
              Set a password instead
            </Link>
          ) : null}
        </FormAlert>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.currentPassword)}>
            <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
            <PasswordField
              id="currentPassword"
              placeholder="Your current password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.currentPassword)}
              {...register("currentPassword")}
            />
            <ErrorSlot>
              <FieldError errors={[errors.currentPassword]} />
            </ErrorSlot>
          </Field>

          <Field data-invalid={Boolean(errors.newPassword)}>
            <FieldLabel htmlFor="change-new-password">New password</FieldLabel>
            <PasswordField
              id="change-new-password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.newPassword)}
              {...register("newPassword")}
            />
            <FieldDescription>
              It must differ from your current password.
            </FieldDescription>
            {newPassword ? (
              <PasswordStrengthMeter value={newPassword} />
            ) : null}
            <ErrorSlot>
              <FieldError errors={[errors.newPassword]} />
            </ErrorSlot>
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="change-confirm">Confirm new password</FieldLabel>
            <PasswordField
              id="change-confirm"
              placeholder="Type it again"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            <ErrorSlot>
              <FieldError errors={[errors.confirmPassword]} />
            </ErrorSlot>
          </Field>

          <Button
            type="submit"
            className={AUTH_BUTTON}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Changing…" : "Change password"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
