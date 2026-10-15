// "Families shown": which families are hidden, remembered in this browser. Stores the
// hidden ones, not the shown ones, so a family new to the catalog shows up rather than being silently hidden.
import { useSyncExternalStore } from "react"

export const HIDDEN_KEY = "lineage-finder:hidden-families"
const CHANGED = "lineage-finder:hidden-families-changed"

let cache: { raw: string | null; names: readonly string[] } = { raw: null, names: [] }

/** The hidden families' names. The same array is returned until the choice changes (React needs that). */
export function hiddenFamilies(): readonly string[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(HIDDEN_KEY)
  } catch {
    // Storage unavailable: nothing hidden.
  }
  if (raw !== cache.raw) {
    let names: string[] = []
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === "string")
    } catch {
      // Not readable: treat as nothing hidden.
    }
    cache = { raw, names }
  }
  return cache.names
}

export function setHiddenFamilies(names: Iterable<string>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(names)].sort()))
  } catch {
    // Storage unavailable: the choice can't be kept.
  }
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

export function useHiddenFamilies(): readonly string[] {
  return useSyncExternalStore(subscribe, hiddenFamilies, () => [])
}

/** The families by product group, in the order the server sent them (Banner first, "Other products" last). */
export function groupFamilies<F extends { group: string }>(families: readonly F[]): { group: string; families: F[] }[] {
  const groups: { group: string; families: F[] }[] = []
  for (const f of families) {
    const last = groups.at(-1)
    if (last?.group === f.group) last.families.push(f)
    else groups.push({ group: f.group, families: [f] })
  }
  return groups
}
