import { useEffect, useSyncExternalStore } from "react"

export type Theme = "light" | "dark"
/** What the user picked in Settings: a theme, or "same as my computer". */
export type ThemeChoice = Theme | "system"

/** Where the user's choice is remembered in the browser. index.html reads the same key. */
export const THEME_KEY = "lineage-finder:theme"

// Tells the header button and Settings when the other one changes the choice.
const CHANGED = "lineage-finder:theme-choice"

/** The user's saved choice, or null if they haven't chosen. */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === "light" || value === "dark" ? value : null
  } catch {
    return null
  }
}

/** The computer's light/dark setting. */
export function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** The theme to use: the user's choice, otherwise the computer's setting. */
export function initialTheme(): Theme {
  return storedTheme() ?? systemTheme()
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

/** Switches theme and remembers the choice; "system" forgets it and follows the computer again. */
export function chooseTheme(choice: ThemeChoice): void {
  applyTheme(choice === "system" ? systemTheme() : choice)
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Storage unavailable (e.g. a private window): the switch still works until the page is closed.
  }
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

/** The user's current choice, kept up to date wherever it's changed. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => storedTheme() ?? "system", () => "system")
}

/** While the choice is "same as my computer", follow the computer if its setting changes. Used once, by the app. */
export function useFollowSystemTheme(): void {
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)")
    if (!query) return
    const onChange = () => {
      if (storedTheme() === null) applyTheme(query.matches ? "dark" : "light")
    }
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
}
