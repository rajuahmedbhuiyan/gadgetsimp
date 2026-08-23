"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MAX_PENDING_PROGRESS = 92;
const FINISH_DELAY_MS = 180;
const STALE_NAVIGATION_MS = 8_000;

function getUrlKey(url: URL) {
  return `${url.pathname}${url.search}`;
}

function getCurrentUrlKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function shouldTrackAnchorClick(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  ) {
    return false;
  }

  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;

  const nextUrl = new URL(anchor.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) return false;

  return getUrlKey(nextUrl) !== getCurrentUrlKey();
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPendingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!isPendingRef.current) return;

    isPendingRef.current = false;
    clearTimers();
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
    }, FINISH_DELAY_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    isPendingRef.current = true;
    setIsVisible(true);
    setProgress((current) => (current > 0 && current < 100 ? current : 12));

    intervalRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= MAX_PENDING_PROGRESS) return current;
        return Math.min(
          MAX_PENDING_PROGRESS,
          current + Math.max(1, (MAX_PENDING_PROGRESS - current) * 0.14),
        );
      });
    }, 180);

    staleTimerRef.current = setTimeout(() => {
      finish();
    }, STALE_NAVIGATION_MS);
  }, [clearTimers, finish]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement && shouldTrackAnchorClick(event, anchor)) {
        start();
      }
    };

    const handlePopState = () => {
      start();
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
  }, [clearTimers, start]);

  useEffect(() => {
    finish();
  }, [finish, pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div
        className="h-full bg-[#feb700] shadow-[0_0_12px_rgb(254_183_0/0.65)] transition-[opacity,width] duration-200 ease-out motion-reduce:transition-none"
        style={{
          opacity: isVisible ? 1 : 0,
          width: `${progress}%`,
        }}
      />
    </div>
  );
}
