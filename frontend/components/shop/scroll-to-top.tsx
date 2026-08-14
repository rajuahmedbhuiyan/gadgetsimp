"use client";

/**
 * Back to the top, once there is enough behind you to be worth it.
 *
 * An infinite grid has no bottom to reach and no pagination to jump from, so
 * without this the only way back to the filters is a long flick. It appears
 * after roughly two screens, which is late enough that it is never in the way
 * on a short result set.
 *
 * `passive: true` on the listener: this only reads `scrollY` and never calls
 * `preventDefault`, and saying so keeps it off the main thread's critical path
 * during a scroll.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "lucide-react";

import { EASE_BRAND } from "@/lib/motion";

const SHOW_AFTER = 1200;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.2, ease: EASE_BRAND }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          // Clears the fixed tab bar below 1024px, where it would otherwise
          // sit on top of the cart and profile tabs.
          className="fixed right-4 bottom-[calc(var(--h-tabbar)+1rem+env(safe-area-inset-bottom))] z-30 flex size-12 cursor-pointer items-center justify-center rounded-full border bg-card text-foreground shadow-card-hover transition-colors hover:border-brand/50 hover:bg-brand hover:text-brand-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:right-6 lg:bottom-6"
        >
          <ArrowUp className="size-5" aria-hidden />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
