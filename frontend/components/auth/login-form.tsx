"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRedirectWhenAuthenticated } from "@/hooks/use-redirect-when-authenticated";
import { useAuth } from "@/lib/auth/auth-context";
import { applyApiFieldErrors, errorMessage } from "@/lib/auth/errors";
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
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: LoginData) {
    setFormError(null);
    try {
      await login(values.email, values.password);
    } catch (error) {
      // 401 here is INVALID_CREDENTIALS, which deliberately covers both an
      // unknown address and a wrong password - do not try to tell them apart.
      applyApiFieldErrors(error, setError, ["email", "password"]);
      setFormError(errorMessage(error));
    }
  }

  return (
    <div>
      {notice ? <FormAlert message={notice} variant="default" /> : null}
      {formError ? <FormAlert message={formError} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Sign in
          </Button>
        </FieldGroup>
      </form>

      <div className="mt-3 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot your password?
        </Link>
      </div>

      <SocialSignIn />
    </div>
  );
}
