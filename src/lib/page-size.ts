// How many APIs to a page (20, 50 or 100, starting at 20), remembered in this browser like
// light/dark.
import { useSyncExternalStore } from "react"

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 20

export const PAGE_SIZE_KEY = "lineage-finder:page-size"
const CHANGED = "lineage-finder:page-size-changed"

export function storedPageSize(): PageSize {
  try {
    const value = Number(localStorage.getItem(PAGE_SIZE_KEY))
    return PAGE_SIZES.find((s) => s === value) ?? DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

export function choosePageSize(size: PageSize): void {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size))
  } catch {
    // Storage unavailable: the choice lasts until the page is reloaded.
  }
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

export function usePageSize(): PageSize {
  return useSyncExternalStore(subscribe, storedPageSize, () => DEFAULT_PAGE_SIZE)
}
