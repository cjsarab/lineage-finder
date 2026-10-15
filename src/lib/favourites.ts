// Favourites and Recently viewed, remembered in this browser like Families shown
// (src/lib/families.ts): nothing goes to the server or the index, so they survive a re-index. Also the checks the
// panel makes against the index: gone, hidden in Settings, a newer version. Covers APIs, tables, columns and forms.
import { useSyncExternalStore } from "react"
import { versionKey } from "@/lib/api-page"
import { formPath } from "@/lib/forms"
import type { Api, FormSummary, TableDetail, TableSummary } from "@/lib/server"
import { columnPath, shownColumn, shownTable, tablePath } from "@/lib/tables"
import { apiPath } from "@/pages/apis/api-list-page"

/** An API is saved by version; `newest` is the newest version when it was saved, so "Newer version" only shows for
 * one that arrives later (an older version may have been saved on purpose). */
export type Favourite =
  | { kind: "api"; family: string; name: string; version: string; newest: string }
  | { kind: "table"; product: string; name: string }
  | { kind: "column"; product: string; table: string; column: string }
  | { kind: "form"; product: string; code: string }

/** One entry per API (the last version looked at), per table (the column, if one was chosen) and per form. */
export type Recent =
  | { kind: "api"; family: string; name: string; version: string }
  | { kind: "table"; product: string; name: string; column: string | null }
  | { kind: "form"; product: string; code: string }

export const FAVOURITES_KEY = "lineage-finder:favourites"
export const RECENT_KEY = "lineage-finder:recent"
const CHANGED = "lineage-finder:favourites-changed"
export const RECENT_MAX = 10

export function favouriteKey(f: Favourite): string {
  switch (f.kind) {
    case "api":
      return `api:${f.family}/${f.name}@${f.version}`
    case "table":
      return `table:${f.product}/${f.name}`
    case "column":
      return `column:${f.product}/${f.table}.${f.column}`
    case "form":
      return `form:${f.product}/${f.code}`
  }
}

export const recentKey = (r: Recent) =>
  r.kind === "api" ? `api:${r.family}/${r.name}` : r.kind === "table" ? `table:${r.product}/${r.name}` : `form:${r.product}/${r.code}`

// ---------------------------------------------------------------- Reading and saving

const isText = (v: unknown): v is string => typeof v === "string" && v !== ""

function readFavourite(v: unknown): Favourite | null {
  if (typeof v !== "object" || v === null) return null
  const o = v as Record<string, unknown>
  if (o.kind === "api" && isText(o.family) && isText(o.name) && isText(o.version))
    return { kind: "api", family: o.family, name: o.name, version: o.version, newest: isText(o.newest) ? o.newest : o.version }
  if (o.kind === "table" && isText(o.product) && isText(o.name)) return { kind: "table", product: o.product, name: o.name }
  if (o.kind === "column" && isText(o.product) && isText(o.table) && isText(o.column))
    return { kind: "column", product: o.product, table: o.table, column: o.column }
  if (o.kind === "form" && isText(o.product) && isText(o.code)) return { kind: "form", product: o.product, code: o.code }
  return null
}

function readRecent(v: unknown): Recent | null {
  if (typeof v !== "object" || v === null) return null
  const o = v as Record<string, unknown>
  if (o.kind === "api" && isText(o.family) && isText(o.name) && isText(o.version))
    return { kind: "api", family: o.family, name: o.name, version: o.version }
  if (o.kind === "table" && isText(o.product) && isText(o.name))
    return { kind: "table", product: o.product, name: o.name, column: isText(o.column) ? o.column : null }
  if (o.kind === "form" && isText(o.product) && isText(o.code)) return { kind: "form", product: o.product, code: o.code }
  return null
}

/** A stored list, read once per change. Anything unreadable is left out rather than breaking the panel. */
function storedList<T>(key: string, read: (v: unknown) => T | null) {
  let cache: { raw: string | null; items: readonly T[] } = { raw: null, items: [] }
  return (): readonly T[] => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(key)
    } catch {
      // Storage unavailable: nothing saved.
    }
    if (raw !== cache.raw) {
      let items: T[] = []
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) items = parsed.map(read).filter((x): x is T => x !== null)
      } catch {
        // Not readable: treat as empty.
      }
      cache = { raw, items }
    }
    return cache.items
  }
}

export const favourites = storedList(FAVOURITES_KEY, readFavourite)
export const recent = storedList(RECENT_KEY, readRecent)

