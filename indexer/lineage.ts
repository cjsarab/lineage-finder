// Lineage on fields, and an API's base table. The rules come from a survey of the whole catalog, with a strict rule
// against false tables and "probable" for what we infer.
//
// Two stages, because two rules need every table in the catalog first:
//   1. extractFields (in each reading thread): the fields each method sends and returns, following $refs, with
//      their lineage values exactly as written.
//   2. makeResolver (in the main thread, once all specs are read): works out a table and column from each value.
import type { Spec } from "./read-spec.ts"

export type LineageKind = "ref" | "lookup" | "derived"

/** Every spelling of the lineage keys found in the catalog, with what it means. */
export const LINEAGE_KEYS: Record<string, LineageKind> = {
  "x-lineageReferenceObject": "ref",
  "x-LineageReferenceObject": "ref",
  "x-lineagereferenceobject": "ref",
  "x-lineageReferencebject": "ref",
  "x-linegeReferenceObject": "ref",
  "x-lineageRefernceObject": "ref",
  "x-lineageReferencObject": "ref",
  "x-lineageRefereceObject": "ref",
  "x-lineageObject": "ref",
  "x-lineageLookupReferenceObject": "lookup",
  "x-lineageReferenceLookupObject": "lookup",
  "x-lineageReferenceLookUpObject": "lookup",
  "x-lineageLookupReferenceObjects": "lookup",
  "x-lineageLookupReferencebject": "lookup",
  "x-lineageLookupReferenceOjbect": "lookup",
  "x-lineageLookupReferenceLogic": "lookup",
  "x-lineageDerivedLogic": "derived",
  "x-derivedLogic": "derived",
  "x-lineageDeriveLogic": "derived",
  "x-linageDerivedLogic": "derived",
}

/** A lineage value as the catalog writes it. */
export interface RawValue {
  kind: LineageKind
  text: string
}

/** A field in the order shown: a parent comes before its fields, which have a depth one more. */
export interface RawField {
  name: string
  depth: number
  /** The field is a list (of values or of objects). */
  list?: true
  values?: RawValue[]
  /** The catalog's description of the field, for search; left out of fields.json. */
  description?: string
}

export interface RawFields {
  fields: RawField[]
  /** Schemas no method uses that hold lineage (shown folded at the end). */
  other: { schema: string; fields: RawField[] }[]
  /**
   * The base table: table/column values written at the top of a schema that a
   * method sends or returns as a whole, as written, each once.
   */
  base: RawValue[]
}

// ---------- Stage 1: the fields ----------

const isMapping = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v)
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "head", "options", "trace"])
const SCHEMA_REF = "#/components/schemas/"

interface Node {
  name: string
  list: boolean
  values: RawValue[]
  description: string | null
  children: Map<string, Node>
}

const newNode = (name: string): Node => ({ name, list: false, values: [], description: null, children: new Map() })

/** The values under any lineage key of `obj`, as written: text trimmed, YAML lists one value per item. */
export function lineageOf(obj: Record<string, unknown>): RawValue[] {
  const out: RawValue[] = []
  for (const [key, value] of Object.entries(obj)) {
    const kind = LINEAGE_KEYS[key]
    if (!kind) continue
    for (const v of Array.isArray(value) ? value : [value]) {
      const text = typeof v === "string" ? v.trim() : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)
      if (text !== "") out.push({ kind, text })
    }
  }
  return out
}

function addValues(node: Node, values: RawValue[]) {
  for (const v of values) if (!node.values.some((x) => x.kind === v.kind && x.text === v.text)) node.values.push(v)
}

