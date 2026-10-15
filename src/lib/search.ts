// Search: plain matching that suits names, used by the Search page and by the filter boxes on the lists and pages,
// so they all follow the same rules. Capitals don't matter; `_`, `.`, `-` and `/` count as spaces; every word typed
// must appear, in any order, and part of a word is enough. Forms are found by code and title.
import type { Api, FormSummary, SearchApi, SearchField, SearchTable } from "@/lib/server"

// ---------- Matching ----------

/** Small letters, with `_ . - /` and runs of spaces as one space. */
export const prepare = (text: string) => text.toLowerCase().replace(/[_.\-/\s]+/g, " ").trim()

/**
 * A name made ready to match: as `prepare`, plus the name run together, so `widgetreq` still finds `widget-requests`
 * (as the APIs list's name box always has).
 */
export function prepareName(name: string): string {
  const spaced = prepare(name)
  const squashed = spaced.replace(/ /g, "")
  return squashed === spaced ? spaced : `${spaced} ${squashed}`
}

/** The words typed, made ready to match. */
export const queryWords = (query: string) => prepare(query).split(" ").filter(Boolean)

/** Every word appears in the text (made ready with `prepare` or `prepareName`). No words: everything matches. */
export const matchesWords = (words: readonly string[], text: string) => words.every((w) => text.includes(w))

/** The filter boxes' test in one: does `query` match any of these texts taken together? */
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = queryWords(query)
  return words.length === 0 || matchesWords(words, texts.map(prepareName).join("\n"))
}

// ---------- The search index, made ready in the browser ----------

export interface IndexedApi {
  api: Api
  /** For ordering: the name run together. */
  key: string
  text: string
  description: string
}

export interface IndexedField {
  apiId: string
  family: string
  apiName: string
  field: SearchField
  /** The field's own name (the end of its path), run together: what "the whole name typed" compares with. */
  key: string
  /** Its path and lineage (not derived logic). */
  own: string
  /** Its API's name. */
  apiText: string
  derived: string
  /** Its position in its API's fields in the search file, where its description is in the descriptions file. */
  position: number
}

export interface IndexedTable {
  table: SearchTable
  key: string
  text: string
  families: string[]
}

export interface IndexedColumn {
  table: SearchTable
  name: string
  /** The APIs using it (ids). */
  apis: string[]
  families: string[]
  key: string
  text: string
}

/** A form, found by its code or title. */
export interface IndexedForm {
  form: FormSummary
  /** The code, for ranking: the whole code typed comes first. */
  key: string
  /** Code and title. */
  text: string
  families: string[]
}

/** Everything searched, each list already A–Z, so a search only has to put its results in rank order. */
export interface SearchIndex {
  apis: IndexedApi[]
  fields: IndexedField[]
  /**
   * Each field's path, lineage, API name and derived logic together, in `fields` order, so a field that can't match
   * is ruled out with one look. A list of its own: measured, scanning it is nearly twice as fast as
   * reaching the same text through each field.
   */
  fieldTexts: string[]
  tables: IndexedTable[]
  columns: IndexedColumn[]
  forms: IndexedForm[]
  /** Every word in names and lineage, with how often it appears, for "Did you mean". */
  words: Map<string, number>
}

