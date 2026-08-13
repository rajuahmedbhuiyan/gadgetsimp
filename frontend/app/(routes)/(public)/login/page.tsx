import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { loginNotice } from "@/components/auth/notices";
import { safeRedirectPath } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back. Sign in to track orders and check out faster."
      footer={
        <p>
          New here?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <LoginForm
        nextPath={safeRedirectPath(params.next)}
        notice={loginNotice(params.notice)}
      />
    </AuthShell>
  );
}
