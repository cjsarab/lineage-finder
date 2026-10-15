import { useSyncExternalStore } from "react"
import type { Theme } from "@/lib/theme"

// The current light/dark theme, kept up to date whenever the switch (or anything else) changes it.
// Reads the `dark` class on <html>, which is the single source of truth for the theme.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light")

export function useCurrentTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light")
}
