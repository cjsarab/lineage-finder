// Updating the catalog: starting a re-index from anywhere, remembering "Not now" on the
// "has changed" notice, loading what changed since the read before, and the words the summary uses for it.
import { useEffect, useState, useSyncExternalStore } from "react"
import { count } from "@/lib/first-run-text"
import { getChanges, startReading, type ChangeCounts, type Changes, type Status } from "@/lib/server"
import { useStatus } from "@/lib/use-status"

// ---------- Re-index now ----------

/**
 * Starts re-reading the remembered folder, as Settings' Re-index now and the landing page's notice both do. The answer
 * is a problem to show, or null once it has started.
 */
export async function reindexNow(status: Status): Promise<string | null> {
  try {
    await startReading(status.catalog.chosen ?? status.catalog.default)
    return null
  } catch {
    return "Couldn't start: the folder doesn't look like a catalog any more. Use Change folder in Settings to choose it again."
  }
}

// ---------- "Not now" ----------

// The catalog's fingerprint when "Not now" was pressed: the notice stays away until the catalog changes again.
export const DISMISSED_KEY = "lineage-finder:catalog-change-dismissed"
const DISMISSED_CHANGED = "lineage-finder:catalog-change-dismissed-changed"

function storedDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

export function dismissCatalogChange(fingerprint: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, fingerprint)
  } catch {
    // Storage unavailable: the notice stays away until the page is reloaded.
    memory = fingerprint
  }
  window.dispatchEvent(new Event(DISMISSED_CHANGED))
}
let memory: string | null = null

function subscribe(onChange: () => void) {
  window.addEventListener(DISMISSED_CHANGED, onChange)
  return () => window.removeEventListener(DISMISSED_CHANGED, onChange)
}

/** True when the landing page should say the catalog has changed: it has, and "Not now" wasn't pressed for this change. */
export function useCatalogChangeNotice(): { show: boolean; fingerprint: string | null } {
  const { status } = useStatus()
  const dismissed = useSyncExternalStore(subscribe, () => storedDismissed() ?? memory, () => null)
  const check = status?.catalogCheck
  if (check?.state !== "changed") return { show: false, fingerprint: null }
  return { show: dismissed !== check.fingerprint, fingerprint: check.fingerprint }
}

// ---------- What changed ----------

/** What changed since the read before the current index (null: nothing to compare); loaded again after a re-index. */
export function useChanges(): { changes: Changes | null; loaded: boolean } {
  const { status } = useStatus()
  const builtAt = status?.index.state === "ready" ? status.index.summary.builtAt : null
  const [loaded, setLoaded] = useState<{ builtAt: string | null; changes: Changes | null }>({ builtAt: null, changes: null })
  useEffect(() => {
    if (builtAt === null) return
    let cancelled = false
    getChanges()
      .then((changes) => !cancelled && setLoaded({ builtAt, changes }))
      .catch(() => !cancelled && setLoaded({ builtAt, changes: null }))
    return () => {
      cancelled = true
    }
  }, [builtAt])
  return loaded.builtAt === builtAt && builtAt !== null ? { changes: loaded.changes, loaded: true } : { changes: null, loaded: false }
}

/** "12 Oct 2026, 10:49", as Settings and the landing page give dates. */
export const readAt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

type Compared = Extract<Changes, { outcome: "compared" }>

/** The changes outside the hidden families, and how many changes are in them. */
export function visibleChanges(c: Compared, hidden: readonly string[]): { shown: Compared; inHidden: number } {
  const out = <T,>(items: T[], family: (x: T) => string) => items.filter((x) => !hidden.includes(family(x)))
  const shown: Compared = {
    ...c,
    families: { added: out(c.families.added, (f) => f.name), removed: out(c.families.removed, (f) => f.name) },
    apis: { added: out(c.apis.added, (a) => a.family), removed: out(c.apis.removed, (a) => a.family) },
    versions: { added: out(c.versions.added, (v) => v.family), removed: out(c.versions.removed, (v) => v.family) },
    changed: out(c.changed, (v) => v.family),
  }
  return { shown, inHidden: total(c) - total(shown) }
}

const total = (c: Compared) =>
  c.families.added.length + c.families.removed.length + c.apis.added.length + c.apis.removed.length +
  c.versions.added.length + c.versions.removed.length + c.changed.length

/** The headline: "1 family added, 1 gone · 1 API added · 2 new versions, 1 gone · 3 versions changed", or null if none. */
export function headline(c: Compared): string | null {
  const pair = (added: number, gone: number, one: string, many: string, addedWord: string) =>
    added && gone ? `${count(added, one, many)} ${addedWord}, ${gone} gone` : added ? `${count(added, one, many)} ${addedWord}` : gone ? `${count(gone, one, many)} gone` : null
  const parts = [
    pair(c.families.added.length, c.families.removed.length, "family", "families", "added"),
    pair(c.apis.added.length, c.apis.removed.length, "API", "APIs", "added"),
    c.versions.added.length && c.versions.removed.length
      ? `${count(c.versions.added.length, "new version", "new versions")}, ${c.versions.removed.length} gone`
      : c.versions.added.length
        ? count(c.versions.added.length, "new version", "new versions")
        : c.versions.removed.length
          ? `${count(c.versions.removed.length, "version", "versions")} gone`
          : null,
    c.changed.length ? `${count(c.changed.length, "version", "versions")} changed` : null,
  ].filter((p) => p !== null)
  return parts.length ? parts.join(" · ") : null
}

/** A changed version's line: "74 fields (12 with lineage changed), 12 query parameters, headers, status or methods". */
export function countsText(c: ChangeCounts): string {
  return [
    c.fields ? count(c.fields, "field", "fields") : null,
    c.parameters ? count(c.parameters, "query parameter", "query parameters") : null,
    c.lineage ? `lineage changed on ${c.lineage}` : null,
    c.headers ? "headers" : null,
    c.details ? count(c.details, "detail", "details") : null,
  ]
    .filter((p) => p !== null)
    .join(", ")
}
