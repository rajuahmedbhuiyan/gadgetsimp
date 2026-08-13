import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { decodeUserHeader, USER_HEADER } from "@/lib/auth/user-header";
import { siteConfig } from "@/lib/config/site";
import { Providers } from "../providers";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Gadgets, audio and accessories`,
    // Every page below supplies only its own name.
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.ico" },
};

/**
 * The document shell. Deliberately holds no chrome of its own - the storefront
 * header and footer belong to the `(storefront)` group, so a route that should
 * not carry them (sign-in, checkout) can opt out by living elsewhere.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Middleware already refreshed the token and read /users/me, so the server
  // render knows the user without a call of its own.
  const user = decodeUserHeader((await headers()).get(USER_HEADER));

  return (
    // next-themes writes the theme class on <html> before paint, which the
    // server render cannot know about.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers initialUser={user}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