export function extractFields(spec: Spec): RawFields {
  const components = isMapping(spec.components) ? spec.components : {}
  const schemas = isMapping(components.schemas) ? components.schemas : {}
  const used = new Set<string>()

  // Follows a "#/…" reference inside the spec; anything else (another file, a missing target) gives nothing.
  const follow = (node: unknown): { target: unknown; schema: string | null } => {
    if (!isMapping(node) || typeof node.$ref !== "string") return { target: node, schema: null }
    const ref = node.$ref
    if (!ref.startsWith("#/")) return { target: null, schema: null }
    const target = ref
      .slice(2)
      .split("/")
      .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce<unknown>((o, key) => (isMapping(o) ? o[key] : undefined), spec)
    return { target, schema: ref.startsWith(SCHEMA_REF) ? ref.slice(SCHEMA_REF.length) : null }
  }

  /** Adds the fields of `schema` to `into`. `seen` holds the schemas on the way here, so a loop stops. */
  const walk = (schema: unknown, into: Node, seen: ReadonlySet<string>) => {
    const { target, schema: name } = follow(schema)
    if (name !== null) {
      if (seen.has(name)) return
      used.add(name)
      seen = new Set(seen).add(name)
    }
    if (!isMapping(target)) return
    if (target.items !== undefined) walk(target.items, into, seen)
    for (const key of ["allOf", "oneOf", "anyOf"]) if (Array.isArray(target[key])) for (const part of target[key]) walk(part, into, seen)
    if (!isMapping(target.properties)) return
    for (const [fieldName, prop] of Object.entries(target.properties)) {
      let child = into.children.get(fieldName)
      if (!child) into.children.set(fieldName, (child = newNode(fieldName)))
      const resolved = follow(prop).target
      if (isList(prop) || isList(resolved)) child.list = true
      // Lineage written on the field itself, or on its list's items written in place. Lineage
      // at the top of a schema it refers to is left out: only a whole body's schema gives a base table (`baseOf`).
      if (isMapping(prop)) {
        addValues(child, lineageOf(prop))
        if (isMapping(prop.items) && prop.items.$ref === undefined) addValues(child, lineageOf(prop.items))
        // The field's own words (or its list's items' written in place); the first found if methods differ.
        child.description ??= descriptionOf(prop) ?? (isMapping(prop.items) && prop.items.$ref === undefined ? descriptionOf(prop.items) : null)
      }
      walk(prop, child, seen)
    }
  }

  // The base table: lineage at the top of a body's own schema, of its list's items, or of its allOf/oneOf/anyOf parts.
  // In the whole catalog, every such value is a table/column one, and none sits on a schema nested in a field.
  const base: RawValue[] = []
  const baseOf = (schema: unknown, seen: ReadonlySet<string>) => {
    const { target, schema: name } = follow(schema)
    if (name !== null) {
      if (seen.has(name)) return
      seen = new Set(seen).add(name)
    }
    if (!isMapping(target)) return
    for (const v of lineageOf(target)) if (v.kind === "ref" && !base.some((b) => b.text === v.text)) base.push(v)
    if (target.items !== undefined) baseOf(target.items, seen)
    for (const key of ["allOf", "oneOf", "anyOf"]) if (Array.isArray(target[key])) for (const part of target[key]) baseOf(part, seen)
  }

  const root = newNode("")
  const paths = isMapping(spec.paths) ? spec.paths : {}
  for (const ops of Object.values(paths)) {
    if (!isMapping(ops)) continue
    for (const [method, op] of Object.entries(ops)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !isMapping(op)) continue
      for (const body of bodies(op, follow)) {
        walk(body, root, new Set())
        baseOf(body, new Set())
      }
    }
  }

  // Schemas nothing reached: those holding lineage, each with its own fields (one already shown inside an earlier
  // one is skipped).
  const other: RawFields["other"] = []
  for (const name of Object.keys(schemas)) {
    if (used.has(name)) continue
    const node = newNode(name)
    walk({ $ref: SCHEMA_REF + name.replace(/~/g, "~0").replace(/\//g, "~1") }, node, new Set())
    const fields = flatten(node)
    if (fields.some((f) => f.values)) other.push({ schema: name, fields })
  }
  return { fields: flatten(root), other, base }
}

/**
 * The names of the fields in any schema whose lineage is a key block: the inputs the form starts from
 * Looks through every schema, nested ones included, used by a method or not.
 */
export function keyBlockFields(spec: Spec): Set<string> {
  const out = new Set<string>()
  const components = isMapping(spec.components) ? spec.components : {}
  const visit = (node: unknown, depth: number) => {
    if (depth > 40) return
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1)
      return
    }
    if (!isMapping(node)) return
    if (isMapping(node.properties) && lineageOf(node).some((v) => v.kind === "ref" && /key_?bl/i.test(v.text))) {
      for (const name of Object.keys(node.properties)) out.add(name)
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && isMapping(value)) for (const p of Object.values(value)) visit(p, depth + 1)
      else visit(value, depth + 1)
    }
  }
  visit(components.schemas, 0)
  return out
}

