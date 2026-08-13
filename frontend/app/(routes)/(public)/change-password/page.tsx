import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = {
  title: "Change your password",
};

export default function ChangePasswordPage() {
  return (
    <AuthShell
      title="Change your password"
      description="Changing it signs out every device, including this one."
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}