const familyOf = (id: string) => id.slice(0, id.indexOf("/"))
const squash = (prepared: string) => prepared.replace(/ /g, "")
const lastPart = (path: string) => path.slice(path.lastIndexOf(".") + 1)
const az = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Words for "Did you mean": names split at separators and between a small letter and a capital. */
function addWords(words: Map<string, number>, text: string) {
  for (const w of prepare(text.replace(/([a-z0-9])([A-Z])/g, "$1 $2")).split(/[^a-z0-9$#]+/)) {
    if (w.length >= 3 && !/^\d+$/.test(w)) words.set(w, (words.get(w) ?? 0) + 1)
  }
}

export function buildSearchIndex(apis: readonly Api[], file: { apis: SearchApi[]; tables: SearchTable[]; forms?: FormSummary[] }): SearchIndex {
  const words = new Map<string, number>()
  const byId = new Map(apis.map((a) => [a.id, a]))
  // The same names and lineage come up again and again (one column in many APIs), so each is worked on once.
  const cache = new Map<string, string>()
  const name = (text: string) => {
    let p = cache.get(text)
    if (p === undefined) cache.set(text, (p = prepareName(text)))
    return p
  }
  const keys = new Map<string, string>()
  const keyOf = (text: string) => {
    let k = keys.get(text)
    if (k === undefined) keys.set(text, (k = squash(prepare(text))))
    return k
  }
  const seen = new Set<string>()
  const addWordsOnce = (text: string) => {
    if (seen.has(text)) return
    seen.add(text)
    addWords(words, text)
  }

  const indexedApis: IndexedApi[] = apis.map((api) => {
    const d = api.versions.at(-1)?.details
    addWordsOnce(api.name)
    return {
      api,
      key: keyOf(api.name),
      // Every family's name ends in "APIs", which would make `pi` or `api` find every API: that ending is left out.
      text: [api.name, api.family.replace(/APIs?$/i, ""), d?.title ?? ""].map(name).join("\n"),
      description: prepare(d?.description ?? ""),
    }
  })
  indexedApis.sort((a, b) => az(a.api.name, b.api.name) || az(a.api.family, b.api.family))

  const fields: IndexedField[] = []
  for (const a of file.apis) {
    const api = byId.get(a.id)
    if (!api) continue
    const apiText = name(api.name)
    a.fields.forEach((field, position) => {
      const parts = [field.path]
      const derived: string[] = []
      for (const v of field.values ?? []) {
        if (v.kind === "derived") derived.push(v.text)
        else {
          parts.push(v.text)
          for (const p of v.places ?? []) parts.push(p.table, p.column ?? "")
          addWordsOnce(v.text)
        }
      }
      // By each part of the path: paths are mostly different, their parts mostly the same.
      for (const part of field.path.split(".")) addWordsOnce(part)
      const own = parts.map(name).join("\n")
      const derivedText = derived.map(prepare).join("\n")
      fields.push({
        apiId: a.id,
        family: api.family,
        apiName: api.name,
        field,
        key: keyOf(lastPart(field.path)),
        own,
        apiText,
        derived: derivedText,
        position,
      })
    })
  }
  fields.sort((a, b) => az(a.key, b.key) || az(a.field.path, b.field.path) || az(a.apiId, b.apiId))
  const fieldTexts = fields.map((f) => (f.derived ? `${f.own}\n${f.apiText}\n${f.derived}` : `${f.own}\n${f.apiText}`))

  const tables: IndexedTable[] = []
  const columns: IndexedColumn[] = []
  for (const table of file.tables) {
    addWordsOnce(table.name)
    const families = [...new Set(table.apis.map(familyOf))]
    tables.push({ table, key: keyOf(table.name), text: name(table.name), families })
    for (const c of table.columns) {
      addWordsOnce(c.name)
      const ids = c.apis.map((i) => table.apis[i])
      columns.push({ table, name: c.name, apis: ids, families: [...new Set(ids.map(familyOf))], key: keyOf(c.name), text: name(c.name) })
    }
  }
  tables.sort((a, b) => az(a.table.name, b.table.name) || az(a.table.product, b.table.product))
  columns.sort((a, b) => az(a.name, b.name) || az(a.table.product, b.table.product))

  // Forms arrive A–Z by product, then code; searched A–Z by code like the tables.
  const forms: IndexedForm[] = (file.forms ?? []).map((form) => {
    addWordsOnce(form.code)
    if (form.title) addWordsOnce(form.title)
    return { form, key: keyOf(form.code), text: [form.code, form.title ?? ""].map(name).join("\n"), families: [...new Set(form.apis.map(familyOf))] }
  })
  forms.sort((a, b) => az(a.form.code, b.form.code) || az(a.form.product, b.form.product))
  return { apis: indexedApis, fields, fieldTexts, tables, columns, forms, words }
}

/** The fields' descriptions made ready, by API id, in the same order as the search file's fields. */
export function prepareDescriptions(file: Record<string, (string | null)[]>): Map<string, string[]> {
  return new Map(Object.entries(file).map(([id, list]) => [id, list.map((d) => (d ? prepare(d) : ""))]))
}

/** The descriptions in the index's order of fields ("" for none), for `SearchOptions.fieldDescriptions`. */
export function descriptionsInOrder(index: SearchIndex, descriptions: Map<string, string[]>): string[] {
  return index.fields.map((f) => descriptions.get(f.apiId)?.[f.position] ?? "")
}

// ---------- Searching ----------

export interface SearchOptions {
  derived: boolean
  descriptions: boolean
  /** Families hidden in Settings. */
  hidden: ReadonlySet<string>
  /** The fields' descriptions once loaded (Descriptions on), from `descriptionsInOrder`. */
  fieldDescriptions?: readonly string[] | null
}

/** Why a result is there when its name doesn't say: matched in its derived logic, or its description. */
export type Why = "derived logic" | "description"

export interface Hit<T> {
  item: T
  /** 0: the whole name typed; 1: the name starts with it; 2: found in the name or lineage; 3: needed the API's name; 4: needed derived logic or a description. */
  rank: number
  why?: Why
}

export interface SearchResults {
  apis: Hit<IndexedApi>[]
  fields: Hit<IndexedField>[]
  tables: Hit<IndexedTable>[]
  columns: Hit<IndexedColumn>[]
  forms: Hit<IndexedForm>[]
  /** Results left out because their families are hidden in Settings. */
  hidden: number
}

export type Group = "apis" | "fields" | "tables" | "forms" | "columns"
/** Forms after Tables, as in the header. */
export const GROUPS: Group[] = ["apis", "fields", "tables", "forms", "columns"]

export const resultCount = (r: SearchResults) => r.apis.length + r.fields.length + r.tables.length + r.forms.length + r.columns.length

const RANKS = 5

/** Hits by rank; within a rank they stay in the order found, which is A–Z (the index's lists are). */
function ranked<T>() {
  const buckets: Hit<T>[][] = Array.from({ length: RANKS }, () => [])
  return { add: (hit: Hit<T>) => buckets[hit.rank].push(hit), list: () => buckets.flat() }
}

export function search(index: SearchIndex, query: string, options: SearchOptions): SearchResults {
  const words = queryWords(query)
  if (words.length === 0) return { apis: [], fields: [], tables: [], columns: [], forms: [], hidden: 0 }
  const typed = words.join("")
  // These run for every field on every key press, so they're plain loops (measured: for…of over the
  // words, run 120,000 times, more than doubled a search's time).
  const count = words.length
  const has = (text: string) => {
    for (let i = 0; i < count; i++) if (!text.includes(words[i])) return false
    return true
  }
  /** Every word is in one or other of the texts, without joining them. */
  const covered = (a: string, b: string, c = "") => {
    for (let i = 0; i < count; i++) {
      const w = words[i]
      if (!a.includes(w) && !b.includes(w) && !c.includes(w)) return false
    }
    return true
  }
  /** 0, 1 or 2 by how the name compares with what was typed. */
  const nameRank = (key: string) => (key === typed ? 0 : key.startsWith(typed) ? 1 : 2)
  let hidden = 0
  const shown = (families: readonly string[]) => {
    for (const f of families) if (!options.hidden.has(f)) return true
    hidden++
    return false
  }
  const descriptions = options.descriptions ? (options.fieldDescriptions ?? null) : null

  const apis = ranked<IndexedApi>()
  for (const a of index.apis) {
    let hit: Hit<IndexedApi> | null = null
    if (has(a.text)) hit = { item: a, rank: nameRank(a.key) }
    else if (options.descriptions && covered(a.text, a.description)) hit = { item: a, rank: 4, why: "description" }
    if (hit && shown([a.api.family])) apis.add(hit)
  }

  const fields = ranked<IndexedField>()
  const texts = index.fieldTexts
  for (let i = 0; i < texts.length; i++) {
    let hit: Hit<IndexedField> | null = null
    if (has(texts[i])) {
      const f = index.fields[i]
      if (has(f.own)) hit = { item: f, rank: nameRank(f.key) }
      else if (covered(f.own, f.apiText)) hit = { item: f, rank: 3 }
      else if (options.derived) hit = { item: f, rank: 4, why: "derived logic" }
    }
    if (!hit && descriptions && descriptions[i] && covered(texts[i], descriptions[i])) hit = { item: index.fields[i], rank: 4, why: "description" }
    if (hit && shown([hit.item.family])) fields.add(hit)
  }

  const tables = ranked<IndexedTable>()
  for (const t of index.tables) if (has(t.text) && shown(t.families)) tables.add({ item: t, rank: nameRank(t.key) })

  const columns = ranked<IndexedColumn>()
  for (const c of index.columns) if (has(c.text) && shown(c.families)) columns.add({ item: c, rank: nameRank(c.key) })

  const forms = ranked<IndexedForm>()
  for (const f of index.forms) if (has(f.text) && shown(f.families)) forms.add({ item: f, rank: nameRank(f.key) })

  return { apis: apis.list(), fields: fields.list(), tables: tables.list(), columns: columns.list(), forms: forms.list(), hidden }
}

// ---------- Did you mean ----------

/** Below this many results, close real words are offered. */
export const FEW_RESULTS = 5
const MAX_SUGGESTIONS = 5

/** The fewest single-letter changes (add, remove, swap two neighbours, or change one) from a to b, or more than `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let before: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1)
      current.push(d)
      best = Math.min(best, d)
    }
    if (best > max) return max + 1
    before = previous
    previous = current
  }
  return previous[b.length]
}

/**
 * Up to 5 searches to try instead: each typed word that isn't part of any word in the catalog is swapped for close
 * real words (1 change for words under 6 letters, 2 from 6), the closest and most common first.
 */
export function suggestions(index: SearchIndex, query: string): string[] {
  const words = queryWords(query)
  const known = [...index.words.keys()]
  // For each word, the real words close to it; none for a word that's fine as it is.
  const choices = words.map((w) => {
    if (known.some((k) => k.includes(w))) return []
    const max = w.length >= 6 ? 2 : 1
    return known
      .map((k) => ({ k, d: editDistance(w, k, max) }))
      .filter((c) => c.d <= max)
      .sort((a, b) => a.d - b.d || index.words.get(b.k)! - index.words.get(a.k)! || (a.k < b.k ? -1 : 1))
      .map((c) => c.k)
  })
  const first = choices.findIndex((c) => c.length > 0)
  if (first === -1) return []
  // The first word needing help gets its choices; any others take their best (or stay as typed).
  return choices[first]
    .slice(0, MAX_SUGGESTIONS)
    .map((choice) => words.map((w, i) => (i === first ? choice : (choices[i][0] ?? w))).join(" "))
}
