// The comparing rules: two versions' details, query parameters, headers and fields, each change marked. Older → newer
// only. Here rather than in the page's code, so the indexer can also compare a new read of the catalog with the last
// one. Shared with the page: no Node-only imports in this file.
import type { MethodParameters, Parameter } from "./extract.ts"
import type { Field, Value } from "./lineage.ts"
import type { ApiVersion } from "./run-index.ts"

export type Mark = "added" | "removed" | "moved" | "changed" | null

/** How a version is named in the address and on its button: its number (every version in the catalog has one). */
export const versionKey = (v: ApiVersion) => v.version ?? v.folder

export function releaseText(status: string | null, beta: boolean): string {
  if (beta) return "Beta"
  if (status?.toLowerCase() === "ga") return "Released"
  return status ?? "Not stated"
}

const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"]
export const methodRank = (m: string) => (METHOD_ORDER.includes(m) ? METHOD_ORDER.indexOf(m) : METHOD_ORDER.length)

/** By path, then GET, POST, PUT, PATCH, DELETE (then anything else). */
export function sortMethods<T extends { path: string; method: string }>(methods: readonly T[]): T[] {
  return [...methods].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : methodRank(a.method) - methodRank(b.method)))
}

// ---------- Details ----------

export interface DetailChange {
  label: string
  was: string
  now: string
}

/** What changed in the Details box's terms, in its order, plus the methods added and removed ("GET /api/…"). */
export function compareDetails(a: ApiVersion, b: ApiVersion): { changes: DetailChange[]; methodsAdded: string[]; methodsRemoved: string[] } {
  const changes: DetailChange[] = []
  const add = (label: string, was: string | null | undefined, now: string | null | undefined) => {
    if ((was ?? "") !== (now ?? "")) changes.push({ label, was: was || "none", now: now || "none" })
  }
  add(a.baseTables.length > 1 || b.baseTables.length > 1 ? "Base tables" : "Base table", a.baseTables.join(", "), b.baseTables.join(", "))
  const da = a.details, db = b.details
  if (da && db) {
    add("Status", releaseText(da.releaseStatus, da.beta), releaseText(db.releaseStatus, db.beta))
    add("Deprecated on", da.deprecatedOn, db.deprecatedOn)
    add("Sunset on", da.sunsetOn, db.sunsetOn)
  }
  const methods = (v: ApiVersion) => sortMethods(v.details?.methods ?? []).map((m) => `${m.method} ${m.path}`)
  const ma = methods(a), mb = methods(b)
  return { changes, methodsAdded: mb.filter((m) => !ma.includes(m)), methodsRemoved: ma.filter((m) => !mb.includes(m)) }
}

// ---------- Lineage ----------

// Runs of spaces and tabs don't count: a page shows them as one, so the change would look like none. Line breaks,
// capitals and quotes do, as the API page shows them.
const tidy = (text: string) => text.replace(/[ \t]+/g, " ").trim()
const lineageKey = (values: readonly Value[] | undefined) =>
  (values ?? [])
    .map((v) => `${v.kind}\u0000${tidy(v.text)}`)
    .sort()
    .join("\u0001")

function lineageNote(was: readonly Value[] | undefined, now: readonly Value[] | undefined): string | null {
  if (lineageKey(was) === lineageKey(now)) return null
  if (!was?.length) return "lineage added"
  if (!now?.length) return "lineage removed"
  return "lineage changed"
}

// ---------- Query parameters and headers ----------

// A method is its verb and address, version numbers in the address ignored (they change in 59 of 437 pairs).
const methodKey = (m: { method: string; path: string }) => `${m.method} ${m.path.replace(/\d+(\.\d+)*/g, "#")}`

export interface ParameterRow {
  name: string
  in: string
  mark: Mark
  was?: Parameter
  now?: Parameter
  /** "now required", "no longer required", "lineage added/removed/changed". */
  notes: string[]
}

export interface ParameterGroup {
  method: string
  path: string
  /** The address in the older version, when only its version number differs. */
  pathWas: string | null
  rows: ParameterRow[]
}

/** The query and path parameters (headers apart), per method in the API page's order: the newer's, then removed ones. */
export function compareParameters(a: readonly MethodParameters[], b: readonly MethodParameters[]): ParameterGroup[] {
  const groups = new Map<string, ParameterGroup>()
  const group = (m: MethodParameters) => groups.get(methodKey(m)) ?? groups.set(methodKey(m), { method: m.method, path: m.path, pathWas: null, rows: [] }).get(methodKey(m))!
  const key = (m: MethodParameters, p: Parameter) => `${methodKey(m)}|${p.in}|${p.name}`
  const before = new Map(a.flatMap((m) => m.parameters.filter((p) => p.in !== "header").map((p) => [key(m, p), p] as const)))
  const seen = new Set<string>()
  for (const m of b) {
    const g = group(m)
    const old = a.find((x) => methodKey(x) === methodKey(m))
    if (old && old.path !== m.path) g.pathWas = old.path
    for (const p of m.parameters) {
      if (p.in === "header" || seen.has(key(m, p))) continue
      seen.add(key(m, p))
      const was = before.get(key(m, p))
      if (!was) {
        g.rows.push({ name: p.name, in: p.in, mark: "added", now: p, notes: [] })
        continue
      }
      const notes = [was.required !== p.required ? (p.required ? "now required" : "no longer required") : null, lineageNote(was.values, p.values)].filter((x) => x !== null)
      g.rows.push({ name: p.name, in: p.in, mark: notes.length ? "changed" : null, was, now: p, notes })
    }
  }
  for (const m of a) {
    for (const p of m.parameters) {
      if (p.in === "header" || seen.has(key(m, p))) continue
      seen.add(key(m, p))
      group(m).rows.push({ name: p.name, in: p.in, mark: "removed", was: p, notes: [] })
    }
  }
  return sortMethods([...groups.values()].filter((g) => g.rows.length > 0))
}

