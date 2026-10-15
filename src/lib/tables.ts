// The tables list and table page: what's shown once "Families shown" (Settings) has taken
// out hidden families, and the list's filters (product, Banner module, name), kept in the page's address. The forms
// list uses the same filters and modules, through `Listed`. Also the table page's Show choice.
import { matchesQuery, matchesWords, prepareName, queryWords } from "@/lib/search"
import type { TableApi, TableDetail, TableField, TableSummary } from "@/lib/server"

/**
 * The Banner modules with their own option in the filter, by a table name's first letter: those with 40 or more
 * tables. Every other letter goes under "Other". The names are from Banner's naming conventions, as published for
 * example in Kent State University's "Banner form naming conventions" page. Edit freely.
 */
export const BANNER_MODULES: Record<string, string> = {
  F: "Finance",
  G: "General",
  N: "Position Control",
  P: "Human Resources/Payroll",
  R: "Financial Aid",
  S: "Student",
  T: "Accounts Receivable",
}

/** The option for every letter not in BANNER_MODULES. */
export const OTHER_MODULE = "Other"

/** "Student (S)", or "Other". The letter is always shown, in case a name is wrong. */
export const moduleLabel = (module: string) => (BANNER_MODULES[module] ? `${BANNER_MODULES[module]} (${module})` : OTHER_MODULE)

/** A Banner table's module: its first letter if that has its own option, else "Other". */
const moduleOfName = (name: string) => (BANNER_MODULES[name[0]] ? name[0] : OTHER_MODULE)

/** A table's module (Banner only), or null. */
export const moduleOf = (product: string, name: string) => (product === "Banner" ? moduleOfName(name) : null)

export const tablePath = (product: string, name: string) => `/tables/${encodeURIComponent(product)}/${encodeURIComponent(name)}`

/** A column's own address: its table's page, narrowed to it. */
export const columnPath = (product: string, table: string, column: string) => `${tablePath(product, table)}/${encodeURIComponent(column)}`

/** "BannerWidgetAPIs/widgets" → family and name. */
export function splitApiId(id: string): { family: string; name: string } {
  const slash = id.indexOf("/")
  return { family: id.slice(0, slash), name: id.slice(slash + 1) }
}

const familyOf = (id: string) => id.slice(0, id.indexOf("/"))

/** What the list filters need of a table or a form. */
export interface Listed {
  product: string
  name: string
  /** What the name box looks at, made ready to match as search does (src/lib/search.ts). */
  key: string
  /** Banner only: the first letter, or "Other". */
  module: string | null
}

export interface ListTable extends Listed {
  apis: number
  columns: number
  probable: boolean
  /** No lineage names it; only lookups do. */
  lookupsOnly: boolean
}

/** The list as shown: hidden families' APIs left out of the counts, and tables only they use left out altogether. */
export function toListTables(tables: readonly TableSummary[], hidden: readonly string[]): ListTable[] {
  const out: ListTable[] = []
  for (const t of tables) {
    const shown = t.apis.map((id) => !hidden.includes(familyOf(id)))
    const apis = shown.filter(Boolean).length
    if (apis === 0) continue
    out.push({
      product: t.product,
      name: t.name,
      key: prepareName(t.name),
      module: moduleOf(t.product, t.name),
      apis,
      columns: t.cols.filter((c) => c.some((i) => shown[i])).length,
      probable: t.probable === true,
      lookupsOnly: t.lookupsOnly === true,
    })
  }
  return out
}

/** The products present, biggest first (Banner, then Colleague and CRM in a full catalog), with their counts. */
export function productsOf(tables: readonly Listed[]): { product: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const t of tables) counts.set(t.product, (counts.get(t.product) ?? 0) + 1)
  return [...counts].map(([product, count]) => ({ product, count })).sort((a, b) => b.count - a.count || (a.product < b.product ? -1 : 1))
}

export interface TableFilters {
  /** Null: the first product (Banner in a full catalog). */
  product: string | null
  modules: string[]
  name: string
  page: number
}

