import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { UserMenu } from "@/components/auth/user-menu";
import { Toaster } from "@/components/ui/sonner";
import { decodeUserHeader, USER_HEADER } from "@/lib/auth/user-header";
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
  title: "GadgetSimp",
  description: "GadgetSimp online store",
};

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
      <body className="min-h-full flex flex-col">
        <Providers initialUser={user}>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <Link href="/" className="font-semibold">
              GadgetSimp
            </Link>
            <UserMenu />
          </header>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
