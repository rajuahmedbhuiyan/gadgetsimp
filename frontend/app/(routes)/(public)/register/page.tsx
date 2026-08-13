import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create an account",
};

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create an account"
      description="We email you a link to confirm the address. The account is created when you open it."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
