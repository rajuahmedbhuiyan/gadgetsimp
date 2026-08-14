"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  AUTH_BUTTON,
  AuthInput,
  PasswordField,
} from "@/components/auth/controls";
import { FormAlert } from "@/components/auth/form-alert";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useRedirectWhenAuthenticated } from "@/hooks/use-redirect-when-authenticated";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/auth/errors";
import { loginSchema, type LoginData, type LoginValues } from "@/lib/auth/schemas";

export function LoginForm({
  nextPath = "/",
  notice,
}: {
  nextPath?: string;
  notice?: string | null;
}) {
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  // Covers both "just signed in" and "was already signed in".
  useRedirectWhenAuthenticated(nextPath);

  const form = useForm<LoginValues, unknown, LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: LoginData) {
    setFormError(null);
    try {
      await login(values.email, values.password);
    } catch (error) {
      // 401 here is INVALID_CREDENTIALS, which deliberately covers both an
      // unknown address and a wrong password - do not try to tell them apart.
      setFormError(errorMessage(error));
    }
  }

  return (
    <div>
      {notice ? <FormAlert message={notice} tone="info" /> : null}
      {formError ? <FormAlert message={formError} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <AuthInput
              id="email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            {/* The reset link lives beside the label, which is where someone
                who has just failed a sign-in looks for it. */}
            <div className="flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-brand-foreground underline underline-offset-4 transition-colors hover:text-foreground dark:text-brand"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordField
              id="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>

          <Button
            type="submit"
            className={AUTH_BUTTON}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>

      <SocialSignIn />
    </div>
  );
}
