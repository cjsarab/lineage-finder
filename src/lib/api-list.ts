// The API list's data: one row per API, the filters, the counts beside each option, and
// the pages (20, 50 or 100 to a page: src/lib/page-size.ts). Plain functions, so they're quick to test and quick to run over all 3,645 APIs.
import { matchesWords, prepareName, queryWords } from "@/lib/search"
import type { Api, FamilySummary } from "@/lib/server"

export const NOT_STATED = "Not stated"

export type ReleaseStatus = "released" | "beta" | "not-stated"

export const STATUS_OPTIONS = [
  { value: "released", label: "Released" },
  { value: "beta", label: "Beta" },
  { value: "not-stated", label: NOT_STATED },
  { value: "deprecated", label: "Deprecated" },
] as const

/** Lineage on the newest version's fields (only `unsupported` counts as none). */
export type LineageCoverage = "full" | "partial" | "none"

export const LINEAGE_OPTIONS = [
  { value: "full", label: "Full" },
  { value: "partial", label: "Partial" },
  { value: "none", label: "None published" },
] as const

export function lineageCoverage(c: { fields: number; withLineage: number } | null | undefined): LineageCoverage {
  if (!c || c.withLineage === 0) return "none"
  return c.withLineage === c.fields ? "full" : "partial"
}

export interface ListApi {
  id: string
  family: string
  name: string
  /** The newest version's number, e.g. "2.1.0". */
  version: string | null
  versions: number
  /** From the newest version. */
  status: ReleaseStatus
  deprecated: boolean
  domain: string
  lineage: LineageCoverage
  /** The name made ready for the name box, which matches as search does (src/lib/search.ts). */
  key: string
}

export interface Filters {
  families: string[]
  domains: string[]
  statuses: string[]
  lineage: string[]
  name: string
  page: number
}

export const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * One row per API, in the order the list shows them: families in the Settings order (Banner first, "Other
 * products" last), then A–Z by name within each family.
 */
export function toListApis(apis: readonly Api[], families: readonly FamilySummary[]): ListApi[] {
  const order = new Map(families.map((f, i) => [f.name, i]))
  const domainOf = tidyDomains(apis.map((a) => a.versions.at(-1)?.details?.sourceDomain ?? null))
  return apis
    .map((a): ListApi => {
      const newest = a.versions.at(-1)
      const d = newest?.details ?? null
      return {
        id: a.id,
        family: a.family,
        name: a.name,
        version: newest?.version ?? null,
        versions: a.versions.length,
        status: d?.beta ? "beta" : d?.releaseStatus ? "released" : "not-stated",
        deprecated: d?.deprecatedOn != null || d?.sunsetOn != null,
        domain: domainOf(d?.sourceDomain ?? null),
        lineage: lineageCoverage(newest?.lineage),
        key: prepareName(a.name),
      }
    })
    .sort(
      (x, y) =>
        (order.get(x.family) ?? order.size) - (order.get(y.family) ?? order.size) ||
        (x.family < y.family ? -1 : x.family > y.family ? 1 : 0) ||
        x.name.toLowerCase().localeCompare(y.name.toLowerCase()),
    )
}

/**
 * The catalog spells a few domains differently ("student" beside "Student") and puts form codes in a couple.
 * Spellings that differ only in capitals share the commonest one; values with no small letters (codes) and
 * missing ones are "Not stated".
 */
export function tidyDomains(raw: readonly (string | null)[]): (value: string | null) => string {
  const tally = new Map<string, Map<string, number>>()
  for (const v of raw) {
    const t = v?.trim()
    if (!t || !/[a-z]/.test(t)) continue
    const spellings = tally.get(t.toLowerCase()) ?? new Map<string, number>()
    spellings.set(t, (spellings.get(t) ?? 0) + 1)
    tally.set(t.toLowerCase(), spellings)
  }
  const best = new Map([...tally].map(([key, spellings]) => [key, [...spellings].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]]))
  return (value) => {
    const t = value?.trim()
    return (t && best.get(t.toLowerCase())) || NOT_STATED
  }
}

type Dimension = "family" | "domain" | "status" | "lineage" | "name"