// Header names ignore capitals, spaces, hyphens and underscores (`accept` = `Accept`, `content type` = `Content-Type`):
// they're effectively the same, and listing them would only be noise.
const headerKey = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, "")

/**
 * The headers' changes in one line, as the API page shows headers (they're rarely important):
 * "X-Request-Id added (POST, PUT) · X-Old removed (GET)", or null. Headers written differently aren't changes; they're
 * listed for the page to mention.
 */
export function compareHeaders(a: readonly MethodParameters[], b: readonly MethodParameters[]): { line: string | null; writtenDifferently: { name: string; was: string }[] } {
  const headers = (ms: readonly MethodParameters[]) =>
    new Map(sortMethods(ms).flatMap((m) => m.parameters.filter((p) => p.in === "header").map((p) => [`${methodKey(m)}|${headerKey(p.name)}`, { method: m.method, name: p.name }] as const)))
  const ha = headers(a), hb = headers(b)
  const changes = new Map<string, string[]>() // "<name> added" → its methods
  const note = (h: { method: string; name: string }, what: string) => {
    const k = `${h.name} ${what}`
    const methods = changes.get(k) ?? changes.set(k, []).get(k)!
    if (!methods.includes(h.method)) methods.push(h.method)
  }
  const written = new Map<string, { name: string; was: string }>()
  for (const [k, h] of hb) {
    const was = ha.get(k)
    if (!was) note(h, "added")
    else if (was.name !== h.name) written.set(`${h.name}\u0000${was.name}`, { name: h.name, was: was.name })
  }
  for (const [k, h] of ha) if (!hb.has(k)) note(h, "removed")
  const line = [...changes].map(([what, methods]) => `${what} (${methods.join(", ")})`).join(" · ")
  return { line: line || null, writtenDifferently: [...written.values()] }
}

// ---------- Fields ----------

export interface FieldRow {
  /** Parents' names, then its own: "owner.title". */
  path: string
  name: string
  depth: number
  mark: Mark
  was?: Field
  now?: Field
  /** "lineage added/removed/changed", "now a list", "no longer a list". */
  notes: string[]
  /** A moved field's parent in the older version ("" for the top level). */
  movedFrom?: string
}

function withPaths(fields: readonly Field[]): Map<string, Field> {
  const out = new Map<string, Field>()
  const stack: string[] = []
  for (const field of fields) {
    stack.length = field.depth
    stack.push(field.name)
    const path = stack.join(".")
    if (!out.has(path)) out.set(path, field)
  }
  return out
}

const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf(".")))

/**
 * Every field of either version, in the newer's order with removed ones back where they were, each marked. A field is
 * known by its path; it **moved** when its name is once among the removed and once among the added.
 */
export function compareFields(a: readonly Field[], b: readonly Field[]): FieldRow[] {
  const before = withPaths(a), after = withPaths(b)
  const added = [...after.keys()].filter((p) => !before.has(p))
  const removed = [...before.keys()].filter((p) => !after.has(p))
  const tally = (names: string[]) => names.reduce((m, name) => m.set(name, (m.get(name) ?? 0) + 1), new Map<string, number>())
  const ta = tally(added.map((p) => after.get(p)!.name)), tr = tally(removed.map((p) => before.get(p)!.name))
  const movedFrom = new Map<string, string>() // new path → old path
  for (const old of removed) {
    const name = before.get(old)!.name
    if (tr.get(name) === 1 && ta.get(name) === 1) movedFrom.set(added.find((p) => after.get(p)!.name === name)!, old)
  }
  const movedAway = new Set(movedFrom.values())

  const notesFor = (was: Field, now: Field) =>
    [lineageNote(was.values, now.values), !!was.list === !!now.list ? null : now.list ? "now a list" : "no longer a list"].filter((x) => x !== null)
  const rows: FieldRow[] = [...after].map(([path, now]) => {
    const oldPath = before.has(path) ? path : movedFrom.get(path)
    if (oldPath === undefined) return { path, name: now.name, depth: now.depth, mark: "added", now, notes: [] }
    const was = before.get(oldPath)!
    const notes = notesFor(was, now)
    if (oldPath !== path) return { path, name: now.name, depth: now.depth, mark: "moved", was, now, notes, movedFrom: parentOf(oldPath) }
    return { path, name: now.name, depth: now.depth, mark: notes.length ? "changed" : null, was, now, notes }
  })

  // A removed field goes after the nearest earlier field of the older version still listed (and that field's own
  // fields), or at the end when there's none.
  let last = -1
  for (const [path, was] of before) {
    const at = rows.findIndex((r) => r.path === path)
    if (at >= 0) {
      last = at
      continue
    }
    if (movedAway.has(path)) continue
    let i = last < 0 ? rows.length : last + 1
    while (last >= 0 && i < rows.length && rows[i].path.startsWith(`${rows[last].path}.`)) i++
    rows.splice(i, 0, { path, name: was.name, depth: was.depth, mark: "removed", was, notes: [] })
    last = i
  }
  return rows
}
