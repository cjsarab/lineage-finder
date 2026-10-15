// Tables, worked out from the fields and their lineage: every table the lineage names, by product (Banner tables
// apart from Colleague files and CRM entities), with its columns and every API and field that uses it, across all
// versions; the query parameters that filter on it, and the APIs whose base table it is; the APIs whose lookups or
// derived logic name it (`via`); and the tables only lookups name.
import type { MethodParameters } from "./extract.ts"
import { productOfFamily } from "./products.ts"
import type { Field, Place, Value } from "./lineage.ts"

/** One field (or query parameter) of one API that uses the table, merged across the API's versions. */
export interface TableField {
  /** The field's full path, as on the API page (`owner.title`); a parameter's name. */
  path: string
  /** A query parameter that filters on the table, merged across the API's methods. */
  parameter?: true
  /** The column the value names, if it names one. */
  column?: string
  /** Every value naming this table here was inferred (camelCase, `TABLE.COLUMN`). */
  probable?: true
  /** Not in the API's newest version. */
  older?: true
  /** Only in a schema no method uses: the schema's name. */
  schema?: string
  /** Not lineage: a lookup naming the table, or derived logic naming it. */
  via?: Via
  /** For a lookup or derived logic: its words, as the catalog writes them (the newest version's). */
  text?: string
}

export type Via = "lookup" | "derived"

export interface TableApi {
  /** The API's id, e.g. "BannerWidgetAPIs/widgets". */
  id: string
  /** The newest version doesn't use the table. */
  older?: true
  /** Some version names it as its base table. */
  base?: true
  /**
   * Lineage first, then lookups, then derived logic; within each, fields, then parameters, then fields in schemas no
   * method uses. Empty if it's only the base table.
   */
  fields: TableField[]
}

export interface TableColumn {
  name: string
  /** The APIs using it (ids). */
  apis: string[]
  /** Known only from inferred values. */
  probable?: true
}

/** A table's page (GET /api/tables/<product>/<table>). */
export interface TableDetail {
  product: string
  name: string
  /** A–Z. */
  columns: TableColumn[]
  /** By API id. */
  apis: TableApi[]
  /** Other products naming a table of the same name. */
  alsoIn: string[]
  /** No lineage names it; only lookups do. */
  lookupsOnly?: true
}

/**
 * A table on the list (GET /api/tables): just enough to filter and count, leaving out hidden families in the
 * browser. `apis` are those whose lineage names it, not lookups or derived logic; for a table only lookups
 * name, the APIs whose lookups do. `cols` has one entry per column: which of `apis` use it (by position).
 */
export interface TableSummary {
  product: string
  name: string
  apis: string[]
  cols: number[][]
  /** Known only from inferred values. */
  probable?: true
  /** No lineage names it; only lookups do. */
  lookupsOnly?: true
}

export interface Tables {
  /** By product, then name A–Z. */
  list: TableSummary[]
  /** By `<product>/<table>`. */
  tables: Record<string, TableDetail>
}

/** What tables need from each API: its family, its version folders (newest last), their fields and the rest. */
export interface TableSource {
  id: string
  family: string
  /** Newest last, as in apis.json. */
  folders: string[]
  fields: Record<string, { fields: Field[]; other: { schema: string; fields: Field[] }[] }>
  /** By version folder: the methods' parameters, with their lineage worked out. */
  parameters?: Record<string, MethodParameters[]>
  /** By version folder: its base tables. */
  baseTables?: Record<string, string[]>
}

export const tableKey = (product: string, name: string) => `${product}/${name}`