function matches(a: ListApi, f: Filters, dim: Dimension): boolean {
  switch (dim) {
    case "family":
      return f.families.length === 0 || f.families.includes(a.family)
    case "domain":
      return f.domains.length === 0 || f.domains.includes(a.domain)
    case "status":
      return f.statuses.length === 0 || f.statuses.includes(a.status) || (a.deprecated && f.statuses.includes("deprecated"))
    case "lineage":
      return f.lineage.length === 0 || f.lineage.includes(a.lineage)
    case "name": {
      return matchesWords(queryWords(f.name), a.key)
    }
  }
}

const DIMENSIONS: Dimension[] = ["family", "domain", "status", "lineage", "name"]

/** The APIs matching every filter but `except`: ticking two options in one filter means either; across filters, both. */
export function applyFilters(apis: readonly ListApi[], f: Filters, except?: Dimension): ListApi[] {
  const dims = DIMENSIONS.filter((d) => d !== except)
  return apis.filter((a) => dims.every((d) => matches(a, f, d)))
}

/**
 * How many APIs ticking each option would give, with the other filters as they are: the count beside each
 * option in the filters.
 */
export function optionCounts(apis: readonly ListApi[], f: Filters) {
  const tally = (dim: Dimension, values: (a: ListApi) => string[]) => {
    const m = new Map<string, number>()
    for (const a of applyFilters(apis, f, dim)) for (const v of values(a)) m.set(v, (m.get(v) ?? 0) + 1)
    return m
  }
  return {
    family: tally("family", (a) => [a.family]),
    domain: tally("domain", (a) => [a.domain]),
    status: tally("status", (a) => (a.deprecated ? [a.status, "deprecated"] : [a.status])),
    lineage: tally("lineage", (a) => [a.lineage]),
  }
}

/** The domains present, A–Z, with "Not stated" last. */
export function domainsOf(apis: readonly ListApi[]): string[] {
  const all = [...new Set(apis.map((a) => a.domain))]
  return all.filter((d) => d !== NOT_STATED).sort().concat(all.includes(NOT_STATED) ? [NOT_STATED] : [])
}

export type Row =
  | { kind: "heading"; family: string; count: number; continued: boolean }
  | { kind: "api"; api: ListApi }

/** One page of the list, with a heading wherever a family starts, and a "continued" one at the top of a page. */
export function pageRows(apis: readonly ListApi[], page: number, size: number): Row[] {
  const perFamily = new Map<string, number>()
  for (const a of apis) perFamily.set(a.family, (perFamily.get(a.family) ?? 0) + 1)
  const start = (page - 1) * size
  const rows: Row[] = []
  apis.slice(start, start + size).forEach((a, i) => {
    const previous = apis[start + i - 1]
    if (i === 0 || previous?.family !== a.family) {
      rows.push({ kind: "heading", family: a.family, count: perFamily.get(a.family)!, continued: previous?.family === a.family })
    }
    rows.push({ kind: "api", api: a })
  })
  return rows
}

export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size))

/** The page numbers to offer: the first, the last, and the ones either side of the current page; "gap" between. */
export function pageNumbers(current: number, total: number): (number | "gap")[] {
  const wanted = [...new Set([1, current - 1, current, current + 1, total])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | "gap")[] = []
  for (const p of wanted) {
    const last = out.at(-1)
    if (typeof last === "number" && p - last === 2) out.push(last + 1)
    else if (typeof last === "number" && p - last > 2) out.push("gap")
    out.push(p)
  }
  return out
}

/** The filters, from the page's address (`?family=…&domain=…&status=…&lineage=…&name=…&page=…`). */
export function readFilters(params: URLSearchParams): Filters {
  const page = Number.parseInt(params.get("page") ?? "1", 10)
  return {
    families: params.getAll("family"),
    domains: params.getAll("domain"),
    statuses: params.getAll("status"),
    lineage: params.getAll("lineage"),
    name: params.get("name") ?? "",
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

export function writeFilters(f: Filters): URLSearchParams {
  const params = new URLSearchParams()
  for (const v of f.families) params.append("family", v)
  for (const v of f.domains) params.append("domain", v)
  for (const v of f.statuses) params.append("status", v)
  for (const v of f.lineage) params.append("lineage", v)
  if (f.name) params.set("name", f.name)
  if (f.page > 1) params.set("page", String(f.page))
  return params
}

export const anyFilter = (f: Filters) => f.families.length + f.domains.length + f.statuses.length + f.lineage.length > 0 || f.name.trim() !== ""
