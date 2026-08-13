/**
 * The storefront footer.
 *
 * Painted on `surface-dark` in both themes, so the page always ends on a solid
 * band rather than fading into the background. That means it cannot lean on
 * `foreground` / `muted-foreground` for text - those invert - so every colour
 * here comes from the `surface-dark-*` set.
 *
 * Three bands: the trust strip, the link columns, and the legal line. The
 * extra bottom padding on small screens clears the fixed tab bar.
 */

import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import {
  contact,
  footerNav,
  legalNav,
  siteConfig,
  trustBadges,
} from "@/lib/config/site";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { BrandLogo } from "./brand-logo";
import { NavLink } from "./nav-link";
import { SocialLinks } from "./social-links";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface-footer text-surface-dark-foreground">
      {/* Trust strip: the objections that stop a first order.
       *
       * One column under 380px, two from there, and all four side by side past
       * 800px. That last step is an explicit `min-[50rem]` rather than a named
       * breakpoint - it falls between Tailwind's `md` (768px) and `lg`
       * (1024px), and it is the only place in the app that needs it. */}
      <div className="border-b border-surface-dark-border">
        <Stagger className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-x-6 gap-y-2 px-4 py-8 xs:grid-cols-2 sm:px-6 min-[50rem]:grid-cols-4 lg:px-8">
          {trustBadges.map(({ icon: Icon, title, description }) => (
            <StaggerItem key={title} className="flex items-start gap-3 py-2">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Icon className="size-5.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-surface-dark-muted">
                  {description}
                </span>
              </span>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2.6fr]">
          <Reveal className="flex flex-col gap-5">
            {/* The dark-mode wordmark, always - the band is dark in both
                themes, so the light-mode logo would be black on black. */}
            <BrandLogo className="h-9" forceDark />
            <p className="max-w-sm text-sm leading-relaxed text-surface-dark-muted">
              {siteConfig.description}
            </p>
            <SocialLinks size="md" className="mt-1" />
          </Reveal>

          <Stagger className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerNav.map((column) => (
              <StaggerItem key={column.title} as="nav" aria-label={column.title}>
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <NavLink
                        href={link.href}
                        external={link.external}
                        className="text-sm text-surface-dark-muted transition-colors hover:text-brand"
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div className="mt-10 grid gap-4 border-t border-surface-dark-border pt-8 text-sm text-surface-dark-muted sm:grid-cols-3">
          <a
            href={contact.phoneHref}
            className="flex items-center gap-2 transition-colors hover:text-surface-dark-foreground"
          >
            <Phone className="size-4.5 shrink-0" aria-hidden />
            {contact.phone}
          </a>
          <a
            href={contact.emailHref}
            className="flex items-center gap-2 transition-colors hover:text-surface-dark-foreground"
          >
            <Mail className="size-4.5 shrink-0" aria-hidden />
            {contact.email}
          </a>
          <p className="flex items-center gap-2">
            <MapPin className="size-4.5 shrink-0" aria-hidden />
            {contact.location}
          </p>
        </div>
      </div>

      <div className="border-t border-surface-dark-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col-reverse items-center justify-between gap-4 px-4 py-6 pb-[calc(1.5rem+var(--h-tabbar))] sm:px-6 lg:flex-row lg:px-8 lg:pb-6">
          <p className="text-center text-xs text-surface-dark-muted lg:text-left">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
            <span className="mx-1.5 opacity-40">·</span>
            Built by{" "}
            <a
              href={siteConfig.developer.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-surface-dark-foreground underline underline-offset-4 transition-colors hover:text-brand"
            >
              {siteConfig.developer.name}
            </a>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {legalNav.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-surface-dark-muted transition-colors hover:text-surface-dark-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
