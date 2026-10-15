// What search needs: every field of every API, merged across the API's versions, with its lineage; every table with
// its columns; and every form, by code and title. The page fetches it once and searches it in the browser. Fields'
// descriptions go in a file of their own, fetched only when the Descriptions switch is on.
import type { FormSummary, Forms } from "./forms.ts"
import type { Field, Value } from "./lineage.ts"
import type { Tables } from "./tables.ts"

/** One field of one API: the same path with the same lineage in several versions is one entry. */
export interface SearchField {
  /** The field's full path, as on the API page (`owner.title`). */
  path: string
  /** Only in a schema no method uses: the schema's name. */
  schema?: string
  values?: Value[]
  /** The versions that have it, as positions in the API's versions in apis.json (oldest first). */
  v: number[]
}

export interface SearchApi {
  id: string
  fields: SearchField[]
}

export interface SearchTable {
  product: string
  name: string
  /** The APIs using it (ids). */
  apis: string[]
  /** A–Z; each with the APIs using it, as positions in `apis`. */
  columns: { name: string; apis: number[] }[]
}

/** search.json. */
export interface SearchFile {
  apis: SearchApi[]
  tables: SearchTable[]
  /** As on the forms list: product, code, title and the APIs built on it. */
  forms: FormSummary[]
}

/** search-descriptions.json: by API id, each field's description in the same order as its `fields`, or null. */
export type SearchDescriptions = Record<string, (string | null)[]>

/** A field as the indexer holds it before writing: with its description, which fields.json leaves out. */
export type DescribedField = Field & { description?: string }

/** What search needs from each API: its version folders (oldest first, as in apis.json) and their fields. */
export interface SearchSource {
  id: string
  folders: string[]
  fields: Record<string, { fields: DescribedField[]; other: { schema: string; fields: DescribedField[] }[] }>
}

export function buildSearch(sources: Iterable<SearchSource>, tables: Tables, forms: Forms = { list: [], forms: {} }): { search: SearchFile; descriptions: SearchDescriptions } {
  const apis: SearchApi[] = []
  const descriptions: SearchDescriptions = {}

  for (const src of sources) {
    const merged = new Map<string, { field: SearchField; description: string | null }>()
    src.folders.forEach((folder, position) => {
      const version = src.fields[folder]
      if (!version) return
      const lists = [{ fields: version.fields, schema: undefined as string | undefined }, ...version.other.map((o) => ({ fields: o.fields, schema: o.schema }))]
      for (const { fields, schema } of lists) {
        for (const { field, path } of withPaths(fields)) {
          // Lookups' and derived logic's links are for the API page; search matches the text.
          const values = field.values?.map(({ links: _, ...v }) => v)
          const key = `${schema ?? ""}\u0000${path}\u0000${JSON.stringify(values ?? [])}`
          let entry = merged.get(key)
          if (!entry) {
            entry = { field: { path, ...(schema ? { schema } : {}), ...(values ? { values } : {}), v: [] }, description: null }
            merged.set(key, entry)
          }
          if (!entry.field.v.includes(position)) entry.field.v.push(position)
          // The newest version's words, as the API page shows the newest by default.
          if (field.description) entry.description = field.description
        }
      }
    })
    if (merged.size === 0) continue
    const entries = [...merged.values()]
    apis.push({ id: src.id, fields: entries.map((e) => e.field) })
    if (entries.some((e) => e.description)) descriptions[src.id] = entries.map((e) => e.description)
  }

  const searchTables: SearchTable[] = tables.list.map((t) => {
    const detail = tables.tables[`${t.product}/${t.name}`]
    return { product: t.product, name: t.name, apis: t.apis, columns: detail.columns.map((c, i) => ({ name: c.name, apis: t.cols[i] })) }
  })
  const searchForms = forms.list.map(({ product, code, title, apis }) => ({ product, code, title, apis }))
  return { search: { apis, tables: searchTables, forms: searchForms }, descriptions }
}

/** Each field with its full path (`owner.title`), as the API page builds it (src/lib/fields.ts). */
function* withPaths<F extends { name: string; depth: number }>(fields: readonly F[]): Generator<{ field: F; path: string }> {
  const stack: string[] = []
  for (const field of fields) {
    stack.length = field.depth
    stack.push(field.name)
    yield { field, path: stack.join(".") }
  }
}
