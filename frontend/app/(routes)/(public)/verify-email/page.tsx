import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Confirm your email",
};

/**
 * Where the signup email lands: `{APP_URL}/verify-email?token=…`.
 *
 * The token is read here rather than with `useSearchParams` so the client
 * component gets it as a prop and needs no Suspense boundary of its own.
 */
export default async function VerifyEmailPage(
  props: PageProps<"/verify-email">,
) {
  const params = await props.searchParams;

  return (
    <AuthShell title="Confirm your email">
      <VerifyEmailView token={firstParam(params.token)} />
    </AuthShell>
  );
}