function save(key: string, items: readonly unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Storage unavailable (e.g. a private window): the change can't be kept.
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** Saves or removes a favourite. Saving one already saved changes nothing. */
export function setFavourite(f: Favourite, on: boolean) {
  const key = favouriteKey(f)
  const others = favourites().filter((x) => favouriteKey(x) !== key)
  save(FAVOURITES_KEY, on ? [...others, f] : others)
}

/** The list with `r` at the top, replacing the same API or table, at most RECENT_MAX long. */
export function addRecent(list: readonly Recent[], r: Recent): Recent[] {
  const key = recentKey(r)
  return [r, ...list.filter((x) => recentKey(x) !== key)].slice(0, RECENT_MAX)
}

export function recordRecent(r: Recent) {
  const list = recent()
  const top = list[0]
  // Already at the top, unchanged: don't write (pages record on every visit).
  if (top && JSON.stringify(top) === JSON.stringify(r)) return
  save(RECENT_KEY, addRecent(list, r))
}

export const clearRecent = () => save(RECENT_KEY, [])

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

export const useFavourites = () => useSyncExternalStore(subscribe, favourites, () => [])
export const useRecent = () => useSyncExternalStore(subscribe, recent, () => [])

/** Whether `f` is saved, kept up to date. */
export function useIsFavourite(f: Favourite): boolean {
  const key = favouriteKey(f)
  return useFavourites().some((x) => favouriteKey(x) === key)
}

// ---------------------------------------------------------------- Order and checks against the index

const KIND_ORDER = { api: 0, table: 1, column: 2, form: 3 }

/** A–Z within each kind: APIs by name (then family, then version), tables by name, columns by table then column, forms by code. */
export function sortFavourites(list: readonly Favourite[]): Favourite[] {
  const label = (f: Favourite) =>
    f.kind === "api"
      ? `${f.name} ${f.family} ${f.version}`
      : f.kind === "table"
        ? `${f.name} ${f.product}`
        : f.kind === "column"
          ? `${f.table}.${f.column} ${f.product}`
          : `${f.code} ${f.product}`
  return [...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || label(a).localeCompare(label(b)))
}

export const apiVersionPath = (a: { family: string; name: string }, version: string, newest: string) =>
  version === newest ? apiPath(a) : `${apiPath(a)}?version=${encodeURIComponent(version)}`

export type ApiState =
  | { kind: "ok"; path: string; newer: { version: string; path: string } | null }
  | { kind: "versionGone"; newestPath: string }
  | { kind: "hidden" }
  | { kind: "gone" }

export function apiState(f: Extract<Favourite, { kind: "api" }>, apis: readonly Api[], hidden: readonly string[]): ApiState {
  const api = apis.find((a) => a.family === f.family && a.name === f.name)
  if (!api) return { kind: "gone" }
  if (hidden.includes(api.family)) return { kind: "hidden" }
  const newest = versionKey(api.versions[api.versions.length - 1])
  if (!api.versions.some((v) => versionKey(v) === f.version)) return { kind: "versionGone", newestPath: apiPath(api) }
  const newer = newest !== f.version && newest !== f.newest ? { version: newest, path: apiPath(api) } : null
  return { kind: "ok", path: apiVersionPath(api, f.version, newest), newer }
}

export type PlaceState = { kind: "ok"; path: string } | { kind: "hidden" } | { kind: "gone" }

const familyOf = (id: string) => id.slice(0, id.indexOf("/"))

export function tableState(f: Extract<Favourite, { kind: "table" }>, tables: readonly TableSummary[], hidden: readonly string[]): PlaceState {
  const t = tables.find((x) => x.product === f.product && x.name === f.name)
  if (!t) return { kind: "gone" }
  if (t.apis.every((id) => hidden.includes(familyOf(id)))) return { kind: "hidden" }
  return { kind: "ok", path: tablePath(f.product, f.name) }
}

export function formState(f: Extract<Favourite, { kind: "form" }>, forms: readonly FormSummary[], hidden: readonly string[]): PlaceState {
  const form = forms.find((x) => x.product === f.product && x.code === f.code)
  if (!form) return { kind: "gone" }
  if (form.apis.every((id) => hidden.includes(familyOf(id)))) return { kind: "hidden" }
  return { kind: "ok", path: formPath(f.product, f.code) }
}

/** A column, from its table's page (`null`: the index has no such table). */
export function columnState(f: Extract<Favourite, { kind: "column" }>, table: TableDetail | null, hidden: readonly string[]): PlaceState {
  if (!table || !table.columns.some((c) => c.name === f.column)) return { kind: "gone" }
  if (!shownColumn(shownTable(table, hidden), f.column)) return { kind: "hidden" }
  return { kind: "ok", path: columnPath(f.product, f.table, f.column) }
}

/** Recently viewed as shown: anything gone or hidden left out, each with where it goes. */
export function shownRecent(
  list: readonly Recent[],
  apis: readonly Api[],
  tables: readonly TableSummary[],
  hidden: readonly string[],
  forms: readonly FormSummary[] = [],
): { item: Recent; path: string }[] {
  const out: { item: Recent; path: string }[] = []
  for (const r of list) {
    if (r.kind === "api") {
      const s = apiState({ ...r, newest: r.version }, apis, hidden)
      if (s.kind === "ok") out.push({ item: r, path: s.path })
    } else if (r.kind === "table") {
      const s = tableState(r, tables, hidden)
      if (s.kind === "ok") out.push({ item: r, path: r.column ? columnPath(r.product, r.name, r.column) : s.path })
    } else {
      const s = formState(r, forms, hidden)
      if (s.kind === "ok") out.push({ item: r, path: s.path })
    }
  }
  return out
}
