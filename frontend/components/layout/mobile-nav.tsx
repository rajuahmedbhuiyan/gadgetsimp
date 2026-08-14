"use client";

/**
 * The drawer behind the hamburger, below 1024px.
 *
 * Deliberately plainer than the desktop menu: a search field, the same menu
 * flattened into accordions, and the account and support links that live in
 * the header or top bar on a wide screen. Hover panels have no touch
 * equivalent, so nothing here depends on a pointer.
 *
 * It is controlled rather than uncontrolled because it has to close itself on
 * navigation — the route changes under a drawer that would otherwise stay open.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LogIn, Menu, Package, Phone, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { contact, mainNav } from "@/lib/config/site";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "./brand-logo";
import { NavLink } from "./nav-link";
import { SearchBar } from "./search-bar";
import { SocialLinks } from "./social-links";
import { ThemeToggle } from "./theme-toggle";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  // Close on navigation. Adjusted during render rather than in an effect, so
  // the drawer is already gone on the pass that shows the new route.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Open menu"
            className="size-11 cursor-pointer"
          />
        }
      >
        <Menu className="size-6" />
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[88vw] max-w-sm gap-0 overflow-y-auto p-0"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center">
            <BrandLogo className="h-9" />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Browse categories, search the catalogue and reach your account.
          </SheetDescription>
        </SheetHeader>

        <div className="p-4">
          <SearchBar />
        </div>

        <nav aria-label="Mobile" className="px-2">
          <Accordion className="w-full">
            {mainNav.map((item) =>
              item.children ? (
                <AccordionItem
                  key={item.label}
                  value={item.label}
                  className="border-b-0"
                >
                  <AccordionTrigger className="px-2 py-3 text-base hover:no-underline">
                    {item.label}
                  </AccordionTrigger>
                  <AccordionContent className="pb-1">
                    <ul className="ml-2 flex flex-col border-l pl-3">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <NavLink
                            href={child.href}
                            external={child.external}
                            className="block rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {child.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ) : (
                <NavLink
                  key={item.label}
                  href={item.href}
                  external={item.external}
                  className={cn(
                    "block rounded-md px-2 py-3 text-base font-medium transition-colors hover:bg-muted",
                    pathname === item.href
                      ? "text-brand"
                      : "text-foreground",
                  )}
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </Accordion>
        </nav>

        <Separator className="my-2" />

        <div className="flex flex-col gap-1 px-2">
          {user ? (
            <>
              <DrawerLink href="/account" icon={User}>
                {user.fullName}
              </DrawerLink>
              <DrawerLink href="/orders" icon={Package}>
                My orders
              </DrawerLink>
              <DrawerLink href="/wishlist" icon={Heart}>
                Wishlist
              </DrawerLink>
            </>
          ) : (
            <>
              <DrawerLink href="/login" icon={LogIn}>
                Sign in
              </DrawerLink>
              <DrawerLink href="/register" icon={User}>
                Create an account
              </DrawerLink>
            </>
          )}
          <a
            href={contact.phoneHref}
            className="flex items-center gap-3 rounded-md px-2 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Phone className="size-5 text-muted-foreground" aria-hidden />
            {contact.phone}
          </a>
        </div>

        <div className="mt-auto flex flex-col gap-4 border-t p-4">
          <ThemeToggle variant="segmented" className="self-start" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Follow us</span>
            <SocialLinks size="md" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DrawerLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-2 py-3 text-sm font-medium transition-colors hover:bg-muted"
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      {children}
    </Link>
  );
}
