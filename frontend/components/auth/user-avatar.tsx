"use client";

/**
 * The signed-in user's picture, or their initials.
 *
 * Shared by the header menu and the account page so the two cannot drift -
 * they show the same person, and the referrer quirk below has to be handled
 * identically in both or the avatar loads in one place and not the other.
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/api/types";

export function UserAvatar({
  user,
  className,
  fallbackClassName,
}: {
  user: Pick<User, "fullName" | "image">;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      {/* `image` is null for an email signup; social accounts carry one.
       *
       * `referrerPolicy="no-referrer"` is what makes Google and Facebook
       * avatars actually load. Both CDNs answer 403 to a request carrying a
       * `Referer` from an origin they do not recognise, the <img> fires
       * `error`, and Base UI falls through to the initials - which looks
       * exactly like "no image was set". Sending no referrer at all avoids
       * the check. */}
      {user.image ? (
        <AvatarImage
          src={user.image}
          alt=""
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            // A failed load is indistinguishable from "no image set" once the
            // fallback renders, so say so rather than letting it look like the
            // account simply has no picture.
            if (status === "error" && process.env.NODE_ENV !== "production") {
              console.warn(
                `[avatar] "${user.image}" failed to load - falling back to initials.`,
              );
            }
          }}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-brand/15 font-semibold text-brand-foreground dark:text-brand",
          fallbackClassName,
        )}
      >
        {initials(user.fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

/** `Rahim Uddin` -> `RU`. One letter is fine; a single word is a valid name. */
export function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