export function readTableFilters(params: URLSearchParams): TableFilters {
  const page = Number.parseInt(params.get("page") ?? "1", 10)
  return {
    product: params.get("product"),
    modules: params.getAll("module"),
    name: params.get("name") ?? "",
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

export function writeTableFilters(f: TableFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (f.product) params.set("product", f.product)
  for (const m of f.modules) params.append("module", m)
  if (f.name) params.set("name", f.name)
  if (f.page > 1) params.set("page", String(f.page))
  return params
}

const nameMatches = (t: Listed, name: string) => matchesWords(queryWords(name), t.key)

/** The tables (or forms) of one product matching the filters, A–Z (they arrive in that order). */
export function applyTableFilters<T extends Listed>(tables: readonly T[], product: string, f: TableFilters): T[] {
  return tables.filter((t) => t.product === product && (f.modules.length === 0 || f.modules.includes(t.module ?? "")) && nameMatches(t, f.name))
}

/** How many tables each product and each module would give with the name filter as it is. */
export function tableCounts(tables: readonly Listed[], product: string, f: TableFilters) {
  const products = new Map<string, number>()
  const modules = new Map<string, number>()
  for (const t of tables) {
    if (!nameMatches(t, f.name)) continue
    products.set(t.product, (products.get(t.product) ?? 0) + 1)
    if (t.product === product && t.module) modules.set(t.module, (modules.get(t.module) ?? 0) + 1)
  }
  return { products, modules }
}

/** The modules present among a product's tables: largest first, then "Other". */
export function modulesOf(tables: readonly Listed[], product: string): string[] {
  const counts = new Map<string, number>()
  for (const t of tables) if (t.product === product && t.module) counts.set(t.module, (counts.get(t.module) ?? 0) + 1)
  const named = [...counts.keys()].filter((m) => m !== OTHER_MODULE).sort((a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : 1))
  return counts.has(OTHER_MODULE) ? [...named, OTHER_MODULE] : named
}

export interface ShownTable {
  columns: { name: string; apis: number; probable: boolean }[]
  apis: TableApi[]
}

/** A table's page without hidden families: their APIs gone, and columns only they use gone. */
export function shownTable(detail: TableDetail, hidden: readonly string[]): ShownTable {
  const shown = (id: string) => !hidden.includes(familyOf(id))
  return {
    columns: detail.columns
      .map((c) => ({ name: c.name, apis: c.apis.filter(shown).length, probable: c.probable === true }))
      .filter((c) => c.apis > 0),
    apis: detail.apis.filter((a) => shown(a.id)),
  }
}

export interface ShownColumn {
  /** Each API using the column, with only the fields that use it; `older` when its newest version doesn't. */
  apis: TableApi[]
  fields: number
  /** APIs using the column only in older versions. */
  older: number
  /** Known only from inferred values. */
  probable: boolean
}

/**
 * A table's page narrowed to one column: only the fields naming exactly that column. Null if no API shown
 * uses it.
 */
export function shownColumn(shown: ShownTable, column: string): ShownColumn | null {
  const apis: TableApi[] = []
  for (const api of shown.apis) {
    const fields = api.fields.filter((f) => f.column === column)
    if (fields.length === 0) continue
    const older = fields.every((f) => f.older)
    apis.push({ id: api.id, ...(older ? { older: true as const } : {}), ...(api.base ? { base: true as const } : {}), fields })
  }
  if (apis.length === 0) return null
  return {
    apis,
    fields: apis.reduce((sum, a) => sum + a.fields.length, 0),
    older: apis.filter((a) => a.older).length,
    probable: shown.columns.find((c) => c.name === column)?.probable ?? apis.every((a) => a.fields.every((f) => f.probable)),
  }
}

/**
 * An API on a table's page matches by its name (then all its fields show) or by any of its fields or columns, with
 * the API's name (then only those fields show). Null if it doesn't match. Matched as search matches (src/lib/search.ts).
 */
export function matchingFields(api: TableApi, query: string): TableField[] | null {
  const apiName = splitApiId(api.id).name
  if (matchesQuery(query, apiName)) return api.fields
  // As search does, a field can match on its API's name too: `widget code` finds `code` in `widget-requests`.
  const fields = api.fields.filter((f) => matchesQuery(query, apiName, f.path, f.column ?? ""))
  return fields.length ? fields : null
}

export const apiMatches = (api: TableApi, query: string) => matchingFields(api, query) !== null

/**
 * The table page's Show choice: every API, or those whose lineage names the table (or
 * whose base table it is), whose lookups name it, or whose derived logic does.
 */
export type Show = "all" | "direct" | "lookup" | "derived"

/** The Show choice's options, as the page names them. */
export const SHOW_LABELS: Record<Show, string> = { all: "All", direct: "Direct lineage", lookup: "Looked up", derived: "In derived logic" }

/** The hover note on each option and on the labels beside each API. */
export const SHOW_NOTES: Record<Show, string> = {
  all: "Every API that uses this table in any of the ways below.",
  direct: "The API's data is kept in this table: its fields' lineage names this table or its columns.",
  lookup: "The data is kept in another table and must be one of this table's values.",
  derived: "The catalog's notes on how a value is worked out mention this table.",
}

/** Whether an API uses the table each way. */
export function usesOf(api: TableApi): Record<Exclude<Show, "all">, boolean> {
  return {
    direct: api.base === true || api.fields.some((f) => !f.via),
    lookup: api.fields.some((f) => f.via === "lookup"),
    derived: api.fields.some((f) => f.via === "derived"),
  }
}

/** How many APIs each option shows. */
export function showCounts(apis: readonly TableApi[]): Record<Show, number> {
  const counts = { all: apis.length, direct: 0, lookup: 0, derived: 0 }
  for (const api of apis) {
    const uses = usesOf(api)
    if (uses.direct) counts.direct++
    if (uses.lookup) counts.lookup++
    if (uses.derived) counts.derived++
  }
  return counts
}

/** The API with only the fields an option shows, or null if it doesn't use the table that way. */
export function showing(api: TableApi, show: Show): TableApi | null {
  if (show === "all") return api
  if (!usesOf(api)[show]) return null
  const fields = api.fields.filter((f) => (show === "direct" ? !f.via : f.via === show))
  return { ...api, fields }
}

/** How many different columns an API's fields use. */
export const columnCount = (fields: readonly TableField[]) => new Set(fields.flatMap((f) => (f.column ? [f.column] : []))).size
