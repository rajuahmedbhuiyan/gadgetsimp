import Image from "next/image";
import Link from "next/link";

import logoDark from "@/public/assets/logo-dark.png";
import logoLight from "@/public/assets/logo.png";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/config/site";

/**
 * The wordmark, swapped by CSS rather than by reading the theme.
 *
 * `useTheme()` only knows the answer after hydration, which would flash the
 * wrong logo on first paint. Both files ship and the `dark:` variant hides one
 * — the class is already on `<html>` before the browser paints, so the right
 * one is visible immediately. Next still serves each at the size asked for, so
 * the unused copy costs a few KB.
 */
export function BrandLogo({
  className,
  priority = false,
  forceDark = false,
}: {
  className?: string;
  priority?: boolean;
  /**
   * Always use the light-on-dark wordmark, whatever the theme. For the bands
   * that stay dark in both - the footer - where the default variant would put
   * a black wordmark on a black ground.
   */
  forceDark?: boolean;
}) {
  const shared = "h-full w-auto object-contain";

  if (forceDark) {
    return (
      <Link
        href="/"
        aria-label={`${siteConfig.name} — home`}
        className={cn(
          "relative block h-10 shrink-0 rounded-md transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current lg:h-12",
          className,
        )}
      >
        <Image
          src={logoDark}
          alt={siteConfig.name}
          priority={priority}
          className={shared}
          sizes="180px"
        />
      </Link>
    );
  }

  return (
    <Link
      href="/"
      aria-label={`${siteConfig.name} — home`}
      className={cn(
        "relative block h-10 shrink-0 rounded-md transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:h-12",
        className,
      )}
    >
      <Image
        src={logoLight}
        alt={siteConfig.name}
        priority={priority}
        className={cn(shared, "dark:hidden")}
        sizes="180px"
      />
      <Image
        src={logoDark}
        alt=""
        aria-hidden
        priority={priority}
        className={cn(shared, "hidden dark:block")}
        sizes="180px"
      />
    </Link>
  );
}
