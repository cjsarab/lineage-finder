import { useSyncExternalStore } from "react"

// The accent colour presets. The colours themselves live in theme.css
// (`data-accent` blocks); this list is for the parts of the page that offer the choice. A test checks the two agree.
export const ACCENTS = [
  { id: "amber", name: "Amber", hex: "#ffad30" },
  { id: "yellow", name: "Yellow", hex: "#ffdc58" },
  { id: "pink", name: "Pink", hex: "#ff90e8" },
  { id: "blue", name: "Blue", hex: "#88aaee" },
  { id: "green", name: "Green", hex: "#a3e636" },
  { id: "orange", name: "Orange", hex: "#ff7a5c" },
  { id: "purple", name: "Purple", hex: "#a388ee" },
  { id: "teal", name: "Teal", hex: "#2dd4bf" },
  { id: "sky", name: "Sky", hex: "#5ec8f2" },
  { id: "rose", name: "Rose", hex: "#ff8fab" },
  { id: "mint", name: "Mint", hex: "#7fe5a0" },
  { id: "lime", name: "Lime", hex: "#d4f04a" },
] as const

export type AccentId = (typeof ACCENTS)[number]["id"]

export const DEFAULT_ACCENT: AccentId = "amber"

/** Where the choice is remembered in the browser. index.html reads the same key, so the colour is right
 * before the page draws (no flash of Amber). */
export const ACCENT_KEY = "lineage-finder:accent"

// Tells every part of the page showing the choice that it changed.
const CHANGED = "lineage-finder:accent-choice"

const isAccent = (value: unknown): value is AccentId => ACCENTS.some((a) => a.id === value)

/** Shows an accent straight away, without remembering it (the component gallery uses this). */
export function showAccent(id: AccentId) {
  document.documentElement.dataset.accent = id
}

/** The saved choice, or the default. */
export function storedAccent(): AccentId {
  try {
    const value = localStorage.getItem(ACCENT_KEY)
    return isAccent(value) ? value : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

/** Shows an accent and remembers it (Settings). */
export function chooseAccent(id: AccentId) {
  showAccent(id)
  try {
    localStorage.setItem(ACCENT_KEY, id)
  } catch {
    // Storage unavailable (e.g. a private window): the colour still changes until the page is closed.
  }
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

export function useAccent(): AccentId {
  return useSyncExternalStore(subscribe, storedAccent, () => DEFAULT_ACCENT)
}
