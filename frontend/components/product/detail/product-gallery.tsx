"use client";

/**
 * The product image viewer.
 *
 * Controlled from the parent so choosing a variant can jump the gallery to
 * that variant's photo - the two would drift apart if each held its own index.
 *
 * Three ways to look closer, one per input device:
 *
 *  - **pointer**: the image magnifies while the cursor is over it and the
 *    magnified area follows the cursor, so there is nothing to click first;
 *  - **click / tap**: opens the full-screen viewer;
 *  - **touch**: a horizontal swipe moves to the next image.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Media } from "@/lib/api/shop";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/** Past this much horizontal travel a touch counts as a swipe, not a tap. */
const SWIPE_THRESHOLD_PX = 45;

export function ProductGallery({
  images,
  active,
  onActiveChange,
  productName,
}: {
  images: Media[];
  active: number;
  onActiveChange: (index: number) => void;
  productName: string;
}) {
  const [zooming, setZooming] = useState(false);
  // Percentages, so `transform-origin` can follow the pointer.
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [lightbox, setLightbox] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const current = images[active];
  const count = images.length;

  function step(delta: number) {
    if (count < 2) return;
    onActiveChange((active + delta + count) % count);
  }

  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground">
        <ImageOff className="size-10" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative">
        <button
          type="button"
          aria-label={`Open ${productName} full screen`}
          onClick={() => setLightbox(true)}
          onMouseEnter={() => setZooming(true)}
          onMouseLeave={() => {
            setZooming(false);
            setOrigin({ x: 50, y: 50 });
          }}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setOrigin({
              x: ((event.clientX - box.left) / box.width) * 100,
              y: ((event.clientY - box.top) / box.height) * 100,
            });
          }}
          onTouchStart={(event) => {
            const point = event.touches[0];
            touch.current = point ? { x: point.clientX, y: point.clientY } : null;
          }}
          onTouchEnd={(event) => {
            const start = touch.current;
            const point = event.changedTouches[0];
            touch.current = null;
            if (!start || !point) return;

            const dx = point.clientX - start.x;
            const dy = point.clientY - start.y;

            // Only a mostly-horizontal drag is a swipe; anything steeper is
            // the shopper scrolling the page and must not be hijacked.
            if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
              event.preventDefault(); // Stops the tap becoming a lightbox open.
              step(dx < 0 ? 1 : -1);
            }
          }}
          className="relative block aspect-square w-full cursor-zoom-in touch-pan-y overflow-hidden rounded-2xl border bg-muted/30"
        >
          <Image
            key={current.src}
            src={current.src}
            alt={current.alt || productName}
            fill
            // The largest thing on the page at every width, so it is the one
            // image worth loading eagerly.
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className={cn(
              "object-contain p-6 transition-transform duration-200 ease-out",
              zooming && "scale-200",
            )}
            style={{ transformOrigin: `${origin.x}% ${origin.y}%` }}
          />

          <span className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1.5 text-xs font-medium text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            <Expand className="size-3.5" aria-hidden />
            Click to expand
          </span>

          {count > 1 && (
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium tabular-nums backdrop-blur lg:hidden">
              {active + 1} / {count}
            </span>
          )}
        </button>

        {count > 1 && (
          <>
            <GalleryArrow side="left" onClick={() => step(-1)} />
            <GalleryArrow side="right" onClick={() => step(1)} />
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((image, index) => (
            <li key={`${image.src}-${index}`}>
              <button
                type="button"
                onClick={() => onActiveChange(index)}
                aria-label={`View image ${index + 1} of ${count}`}
                aria-current={index === active}
                className={cn(
                  "relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-muted/30 transition-colors",
                  index === active
                    ? "border-brand"
                    : "border-transparent hover:border-border",
                )}
              >
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-contain p-1.5"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Lightbox
        open={lightbox}
        onOpenChange={setLightbox}
        images={images}
        startAt={active}
        productName={productName}
      />
    </div>
  );
}

/**
 * The full-screen viewer.
 *
 * Keeps its own index rather than sharing the page's. Driving both from one
 * value meant paging through the lightbox also paged the gallery underneath
 * it, so closing the dialog left the shopper on an image they never chose -
 * two things moving from one gesture. It opens on whatever the page is showing
 * and leaves that alone from then on.
 */
function Lightbox({
  open,
  onOpenChange,
  images,
  startAt,
  productName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: Media[];
  startAt: number;
  productName: string;
}) {
  const [index, setIndex] = useState(startAt);
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Re-seed from the page each time it opens, adjusted during render so the
  // first painted frame is already the right image.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(startAt);
  }

  const count = images.length;
  const current = images[index];

  function step(delta: number) {
    if (count < 2) return;
    setIndex((at) => (at + delta + count) % count);
  }

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        /*
         * Edge to edge with square corners on a phone - a rounded card inset
         * from a 375px screen wastes the width the image needs. From `sm` it
         * becomes a contained panel instead of filling the monitor, which at
         * 92vw left a product photo stranded in the middle of a huge frame.
         */
        className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-background p-0 ring-0 sm:h-auto sm:max-h-[92vh] sm:w-[min(58rem,92vw)] sm:rounded-2xl sm:border sm:ring-1"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") step(1);
          if (event.key === "ArrowLeft") step(-1);
        }}
      >
        <DialogTitle className="sr-only">{productName}</DialogTitle>

        <DialogClose
          render={
            <button
              type="button"
              aria-label="Close"
              className="absolute top-4 right-4 z-20 flex size-12 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background/85 text-foreground shadow-card backdrop-blur-md transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground"
            />
          }
        >
          <X className="size-6" aria-hidden />
        </DialogClose>

        <div
          className="relative min-h-0 flex-1 sm:h-[68vh] sm:flex-none"
          onTouchStart={(event) => {
            const point = event.touches[0];
            touch.current = point ? { x: point.clientX, y: point.clientY } : null;
          }}
          onTouchEnd={(event) => {
            const start = touch.current;
            const point = event.changedTouches[0];
            touch.current = null;
            if (!start || !point) return;

            const dx = point.clientX - start.x;
            const dy = point.clientY - start.y;
            if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
              step(dx < 0 ? 1 : -1);
            }
          }}
        >
          <Image
            key={current.src}
            src={current.src}
            alt={current.alt || productName}
            fill
            sizes="(min-width: 640px) 58rem, 100vw"
            className="object-contain p-4 sm:p-8"
          />

          {count > 1 && (
            <>
              <GalleryArrow side="left" onClick={() => step(-1)} />
              <GalleryArrow side="right" onClick={() => step(1)} />
            </>
          )}
        </div>

        {count > 1 && (
          <div className="flex shrink-0 items-center justify-center gap-2 border-t px-4 py-3">
            {images.map((image, position) => (
              <button
                key={`${image.src}-${position}`}
                type="button"
                onClick={() => setIndex(position)}
                aria-label={`View image ${position + 1} of ${count}`}
                aria-current={position === index}
                className={cn(
                  "relative size-14 cursor-pointer overflow-hidden rounded-lg border-2 bg-muted/30 transition-colors",
                  position === index
                    ? "border-brand"
                    : "border-transparent hover:border-border",
                )}
              >
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-contain p-1"
                />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GalleryArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous image" : "Next image"}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-foreground/10 text-foreground shadow-card backdrop-blur-md transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
