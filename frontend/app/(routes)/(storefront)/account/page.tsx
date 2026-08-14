import type { Metadata } from "next";

import { container } from "@/components/home/section";
import { AccountView } from "@/components/account/account-view";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your details, password and saved items.",
  // Personal and signed-in - nothing to index.
  robots: { index: false, follow: false },
};

/**
 * The account hub.
 *
 * A thin server shell, like `/orders`: every endpoint behind it derives the
 * user from the access token, so there is nothing the server render could
 * fetch on their behalf. Middleware has already resolved the session by the
 * time this renders, so the client knows who is signed in on the first paint.
 */
export default function AccountPage() {
  return (
    <div className={`${container} py-6 lg:py-10`}>
      <header className="mb-6 lg:mb-8">
        <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">
          My profile
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your details and how you sign in.
        </p>
      </header>

      <AccountView />
    </div>
  );
}
