import * as React from "react"

/**
 * 1024, not shadcn's 768.
 *
 * The whole app draws the line there - the storefront swaps its header,
 * drawer and tab bar at `lg`, and the control panel turns its sidebar into a
 * sheet at the same width. A tablet in portrait is a small screen here.
 *
 * Anything reading this hook must match the `lg:` variants it is paired with
 * in `components/ui/sidebar`, or the sheet and the rail both render at once.
 */
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
