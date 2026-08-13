/**
 * The strip above the header: a support line, the live date and time, and the
 * social links.
 *
 * Three columns on a symmetric grid so the clock sits optically centred no
 * matter how wide the two sides grow. Below `sm` the support line drops out —
 * the clock keeps the centre column, and the phone number is a tap away in the
 * drawer anyway.
 *
 * Painted on `surface-dark`, which stays dark in both themes. `ink` would
 * invert and turn this band white on a dark page.
 *
 * Deliberately not sticky: it is context, not navigation, and 40px of a phone
 * viewport is better spent on the catalogue.
 */

import { Phone } from "lucide-react";

import { contact } from "@/lib/config/site";
import { formatPrice } from "@/lib/format";
import { LiveClock } from "./live-clock";
import { SocialLinks } from "./social-links";

export function TopBar() {
  return (
    <div className="bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto grid h-topbar w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <Phone className="size-4 shrink-0 opacity-70" aria-hidden />
          <a
            href={contact.phoneHref}
            className="truncate text-xs font-medium text-surface-dark-foreground/85 transition-colors hover:text-surface-dark-foreground"
          >
            {contact.phone}
          </a>
          <span className="hidden text-xs text-surface-dark-muted lg:inline">
            {`· Free delivery over ${formatPrice(contact.freeDeliveryFrom)}`}
          </span>
        </div>

        {/* Empty on small screens, but still holding the first grid column so
            the clock stays centred rather than sliding left. */}
        <div className="sm:hidden" aria-hidden />

        <LiveClock className="col-start-2 text-surface-dark-foreground/90" />

        <div className="col-start-3 flex items-center justify-end">
          <SocialLinks />
        </div>
      </div>
    </div>
  );
}
