"use client";

/**
 * The hero slider.
 *
 * Embla underneath, so drag, swipe and keyboard arrows all come for free and
 * the slide track is real DOM rather than an absolutely-positioned stack -
 * every headline is in the HTML whether or not its slide is showing.
 *
 * Auto-advance pauses on hover and on focus: a slide that moves while someone
 * is reaching for its button is the classic way carousels lose a click. It is
 * also skipped entirely under `prefers-reduced-motion`, where an unprompted
 * change of content is exactly what the setting asks us not to do.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { heroSlides, type HeroSlide } from "@/lib/config/site";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

/**
 * How long a slide holds before the next one comes in.
 *
 * Long on purpose: the copy is a full headline plus a paragraph, and a shopper
 * who starts reading should never have the slide move out from under them.
 */
const AUTOPLAY_MS = 15_000;

/**
 * Embla's scroll duration, in its own units (default 25 - lower is faster).
 *
 * The pause is the slow part, not the travel. Once the slide does change it
 * should be over quickly, so the two are tuned in opposite directions.
 */
const SCROLL_DURATION = 18;

/**
 * Each slide's palette, as two mesh blobs and a hairline.
 *
 * Written out per tone rather than interpolated, because Tailwind only ships
 * classes it can see as complete strings in the source.
 */
const tones: Record<
  HeroSlide["tone"],
  { primary: string; secondary: string; hairline: string; wash: string }
> = {
  amber: {
    primary: "bg-hero-1/40",
    secondary: "bg-hero-3/20",
    hairline: "border-hero-1/25",
    wash: "from-hero-1/12",
  },
  cool: {
    primary: "bg-hero-2/35",
    secondary: "bg-hero-1/22",
    hairline: "border-hero-2/25",
    wash: "from-hero-2/12",
  },
  violet: {
    primary: "bg-hero-3/35",
    secondary: "bg-hero-2/22",
    hairline: "border-hero-3/25",
    wash: "from-hero-3/12",
  },
};

export function HeroSlider() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();


  // Subscribing rather than reading: the callback runs on Embla's events, so
  // no state is set synchronously while the effect body runs.
  useEffect(() => {
    if (!api) return;

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || paused || reduceMotion) return;
    const timer = setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [api, paused, reduceMotion]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      className="relative border-b"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Carousel setApi={setApi} opts={{ loop: true, align: "start", duration: SCROLL_DURATION }}>
        <CarouselContent className="ml-0">
          {heroSlides.map((slide, index) => (
            <CarouselItem
              key={slide.title}
              className="basis-full pl-0"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${heroSlides.length}`}
            >
              {/* The slide is the full canvas; the copy is centred in it, so
                  every slide is the same height regardless of its text. */}
              <div className="relative flex min-h-[32rem] items-center overflow-hidden sm:min-h-[36rem] lg:min-h-[40rem]">
                <Backdrop tone={slide.tone} />

                <div className="relative mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
                  <span
                    className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm text-brand-foreground dark:text-brand"
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    {slide.eyebrow}
                  </span>

                  {/* `h1` on the first slide only - the rest are alternates of
                      the same banner, not extra top-level page headings. */}
                  {index === 0 ? (
                    <h1
                      className="max-w-3xl font-heading text-[2.5rem] leading-[1.03] font-black tracking-tight text-balance sm:text-6xl lg:text-7xl"
                    >
                      {slide.title} <Highlight>{slide.highlight}</Highlight>
                    </h1>
                  ) : (
                    <p
                      className="max-w-3xl font-heading text-[2.5rem] leading-[1.03] font-black tracking-tight text-balance sm:text-6xl lg:text-7xl"
                    >
                      {slide.title} <Highlight>{slide.highlight}</Highlight>
                    </p>
                  )}

                  <p
                    className="max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg"
                  >
                    {slide.description}
                  </p>

                  <div
                    className="mt-2 flex flex-wrap items-center gap-3"
                  >
                    <Button
                      size="lg"
                      className="h-12 cursor-pointer gap-2 px-7 text-sm"
                      render={<Link href={slide.cta.href} />}
                    >
                      {slide.cta.label}
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>

                    {slide.secondary && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-12 cursor-pointer bg-background/60 px-7 text-sm backdrop-blur-sm"
                        render={<Link href={slide.secondary.href} />}
                      >
                        {slide.secondary.label}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Dots double as the slide controls. Wide hit areas, not 8px circles. */}
      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2">
        {heroSlides.map((slide, index) => {
          const active = index === current;

          return (
            <button
              key={slide.title}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={active}
              onClick={() => api?.scrollTo(index)}
              className="group cursor-pointer p-2"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-300",
                  active
                    ? "w-9 bg-brand"
                    : "w-3 bg-foreground/25 group-hover:bg-foreground/50",
                )}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The slide's background: four stacked layers, none of them an image.
 *
 *   1. a corner wash that tints the whole panel
 *   2. two blurred mesh blobs, offset so the colour is never symmetrical
 *   3. a dot field, radially masked so it fades out before the edges
 *   4. two oversized rotated squares as a faint geometric motif
 *
 * All of it is CSS over theme tokens - it costs no bytes, needs no art
 * direction per breakpoint, and recolours itself in dark mode.
 */
function Backdrop({ tone }: { tone: HeroSlide["tone"] }) {
  const palette = tones[tone];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={cn(
          "absolute inset-0 bg-linear-to-br to-background",
          palette.wash,
        )}
      />

      <div
        className={cn(
          "absolute -top-32 -right-20 size-[34rem] rounded-full blur-3xl",
          palette.primary,
        )}
      />
      <div
        className={cn(
          "absolute -bottom-40 -left-24 size-[28rem] rounded-full blur-3xl",
          palette.secondary,
        )}
      />

      <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(var(--color-foreground)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]" />

      <div
        className={cn(
          "absolute -top-24 right-[8%] size-72 rotate-[28deg] rounded-[4rem] border-2 opacity-60",
          palette.hairline,
        )}
      />
      <div
        className={cn(
          "absolute -bottom-32 right-[24%] size-80 rotate-12 rounded-[5rem] border opacity-40",
          palette.hairline,
        )}
      />

      {/* Fades the whole thing into the section below, so the hero does not
          end on a hard colour edge. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-background" />
    </div>
  );
}

/** The amber highlighter stroke behind the last words of a headline. */
function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-1 z-0 h-3 -skew-x-6 bg-brand/45 lg:bottom-2 lg:h-5"
      />
    </span>
  );
}