function descriptionOf(obj: Record<string, unknown>): string | null {
  return typeof obj.description === "string" && obj.description.trim() !== "" ? obj.description.trim() : null
}

function isList(schema: unknown): boolean {
  return isMapping(schema) && (schema.type === "array" || schema.items !== undefined)
}

/** The request body and every success (2xx) response's body, by media type. */
function bodies(op: Record<string, unknown>, follow: (n: unknown) => { target: unknown }): unknown[] {
  const out: unknown[] = []
  const contentOf = (holder: unknown) => {
    const h = follow(holder).target
    if (isMapping(h) && isMapping(h.content)) for (const c of Object.values(h.content)) if (isMapping(c) && c.schema !== undefined) out.push(c.schema)
  }
  contentOf(op.requestBody)
  if (isMapping(op.responses)) for (const [code, response] of Object.entries(op.responses)) if (/^2/.test(code)) contentOf(response)
  return out
}

function flatten(root: Node): RawField[] {
  const out: RawField[] = []
  const visit = (node: Node, depth: number) => {
    for (const child of node.children.values()) {
      out.push({
        name: child.name,
        depth,
        ...(child.list ? { list: true as const } : {}),
        ...(child.values.length ? { values: child.values } : {}),
        ...(child.description ? { description: child.description } : {}),
      })
      visit(child, depth + 1)
    }
  }
  visit(root, 0)
  return out
}

// ---------- Stage 2: tables and columns ----------

/** How a table and column were found from a value. */
export type How = "prefix" | "brackets" | "bare" | "guid" | "dotted" | "camel"

export interface Found {
  table: string
  column: string | null
  how: How
}

/** A table (and column) worked out from a value. */
export interface Place {
  table: string
  column?: string
  /** We inferred it rather than read it. */
  probable?: true
}

/** A value with what we worked out from it, as kept in the index. */
export interface Value extends RawValue {
  /** Usually one; an "A or B" value can name several. */
  places?: Place[]
  /** Ellucian's word for "we don't publish this", or "derived" instead of a column. */
  note?: "unsupported" | "derived"
  /** A lookup's or derived logic's names that link somewhere, in the order written. */
  links?: Link[]
}

export interface Field {
  name: string
  depth: number
  list?: true
  values?: Value[]
}

const T = "[A-Z][A-Z0-9$#]*" // a Banner-style table name
const C = "[A-Z][A-Z0-9$#]*_[A-Z0-9_$#]+" // a Banner-style column name (TABLE_SOMETHING)

