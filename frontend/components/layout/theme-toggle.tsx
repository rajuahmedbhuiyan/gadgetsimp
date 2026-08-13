"use client";

/**
 * Light / dark.
 *
 * next-themes persists the choice to localStorage under the key set in
 * `providers.tsx` and writes the class onto `<html>` before first paint, so
 * there is no flash on reload. When the preference moves to the account API,
 * this component does not change — only where the provider reads its initial
 * value from does.
 *
 * Two presentations, one behaviour: `button` is the single toggle used on
 * desktop, `segmented` shows both options as labelled pills in the mobile
 * drawer, where a bare icon gives no clue which way it will flip.
 */

import { useTheme } from "next-themes";
import { motion } from "motion/react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";

/**
 * Light and dark only. "System" is still the provider's default for a first
 * visit, but it is not offered as a choice - on a phone the third pill made
 * the control wrap, and a shopper picking a theme by hand has already decided
 * not to follow the OS.
 */
const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ThemeToggle({
  variant = "button",
  className,
}: {
  variant?: "button" | "segmented";
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  // The stored choice is unknown until the client reads localStorage, so the
  // selected pill and the button's label wait for hydration.
  const mounted = useHydrated();

  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border bg-muted/50 p-0.5",
          className,
        )}
      >
        {options.map(({ value, label, icon: Icon }) => {
          // Against the *resolved* theme, not the stored one: a visitor still
          // on the "system" default would otherwise see neither pill lit.
          const active = mounted && resolvedTheme === value;

          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className="relative flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {active && (
                // One shared `layoutId` makes the pill slide between options
                // instead of cross-fading in place.
                <motion.span
                  layoutId="theme-segment"
                  className="absolute inset-0 rounded-full bg-background shadow-card"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                className={cn(
                  "relative size-4.5",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "relative",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("size-11 cursor-pointer rounded-full", className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={
        mounted
          ? `Switch to ${isDark ? "light" : "dark"} theme`
          : "Switch colour theme"
      }
    >
      {/* Both icons render and the visible one is chosen by the `dark` class,
          so the button is correct on first paint like the logo is. */}
      <Sun className="size-5.5 dark:hidden" aria-hidden />
      <Moon className="hidden size-5.5 dark:block" aria-hidden />
    </Button>
  );
}
