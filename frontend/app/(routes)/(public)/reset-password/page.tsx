import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Set a new password",
};

/** Where the reset email lands: `{APP_URL}/reset-password?token=…`. */
export default async function ResetPasswordPage(
  props: PageProps<"/reset-password">,
) {
  const params = await props.searchParams;

  return (
    <AuthShell
      title="Set a new password"
      description="Reset links are valid for 10 minutes and can be used once."
    >
      <ResetPasswordForm token={firstParam(params.token)} />
    </AuthShell>
  );
}
