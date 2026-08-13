"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { SocialSignIn } from "@/components/auth/social-sign-in";
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
import { useRedirectWhenAuthenticated } from "@/hooks/use-redirect-when-authenticated";
import { authApi } from "@/lib/api/auth";
import { applyApiFieldErrors, errorMessage } from "@/lib/auth/errors";
import {
  registerSchema,
  type RegisterData,
  type RegisterValues,
} from "@/lib/auth/schemas";

export function RegisterForm() {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // A social button on this page signs the user straight in.
  useRedirectWhenAuthenticated("/");

  const form = useForm<RegisterValues, unknown, RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: RegisterData) {
    setFormError(null);
    try {
      await authApi.register({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        phone: values.phone,
      });
      // 202: understood, not yet acted upon. No account, no session, no token.
      setPendingEmail(values.email);
    } catch (error) {
      applyApiFieldErrors(error, setError, [
        "fullName",
        "email",
        "phone",
        "password",
      ]);
      setFormError(errorMessage(error));
    }
  }

  if (pendingEmail) return <CheckYourInbox email={pendingEmail} />;

  return (
    <div>
      {formError ? <FormAlert message={formError} /> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.fullName)}>
            <FieldLabel htmlFor="fullName">Full name</FieldLabel>
            <Input
              id="fullName"
              autoComplete="name"
              autoFocus
              aria-invalid={Boolean(errors.fullName)}
              {...register("fullName")}
            />
            <FieldDescription>
              One field - a single word is a valid name.
            </FieldDescription>
            <FieldError errors={[errors.fullName]} />
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="register-email">Email</FieldLabel>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+8801712345678"
              aria-invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
            <FieldError errors={[errors.phone]} />
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="register-password">Password</FieldLabel>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldDescription>
              At least 8 characters, with an uppercase letter, a lowercase
              letter and a number.
            </FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Create account
          </Button>
        </FieldGroup>
      </form>

      <SocialSignIn label="Or sign up with" />
    </div>
  );
}

/**
 * The response is identical whether or not the address was already taken, so
 * this copy has to work for both. Never say an address is available.
 */
function CheckYourInbox({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2 text-sm">
        <p className="font-medium">Check your inbox</p>
        <p className="text-muted-foreground">
          If that address can be signed up, a confirmation link is on its way to{" "}
          <span className="font-medium text-foreground">{email}</span>. The link
          is valid for 10 minutes, and your account is created when you open it.
        </p>
      </div>

      <ResendVerificationForm email={email} label="Send the link again" />

      <p className="text-sm text-muted-foreground">
        Already confirmed?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