/** The value formats found in the catalog, in order; the first that matches wins. */
const RULES: [string, (v: string) => boolean][] = [
  ["unsupported", (v) => /^["']?\s*unsupported\b/i.test(v)],
  ["derived", (v) => /^derived$/i.test(v)],
  ["guid-lookup", (v) => /GORGUID|LDM_NAME|LDM\.GUID/i.test(v)],
  ["alternatives", (v) => /\s(or|and)\s/i.test(v) || /[,;]/.test(v)],
  ["banner-column(table)", (v) => new RegExp(`^${C}\\s*\\(\\s*${T}\\s*\\)$`, "i").test(v)],
  ["field(container)", (v) => /^[A-Z0-9._-]+\s*\(\s*[A-Z0-9._-]+\s*\)$/i.test(v)],
  ["banner-table_column", (v) => new RegExp(`^${C}$`, "i").test(v)],
  ["dotted-name", (v) => /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/i.test(v)],
  ["bare-table", (v) => /^[A-Z][A-Z0-9]{3,}$/i.test(v) && (v === v.toLowerCase() || v === v.toUpperCase())],
  ["camelCase-name", (v) => /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(v)],
  ["free-text", (v) => /\s/.test(v)],
  ["other", () => true],
]

export function classify(value: string): string {
  const v = value.trim()
  return RULES.find(([, test]) => test(v))![0]
}

/** The table and column in a value. camelCase names need the tables already known (`known`). */
export function extract(value: string, known: ReadonlySet<string> | null = null, category = classify(value)): Found[] {
  const s = value.trim().toUpperCase()
  switch (category) {
    case "field(container)":
    case "banner-column(table)": {
      const [, column, table] = s.match(/^(.*?)\s*\(\s*(.*?)\s*\)$/)!
      return [{ table, column, how: "brackets" }]
    }
    case "dotted-name": {
      const parts = s.split(".")
      return parts.length === 2 ? [{ table: parts[0], column: parts[1], how: "dotted" }] : []
    }
    case "camelCase-name": {
      if (!known) return []
      const raw = value.trim()
      for (const len of [7, 8, 6, 5]) {
        const table = raw.slice(0, len).toUpperCase()
        if (known.has(table) && /^[A-Z]/.test(raw.slice(len))) {
          const rest = raw.slice(len).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()
          return [{ table, column: `${table}_${rest}`, how: "camel" }]
        }
      }
      return []
    }
    case "banner-table_column":
      return [{ table: s.split("_")[0], column: s, how: "prefix" }]
    case "bare-table":
      return [{ table: s, column: null, how: "bare" }]
    case "guid-lookup":
      return /^GORGUID_GUID/.test(s) ? [{ table: "GORGUID", column: "GORGUID_GUID", how: "guid" }] : []
    case "alternatives":
      return value
        .trim()
        .split(/\s+(?:or|and)\s+|[,;]/i)
        .map((p) => p.trim())
        .filter(Boolean)
        .flatMap((p) => {
          const c = classify(p)
          return c === "alternatives" ? [] : extract(p, known, c)
        })
    default:
      return []
  }
}

// A key block is a screen name, never a table, though it has Banner's 7-character shape.
const KEY_BLOCK = /^KEYBL(CK|OC)/
const BANNER_SHAPE = /^[A-Z][A-Z0-9]{6}$/
// A Banner name whose third letter is A, I, M or Q is always a form, never a
// table; and a key or control block (`SWASTDN_KEY_BLOCK`, `key_block2`, `sxbagrl_ctrl_block`) is part of a form's screen.
export const FORM_LETTER = /^[A-Z][A-Z0-9][AIMQ][A-Z0-9]{4}$/
const BLOCK = /(^|_)(KEY_?BL(OCK|CK|OC)\d*|CTRL_BLOCK)$/i
// Banner names a table with B, R, V or T as its third letter (base,
// repeating, validation, temporary).
export const TABLE_LETTER = /^[A-Z][A-Z0-9][BRVT][A-Z0-9]{4}$/

/**
 * Builds the rule that turns a `ref` value into tables and columns, from every `ref` value in the catalog
 * (`bannerRefTexts`: those from Banner families, by default all of them):
 * - a table found **only** by the `TABLE_COLUMN` prefix counts if it has Banner's 7-character shape or another
 *   rule names it too (this removes false tables such as `BATCH` and `MENU`); key blocks never count;
 * - camelCase names use the tables found that way, and are **probable**, as is `TABLE.COLUMN` outside Colleague
 *   (in Colleague, `FILE.FIELD` is simply how the catalog states it);
 * - in Banner, a name with a form's third letter is never a table, and a key or control block never a column;
 * - in Banner (a form's on-screen items and words aren't tables):
 *   (a) a name written alone (`amount`, `head1`) counts only if it has a table's third letter (`TABLE_LETTER`) or some
 *   value writes it as a table, `TABLE_COLUMN` (counted by the rules here), `COLUMN(TABLE)` or `TABLE.COLUMN`;
 *   (b) a 7-letter name found only by the prefix (`DISPLAY_TEXT_IND`) counts only with a table's third letter.
 */
export function makeResolver(allRefTexts: Iterable<string>, bannerRefTexts: Iterable<string> = allRefTexts) {
  const confirmed = new Set<string>()
  const prefixOnly = new Set<string>()
  for (const text of new Set(allRefTexts)) {
    for (const f of extract(text)) (f.how === "prefix" ? prefixOnly : confirmed).add(f.table)
  }
  // How Banner's values write each name.
  const bannerHows = new Map<string, Set<How>>()
  for (const text of new Set(bannerRefTexts)) {
    for (const f of extract(text)) {
      let hows = bannerHows.get(f.table)
      if (!hows) bannerHows.set(f.table, (hows = new Set()))
      hows.add(f.how)
    }
  }
  const writtenAsTable = (table: string) => bannerHows.get(table)?.has("brackets") || bannerHows.get(table)?.has("dotted") || false
  /** Rule (b), and the strict rule for other lengths: a Banner name found by the prefix. */
  const bannerPrefix = (table: string) =>
    BANNER_SHAPE.test(table) ? TABLE_LETTER.test(table) || writtenAsTable(table) : confirmed.has(table)
  /** Rule (a): a Banner name written alone. */
  const bannerBare = (table: string) =>
    TABLE_LETTER.test(table) || writtenAsTable(table) || (bannerHows.get(table)?.has("prefix") === true && bannerPrefix(table))
  const accept = (f: Found, banner: boolean): boolean =>
    !KEY_BLOCK.test(f.table) &&
    !(f.column && BLOCK.test(f.column)) &&
    (!banner
      ? f.how !== "prefix" || BANNER_SHAPE.test(f.table) || confirmed.has(f.table)
      : !FORM_LETTER.test(f.table) && (f.how === "prefix" ? bannerPrefix(f.table) : f.how !== "bare" || bannerBare(f.table)))
  // For camelCase names: a Banner name only if Banner's values make it a table; other products' as before (forms left
  // out, and a name found only by the prefix needing Banner's shape or confirming).
  const known = new Set(
    [...confirmed, ...prefixOnly].filter((t) => {
      const hows = bannerHows.get(t)
      if (hows) return [...hows].some((how) => accept({ table: t, column: null, how }, true))
      return !FORM_LETTER.test(t) && accept({ table: t, column: null, how: "prefix" }, false)
    }),
  )

  /** `banner`: the value is from a Banner family (the form-letter rule); by default any family but Colleague's. */
  return (value: RawValue, colleague: boolean, banner = !colleague): Value => {
    if (value.kind !== "ref") return value
    const category = classify(value.text)
    if (category === "unsupported") return { ...value, note: "unsupported" }
    if (category === "derived") return { ...value, note: "derived" }
    const places = extract(value.text, known, category)
      .filter((f) => accept(f, banner))
      .map((f): Place => ({
        table: f.table,
        ...(f.column ? { column: f.column } : {}),
        ...(f.how === "camel" || (f.how === "dotted" && !colleague) ? { probable: true as const } : {}),
      }))
    return places.length ? { ...value, places } : value
  }
}

// ---------- Stage 3: links in lookups and derived logic ----------

/** A name inside a lookup or derived logic that opens a page: where it is in the value's text, and what it opens. */
export interface Link {
  /** The name is `text.slice(at, at + length)`. */
  at: number
  length: number
  /** A table, or a column of it (derived logic naming a column its table's page knows). */
  table?: string
  column?: string
  form?: string
  /** An API's id, of the same product. */
  api?: string
}

/** What links can open, worked out once every value is resolved. */
export interface Linkable {
  /** By product: the tables on the list. */
  tables: ReadonlyMap<string, ReadonlySet<string>>
  /** By `<product>/<table>`: the columns its page lists. */
  columns: ReadonlyMap<string, ReadonlySet<string>>
  /** By product: the forms. */
  forms: ReadonlyMap<string, ReadonlySet<string>>
  /** By product: its APIs' ids (`<family>/<name>`). */
  apis: ReadonlyMap<string, readonly string[]>
}

// Banner's schema owners, which some lookups put before a table (`saturn.sxvterm`, `saturn,sxvterm`).
const OWNERS = new Set(["saturn", "general", "taismgr", "posnctl", "payroll", "fimsmgr", "faismgr", "alumni", "wtailor", "bansecr", "baninst1"])
// A list's separators, as `extract` splits "alternatives".
const LIST_SPLIT = /\s+(?:or|and)\s+|[,;]/gi
const WORD = /[A-Za-z][A-Za-z0-9_$#]*/g
const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "")
const NOTHING: ReadonlySet<string> = new Set()

/**
 * Builds the rules that link the names in lookups and derived logic, keeping the text as written:
 * - a **lookup** is split as a list is; each part (a schema owner such as `saturn` skipped) is tried as a table on the
 *   list of the same product, then a form, then an API: of the same family, else the one API of the same product with
 *   that name (case and separators aside). Failing those, in Banner, a name with a table's shape (`TABLE_LETTER`) that
 *   isn't an API's name still links, as a table **only lookups name** (`lookupsOnly`). A part with spaces (SQL) is read
 *   as derived logic is;
 * - **derived logic**, in Banner only (other products' files are ordinary words: PERSON, TERMS): each word that is a
 *   table on the list with a table's shape (the word CURRENT left out), or a `TABLE_COLUMN` of one: the column links
 *   if the table's page lists it, otherwise the table part does.
 * Lookups go first: derived logic links the tables only lookups name too.
 */
export function makeLinker(known: Linkable) {
  /** By product: tables not on the list that lookups name. */
  const lookupsOnly = new Map<string, Set<string>>()
  // APIs by name: exactly and normalised within each family, normalised within each product. Null where two APIs share
  // a normalised name: neither is linked.
  type Names = { exact: Map<string, string>; normal: Map<string, string | null> }
  const byFamily = new Map<string, Names>()
  const byProduct = new Map<string, Map<string, string | null>>()
  const addNormal = (map: Map<string, string | null>, name: string, id: string) => map.set(normalise(name), map.has(normalise(name)) ? null : id)
  for (const [product, ids] of known.apis) {
    const inProduct = new Map<string, string | null>()
    byProduct.set(product, inProduct)
    for (const id of ids) {
      const slash = id.indexOf("/")
      const family = id.slice(0, slash)
      const name = id.slice(slash + 1)
      let names = byFamily.get(family)
      if (!names) byFamily.set(family, (names = { exact: new Map(), normal: new Map() }))
      names.exact.set(name, id)
      addNormal(names.normal, name, id)
      addNormal(inProduct, name, id)
    }
  }
  const listed = (product: string, name: string) => (known.tables.get(product) ?? NOTHING).has(name) || (lookupsOnly.get(product) ?? NOTHING).has(name)

  /** The words of `text` from `from` to `to`, read as derived logic. */
  const words = (text: string, from: number, to: number, product: string, links: Link[]) => {
    if (product !== "Banner") return
    const isTable = (name: string) => TABLE_LETTER.test(name) && name !== "CURRENT" && listed(product, name)
    for (const m of text.slice(from, to).matchAll(WORD)) {
      const word = m[0].toUpperCase()
      const at = from + m.index
      if (isTable(word)) links.push({ at, length: word.length, table: word })
      else if (word[7] === "_" && isTable(word.slice(0, 7))) {
        const table = word.slice(0, 7)
        if (known.columns.get(`${product}/${table}`)?.has(word)) links.push({ at, length: word.length, table, column: word })
        else links.push({ at, length: 7, table })
      }
    }
  }

  /** What one name in a lookup opens, if anything. */
  const target = (name: string, product: string, family: string): Omit<Link, "at" | "length"> | null => {
    const tables = known.tables.get(product) ?? NOTHING
    for (const f of extract(name, tables)) if (tables.has(f.table)) return { table: f.table }
    const upper = name.toUpperCase()
    if (/^[A-Za-z][A-Za-z0-9_$#]*$/.test(name) && tables.has(upper)) return { table: upper }
    if (known.forms.get(product)?.has(upper)) return { form: upper }
    const inFamily = byFamily.get(family)
    const api = inFamily?.exact.get(name) ?? inFamily?.normal.get(normalise(name)) ?? byProduct.get(product)?.get(normalise(name))
    if (api) return { api }
    if (product === "Banner" && TABLE_LETTER.test(upper) && !byProduct.get(product)?.has(normalise(name))) {
      let names = lookupsOnly.get(product)
      if (!names) lookupsOnly.set(product, (names = new Set()))
      names.add(upper)
      return { table: upper }
    }
    return null
  }

  /** One part of a lookup, from `from` to `to`: quotes and brackets around it are left out of the link. */
  const part = (text: string, from: number, to: number, product: string, family: string, links: Link[]) => {
    const raw = text.slice(from, to)
    from += raw.length - raw.replace(/^[\s"'(]+/, "").length
    to -= raw.length - raw.replace(/[\s"')]+$/, "").length
    if (to <= from) return
    let name = text.slice(from, to)
    if (/\s/.test(name)) return words(text, from, to, product, links)
    const owner = name.match(/^([A-Za-z0-9_]+)\./)
    if (owner && OWNERS.has(owner[1].toLowerCase())) {
      from += owner[0].length
      name = name.slice(owner[0].length)
    }
    if (OWNERS.has(name.toLowerCase())) return
    const opens = target(name, product, family)
    if (opens) links.push({ at: from, length: name.length, ...opens })
  }

  return {
    /** A lookup's links (`product` and `family` are its API's). */
    lookup(text: string, product: string, family: string): Link[] {
      const links: Link[] = []
      if (classify(text) !== "alternatives") part(text, 0, text.length, product, family, links)
      else {
        let from = 0
        for (const m of text.matchAll(LIST_SPLIT)) {
          part(text, from, m.index, product, family, links)
          from = m.index + m[0].length
        }
        part(text, from, text.length, product, family, links)
      }
      return links
    },
    /** Derived logic's links. */
    derived(text: string, product: string): Link[] {
      const links: Link[] = []
      words(text, 0, text.length, product, links)
      return links
    },
    lookupsOnly: lookupsOnly as ReadonlyMap<string, ReadonlySet<string>>,
  }
}

/** Per version, for the list's Lineage filter and the section's summary. */
export interface Coverage {
  /** Fields at the ends of branches (no fields of their own). */
  fields: number
  /** …with lineage: any value other than `unsupported`. */
  withLineage: number
  /** …whose only values are `unsupported`. */
  unsupported: number
}

export function coverage(fields: readonly Field[]): Coverage {
  const out: Coverage = { fields: 0, withLineage: 0, unsupported: 0 }
  fields.forEach((f, i) => {
    if ((fields[i + 1]?.depth ?? -1) > f.depth) return // a parent
    out.fields++
    const values = f.values ?? []
    if (values.some((v) => v.note !== "unsupported")) out.withLineage++
    else if (values.length) out.unsupported++
  })
  return out
}
