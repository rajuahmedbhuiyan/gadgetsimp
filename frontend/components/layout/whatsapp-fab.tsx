/**
 * The floating WhatsApp button.
 *
 * Support runs on WhatsApp, so it gets a persistent target rather than living
 * only at the bottom of the FAQ. A plain anchor - no state, no JS - which also
 * means it works the moment the HTML lands.
 *
 * It sits above the fixed tab bar below 1024px (`--h-tabbar` plus the safe
 * area, so it clears the iOS home indicator too) and drops to the normal page
 * corner from `lg` up, where there is no tab bar.
 *
 * `z-30` keeps it under the header (`z-40`) and the drawer overlay (`z-50`), so
 * it never floats over an open menu.
 */

import { FaWhatsapp } from "react-icons/fa6";

import { cn } from "@/lib/utils";
import { contact } from "@/lib/config/site";

export function WhatsAppFab({ className }: { className?: string }) {
  return (
    <a
      href={contact.whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={cn(
        "group fixed right-4 bottom-[calc(var(--h-tabbar)+1rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-card-hover transition-transform duration-200 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#25D366] active:scale-95 lg:right-6 lg:bottom-6",
        className,
      )}
    >
      {/* A slow halo so the button reads as live without demanding attention.
          `motion-reduce` drops it for anyone who asked for less movement. */}
      <span
        aria-hidden
        className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-20 motion-reduce:hidden"
      />
      <FaWhatsapp className="relative size-7" aria-hidden />

      {/* Label on hover, pointer-only - there is no hover on a phone, and the
          aria-label already names it. */}
      <span className="pointer-events-none absolute right-[calc(100%+0.75rem)] hidden rounded-lg bg-surface-dark px-3 py-1.5 text-xs font-medium whitespace-nowrap text-surface-dark-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:block">
        Chat with us
      </span>
    </a>
  );
}