export function buildTables(sources: Iterable<TableSource>): Tables {
  // product/table → api id → (field key → what we know, and whether it's the base table)
  type Use = { path: string; column?: string; stated: boolean; newest: boolean; schema?: string; parameter?: true; via?: Via; text?: string }
  type ApiUses = { uses: Map<string, Use>; base: boolean; baseNewest: boolean }
  const found = new Map<string, { product: string; name: string; apis: Map<string, ApiUses> }>()

  for (const src of sources) {
    const product = productOfFamily(src.family).product
    const newest = src.folders.at(-1)
    const usesOf = (table: string): ApiUses => {
      const key = tableKey(product, table)
      let t = found.get(key)
      if (!t) found.set(key, (t = { product, name: table, apis: new Map() }))
      let a = t.apis.get(src.id)
      if (!a) t.apis.set(src.id, (a = { uses: new Map(), base: false, baseNewest: false }))
      return a
    }
    const use = (folder: string, place: Place, path: string, schema?: string, parameter?: true, via?: { kind: Via; text: string }) => {
      const { uses } = usesOf(place.table)
      const useKey = `${via?.kind ?? ""}${parameter ? "?" : ""}${schema ?? ""}\u0000${path}\u0000${place.column ?? ""}`
      let u = uses.get(useKey)
      if (!u) uses.set(useKey, (u = { path, column: place.column, stated: false, newest: false, schema, ...(parameter ? { parameter } : {}), ...(via ? { via: via.kind } : {}) }))
      if (!place.probable) u.stated = true
      if (folder === newest) u.newest = true
      // The catalog's words: the newest version's.
      if (via && (u.text === undefined || folder === newest)) u.text = via.text
    }
    // A value's tables: those its lineage names, or those its lookup or derived logic links. A lookup names a
    // table, not a column, so it shows on the whole table only; derived logic naming a column and its table counts once,
    // by the column.
    const useValue = (folder: string, value: Value, path: string, schema?: string, parameter?: true) => {
      for (const place of value.places ?? []) use(folder, place, path, schema, parameter)
      if (value.kind === "ref") return
      const columns = new Map<string, Set<string>>()
      for (const link of value.links ?? []) {
        if (!link.table) continue
        let set = columns.get(link.table)
        if (!set) columns.set(link.table, (set = new Set()))
        if (value.kind === "derived" && link.column) set.add(link.column)
      }
      const via = { kind: value.kind, text: value.text }
      for (const [table, set] of columns) {
        if (set.size === 0) use(folder, { table }, path, schema, parameter, via)
        for (const column of set) use(folder, { table, column }, path, schema, parameter, via)
      }
    }
    for (const folder of src.folders) {
      const version = src.fields[folder]
      if (version) {
        const lists = [{ fields: version.fields, schema: undefined as string | undefined }, ...version.other.map((o) => ({ fields: o.fields, schema: o.schema }))]
        for (const { fields, schema } of lists) {
          for (const { field, path } of withPaths(fields)) {
            for (const value of field.values ?? []) useValue(folder, value, path, schema)
          }
        }
      }
      for (const method of src.parameters?.[folder] ?? []) {
        for (const p of method.parameters) for (const value of p.values ?? []) useValue(folder, value, p.name, undefined, true)
      }
      for (const table of src.baseTables?.[folder] ?? []) {
        const a = usesOf(table)
        a.base = true
        if (folder === newest) a.baseNewest = true
      }
    }
  }

  const productsOf = new Map<string, Set<string>>()
  for (const t of found.values()) {
    let set = productsOf.get(t.name)
    if (!set) productsOf.set(t.name, (set = new Set()))
    set.add(t.product)
  }

  const tables: Record<string, TableDetail> = {}
  const list: TableSummary[] = []
  const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const sorted = [...found.values()].sort((a, b) => (a.product < b.product ? -1 : a.product > b.product ? 1 : byName(a, b)))

  const viaOrder = (f: TableField) => (f.via === "lookup" ? 1 : f.via === "derived" ? 2 : 0)
  for (const t of sorted) {
    const apiIds = [...t.apis.keys()].sort()
    // The APIs whose lineage names it, or whose base table it is: the list counts these.
    const direct = apiIds.filter((id) => {
      const a = t.apis.get(id)!
      return a.base || [...a.uses.values()].some((u) => !u.via)
    })
    const lookupsOnly = direct.length === 0
    const columns = new Map<string, { apis: Set<string>; stated: boolean }>()
    let stated = false
    const apis: TableApi[] = apiIds.map((id) => {
      const { uses: byKey, base, baseNewest } = t.apis.get(id)!
      const uses = [...byKey.values()]
      if (base) stated = true
      const fields = uses
        .map((u): TableField => {
          if (u.stated && !u.via) stated = true
          // The columns are the lineage's: derived logic only links a column the table already has.
          if (u.column && !u.via) {
            let c = columns.get(u.column)
            if (!c) columns.set(u.column, (c = { apis: new Set(), stated: false }))
            c.apis.add(id)
            if (u.stated) c.stated = true
          }
          return {
            path: u.path,
            ...(u.column ? { column: u.column } : {}),
            ...(u.stated ? {} : { probable: true as const }),
            ...(u.newest ? {} : { older: true as const }),
            ...(u.schema ? { schema: u.schema } : {}),
            ...(u.parameter ? { parameter: true as const } : {}),
            ...(u.via ? { via: u.via, text: u.text } : {}),
          }
        })
        .sort(
          (a, b) =>
            viaOrder(a) - viaOrder(b) ||
            Number(!!a.schema) - Number(!!b.schema) ||
            Number(!!a.parameter) - Number(!!b.parameter) ||
            (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
        )
      const inNewest = baseNewest || uses.some((u) => u.newest)
      return { id, ...(inNewest ? {} : { older: true as const }), ...(base ? { base: true as const } : {}), fields }
    })
    const cols = [...columns].map(([name, c]) => ({ name, ...c })).sort(byName)
    const key = tableKey(t.product, t.name)
    tables[key] = {
      product: t.product,
      name: t.name,
      columns: cols.map((c) => ({ name: c.name, apis: [...c.apis].sort(), ...(c.stated ? {} : { probable: true as const }) })),
      apis,
      alsoIn: [...productsOf.get(t.name)!].filter((p) => p !== t.product).sort(),
      ...(lookupsOnly ? { lookupsOnly: true as const } : {}),
    }
    const counted = lookupsOnly ? apiIds : direct
    const position = new Map(counted.map((id, i) => [id, i]))
    list.push({
      product: t.product,
      name: t.name,
      apis: counted,
      cols: cols.map((c) => [...c.apis].map((id) => position.get(id)!).sort((a, b) => a - b)),
      ...(stated || lookupsOnly ? {} : { probable: true as const }),
      ...(lookupsOnly ? { lookupsOnly: true as const } : {}),
    })
  }
  return { list, tables }
}

/** Each field with its full path (`owner.title`), as the API page builds it (src/lib/fields.ts). */
function* withPaths(fields: readonly Field[]): Generator<{ field: Field; path: string }> {
  const stack: string[] = []
  for (const field of fields) {
    stack.length = field.depth
    stack.push(field.name)
    yield { field, path: stack.join(".") }
  }
}
