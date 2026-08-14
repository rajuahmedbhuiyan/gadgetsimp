"use client";

/**
 * Setting a profile picture.
 *
 * Two requests, not one: `POST /media/upload` stores the file and answers with
 * a Cloudinary URL, then `PATCH /users/me` saves that URL on the account. The
 * first can succeed and the second fail, so the copy below distinguishes them
 * - "uploaded but not saved" is a different problem from "upload failed", and
 * only one of them is worth retrying with the same file.
 *
 * The control is a label wrapping a hidden input rather than a button that
 * pokes a ref: a label opens the picker natively, is focusable, and works
 * without JavaScript deciding when.
 */

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { User } from "@/lib/api/types";
import { usersApi } from "@/lib/api/auth";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { errorMessage } from "@/lib/auth/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { UserAvatar } from "@/components/auth/user-avatar";

export function AvatarUploader({ user }: { user: User }) {
  const { reloadUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Lets the same file be chosen again after a failure - without this the
    // input's value is unchanged and `change` never fires a second time.
    event.target.value = "";

    const rejected = checkImage(file);
    if (rejected) {
      setError(rejected);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const { data } = await mediaApi.upload(file, "avatar");
      await usersApi.updateMe({ image: data.media.url });
      // The header avatar reads from the same context, so it updates with it.
      await reloadUser();
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <label
        className={cn(
          "group relative cursor-pointer rounded-full outline-offset-4 focus-within:outline-2 focus-within:outline-ring",
          busy && "pointer-events-none",
        )}
      >
        <UserAvatar
          user={user}
          className="size-20 border-2 border-background shadow-card sm:size-24"
          fallbackClassName="text-xl sm:text-2xl"
        />

        {/* Sits over the picture on hover, and permanently on touch, where
            there is no hover to reveal it. */}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-white transition-opacity",
            busy
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-5" aria-hidden />
          )}
        </span>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={onPick}
          aria-label="Change profile picture"
        />
      </label>

      <p className="text-xs text-muted-foreground">
        {busy ? "Uploading…" : "JPEG, PNG or WebP · up to 3MB"}
      </p>

      {error ? (
        <p role="alert" className="max-w-56 text-center text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
