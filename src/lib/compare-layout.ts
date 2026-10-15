// The compare page's layout, One list or Side by side (each suits different uses), remembered in this browser like
// the page size (src/lib/page-size.ts).
import { useSyncExternalStore } from "react"

export type CompareLayout = "one" | "side"
export const COMPARE_LAYOUT_KEY = "lineage-finder:compare-layout"
const CHANGED = "lineage-finder:compare-layout-changed"

function storedLayout(): CompareLayout {
  try {
    return localStorage.getItem(COMPARE_LAYOUT_KEY) === "side" ? "side" : "one"
  } catch {
    return "one"
  }
}

export function chooseCompareLayout(layout: CompareLayout): void {
  try {
    localStorage.setItem(COMPARE_LAYOUT_KEY, layout)
  } catch {
    // Storage unavailable: the page stays on One list.
  }
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

export function useCompareLayout(): CompareLayout {
  return useSyncExternalStore(subscribe, storedLayout, () => "one")
}
