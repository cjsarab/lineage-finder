// Reads the whole catalog on several threads and writes the index.
// The new index is written to a temporary folder and only swapped in once complete, so an interrupted or
// failed run leaves the previous index untouched.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Worker } from "node:worker_threads"
import type { Details, MethodParameters } from "./extract.ts"
import { coverage, makeLinker, makeResolver, type Coverage, type Field, type RawValue, type Value } from "./lineage.ts"
import { compareVersions, listCatalog, productOf, type FolderEntry, type Product } from "./folders.ts"
import { CATALOG_FILES, catalogFilesOf, type CatalogFiles } from "./catalog-files.ts"
import { CatalogZipError, findCatalog, unpackTexts } from "./catalog-zips.ts"
import { buildChanges, CHANGES_FILE, type ChangesFile, type LastRead, type Read } from "./changes.ts"
import { buildForms, formKey, recogniseForms, type FormDetail, type Forms, type FormSummary } from "./forms.ts"
import { productOfFamily } from "./products.ts"
import { buildSearch, type DescribedField, type SearchDescriptions, type SearchFile } from "./search.ts"
import { buildTables, tableKey, type TableDetail, type Tables, type TableSummary } from "./tables.ts"
import type { Job, JobResult } from "./worker.ts"

/** Bump when the index's shape changes, so an older index is rebuilt rather than misread. */
// 2: `families` added to index-info.json for the first-run summary.
// 3: each version's `mediaTypes`, and parameters.json with each method's parameters.
// 4: fields.json with each version's fields and lineage, and each version's `lineage` counts.
// 5: tables.json with every table, its columns and the APIs and fields using it.
// 6: search.json with every field merged across versions, and every table's columns;
//   search-descriptions.json with the fields' descriptions.
// 7: each version's `baseTables`; each parameter's lineage in parameters.json; base tables and
//   parameters in tables.json.
// 8: forms.json; each version's `forms`; key-block parameters' `formKey`; forms in search.json;
//   forms' names, key and control blocks no longer tables.
// 9: lookups' and derived logic's `links`; table uses `via` a lookup or derived logic; tables
//   only lookups name (`lookupsOnly`); a form's on-screen items and words no longer tables.
// 10: read from Ellucian's zips; each version's `zip`; catalog-files.json lists the specs in the
//   zips with their checksums.
export const INDEX_FORMAT = 10

export interface ApiVersion {
  /** The folder's version: the one shown. Null only if the folder name has none. */
  version: string | null
  folder: string
  relDir: string
  specFile: string | null
  nestedIn: string | null
  /** The zip it was read from, e.g. "production_API_catalog_A_B.zip". */
  zip: string
  /** How the spec was read; null if the folder has no YAML file. */
  read: JobResult["read"] | null
  problem: string | null
  details: Details | null
  /** How many of its fields have lineage; null if the spec couldn't be read. */
  lineage: Coverage | null
  /** Its base tables, A–Z: usually one, sometimes two or three. */
  baseTables: string[]
  /** The forms it works through: one for a Business API, sometimes several for ERP. */
  forms: string[]
}

export interface Api {
  /** Family + name, e.g. "BannerWidgetAPIs/widgets": the same name in two families is two APIs. */
  id: string
  family: string
  name: string
  product: Product
  versions: ApiVersion[]
}

export interface Counts {
  families: number
  specFiles: number
  apis: number
  versions: number
  banner: number
  colleague: number
  beta: number
  deprecated: number
  sunset: number
  secondReader: number
  repeatedKey: number
  nested: number
  dotFolders: number
  versionDiffers: number
  unreadable: number
  noSpec: number
  extraYaml: number
  noFolderVersion: number
}

export interface Care {
  secondReader: string[]
  repeatedKey: string[]
  nested: string[]
  dotFolders: string[]
  versionDiffers: { folder: string; folderVersion: string; specVersion: string }[]
  unreadable: { file: string; reason: string }[]
  noSpec: string[]
  extraYaml: string[]
  noFolderVersion: string[]
}

export interface FamilyCount {
  name: string
  product: Product
  apis: number
  versions: number
}

export interface IndexInfo {
  format: number
  builtAt: string
  catalog: string
  seconds: number
  threads: number
  counts: Counts
  /** Every family with its number of APIs and versions, in name order. */
  families: FamilyCount[]
  care: Care
}

/** parameters.json: by API id, then by version folder, the methods that have parameters. */
export type ParametersByApi = Record<string, Record<string, MethodParameters[]>>

/** One version's fields with their lineage. */
export interface VersionFields {
  fields: Field[]
  /** Schemas no method uses that hold lineage, shown folded at the end. */
  other: { schema: string; fields: Field[] }[]
}

/** fields.json: by API id, then by version folder. */
export type FieldsByApi = Record<string, Record<string, VersionFields>>

export interface IndexFiles {
  info: IndexInfo
  apis: Api[]
}

export interface RunOptions {
  catalog: string
  dataDir: string
  threads?: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  /** Called as each stage starts: finding the spec files, reading them, writing the index. */
  onStage?: (stage: Stage) => void
}

export type Stage = "finding" | "reading" | "comparing" | "writing"

// One per CPU thread, leaving one for the rest of the computer, up to 6. Measured on the whole catalog
// (12 CPU threads): 1 thread 96 s / 284 MB, 4 threads 34 s / 813 MB, 6 threads 28 s / 1.1 GB,
// 11 threads 28 s / 1.9 GB. Each thread holds its own parsed files, so beyond 6 only memory grows.
const MAX_DEFAULT_THREADS = 6
export const defaultThreads = (cpuThreads = os.availableParallelism()) =>
  Math.max(1, Math.min(MAX_DEFAULT_THREADS, cpuThreads - 1))

export async function runIndex(options: RunOptions): Promise<IndexInfo> {
  const started = performance.now()
  const catalog = path.resolve(options.catalog)
  clearLeftovers(options.dataDir)

  options.onStage?.("finding")
  // The zips' lists of files, read once: the files saved for the start-up check come from the same list as what's read.
  const found = findCatalog(catalog)
  const catalogFiles = catalogFilesOf(found)
  const entries = listCatalog(found)
  // In zip order, so each zip is unpacked once.
  const jobs: SpecInZip[] = entries
    .flatMap((e, id) => (e.specInZip ? [{ id, zip: e.zip, name: e.specInZip, folderVersion: e.version }] : []))
    .sort((a, b) => (a.zip < b.zip ? -1 : a.zip > b.zip ? 1 : a.id - b.id))
  const threads = Math.max(1, Math.min(options.threads ?? defaultThreads(), jobs.length))
  if (options.signal?.aborted) throw stopped()
  options.onStage?.("reading")
  const results = await readAll(jobs, unpacker(catalog, jobs), threads, options)

  const { fields, described, coverages, baseTables, parameters } = resolveLineage(entries, results)
  const versions = entries.map((e, id) => toVersion(e, results.get(id), coverages.get(id) ?? null, baseTables.get(id) ?? []))
  recogniseForms(entries.map((e, i) => ({ family: e.family, details: versions[i].details }))).forEach((forms, i) => (versions[i].forms = forms))
  const apis = groupApis(entries, versions)
  linkLookupsAndDerived(apis, fields, parameters)
  const tables = buildTables(
    apis.map((a) => ({
      id: a.id,
      family: a.family,
      folders: a.versions.map((v) => v.folder),
      fields: fields[a.id] ?? {},
      parameters: parameters[a.id] ?? {},
      baseTables: Object.fromEntries(a.versions.map((v) => [v.folder, v.baseTables])),
    })),
  )
  const forms = buildForms(apis.map((a) => ({ id: a.id, family: a.family, versions: a.versions })), tables)
  const search = buildSearch(apis.map((a) => ({ id: a.id, folders: a.versions.map((v) => v.folder), fields: described[a.id] ?? {} })), tables, forms)
  const info: IndexInfo = {
    format: INDEX_FORMAT,
    builtAt: new Date().toISOString(),
    catalog,
    seconds: (performance.now() - started) / 1000,
    threads,
    counts: countAll(entries, versions, apis.length),
    families: familyCounts(apis),
    care: careList(entries, versions),
  }
  if (options.signal?.aborted) throw stopped()
  // What changed since the last read, while the old index is still there.
  let changes: ChangesFile | null = null
  if (fs.existsSync(path.join(indexDir(options.dataDir), "index-info.json"))) {
    options.onStage?.("comparing")
    changes = compareWithLastRead(options.dataDir, { lastRead: { builtAt: info.builtAt, catalog }, apis, parameters, fields })
  }
  if (options.signal?.aborted) throw stopped()
  options.onStage?.("writing")
  writeSafely(options.dataDir, info, apis, parameters, fields, tables, forms, search, catalogFiles, changes)
  return info
}

/** The last read compared with this one; never throws, as a failure to compare mustn't lose the new index. */
function compareWithLastRead(dataDir: string, now: Read): ChangesFile {
  const dir = indexDir(dataDir)
  const json = <T,>(name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T
  let lastRead: LastRead | null = null
  try {
    const info = json<IndexInfo>("index-info.json")
    if (info.format !== INDEX_FORMAT) return { changes: { outcome: "not-comparable" }, was: {} }
    lastRead = { builtAt: info.builtAt, catalog: info.catalog }
    const last: Read = {
      lastRead,
      apis: json<{ apis: Api[] }>("apis.json").apis,
      parameters: json<{ apis: ParametersByApi }>("parameters.json").apis,
      fields: json<{ apis: FieldsByApi }>("fields.json").apis,
    }
    return buildChanges(last, now)
  } catch (e) {
    return { changes: { outcome: "failed", lastRead, message: (e as Error).message }, was: {} }
  }
}

function stopped() {
  return new Error("Indexing stopped before it finished. The previous index (if any) is untouched.")
}

interface SpecInZip {
  id: number
  zip: string
  /** Its path inside the zip. */
  name: string
  folderVersion: string | null
}

/**
 * The spec's text, for a reading thread. Unpacks one zip at a time as the threads reach it, and lets each text go
 * once handed over.
 */
function unpacker(catalog: string, jobs: SpecInZip[]): (spec: SpecInZip) => Job {
  let current: { zip: string; texts: Map<string, string> } | null = null
  return (spec) => {
    if (current?.zip !== spec.zip) {
      current = null // the previous zip's texts can go before the next is unpacked
      const names = jobs.filter((j) => j.zip === spec.zip).map((j) => j.name)
      current = { zip: spec.zip, texts: unpackTexts(path.join(catalog, spec.zip), names) }
    }
    const text = current.texts.get(spec.name)
    if (text === undefined) throw new CatalogZipError({ kind: "damaged", zip: spec.zip })
    current.texts.delete(spec.name)
    return { id: spec.id, text, folderVersion: spec.folderVersion }
  }
}

// Hands out specs to the threads one at a time and collects what they send back.
function readAll(
  jobs: SpecInZip[],
  toJob: (spec: SpecInZip) => Job,
  threads: number,
  options: RunOptions,
): Promise<Map<number, JobResult>> {
  const results = new Map<number, JobResult>()
  if (jobs.length === 0) return Promise.resolve(results)
  if (options.signal?.aborted) return Promise.reject(stopped())

  return new Promise((resolve, reject) => {
    const workers: Worker[] = []
    let next = 0
    let finished = false

    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      options.signal?.removeEventListener("abort", onAbort)
      for (const w of workers) void w.terminate()
      if (error) reject(error)
      else resolve(results)
    }
    const onAbort = () => finish(stopped())
    options.signal?.addEventListener("abort", onAbort)

    const sendNext = (w: Worker) => {
      if (next >= jobs.length) return
      try {
        w.postMessage(toJob(jobs[next++]))
      } catch (e) {
        finish(e as Error)
      }
    }

    for (let i = 0; i < threads && !finished; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url))
      workers.push(w)
      w.on("message", (r: JobResult) => {
        if (finished) return
        results.set(r.id, r)
        options.onProgress?.(results.size, jobs.length)
        if (finished) return // onProgress may have stopped the run
        if (results.size === jobs.length) finish()
        else sendNext(w)
      })
      w.on("error", (e) => finish(new Error(`A reading thread failed: ${e.message}`)))
      sendNext(w)
    }
  })
}

/**
 * Works out tables and columns from every field's, parameter's and base table's lineage. Needs all the specs first:
 * the false-table rule and the camelCase rule look at every table in the catalog. One resolver for all three, so the
 * same rules hold across the app. Base tables don't add to the tables it knows: a few name a Banner page (a form, e.g.
 * a third letter A), which would otherwise make camelCase field names into "probable" columns of a form (41 values in
 * the whole catalog). The resolver also knows forms' names never to be tables in Banner families.
 */
function resolveLineage(entries: FolderEntry[], results: Map<number, JobResult>) {
  const refTexts: string[] = []
  const bannerRefTexts: string[] = []
  entries.forEach((e, id) => {
    const r = results.get(id)
    if (!r) return
    const into = productOfFamily(e.family).group === "Banner" ? [refTexts, bannerRefTexts] : [refTexts]
    const addRefs = (values: readonly RawValue[] | undefined) => {
      for (const v of values ?? []) if (v.kind === "ref") for (const list of into) list.push(v.text)
    }
    for (const m of r.parameters) for (const p of m.parameters) addRefs(p.values)
    if (!r.fields) return
    for (const f of [...r.fields.fields, ...r.fields.other.flatMap((o) => o.fields)]) addRefs(f.values)
  })
  const resolve = makeResolver(refTexts, bannerRefTexts)
  const fields: FieldsByApi = {}
  // The same fields with their descriptions, for search; fields.json leaves the descriptions out.
  const described: Record<string, Record<string, { fields: DescribedField[]; other: { schema: string; fields: DescribedField[] }[] }>> = {}
  const plain = (list: DescribedField[]): Field[] => list.map(({ description: _, ...f }) => f)
  const coverages = new Map<number, Coverage>()
  const baseTables = new Map<number, string[]>()
  const parameters: ParametersByApi = {}
  entries.forEach((e, id) => {
    const colleague = productOf(e.family) === "colleague"
    const banner = productOfFamily(e.family).group === "Banner"
    const methods = results.get(id)?.parameters
    if (methods?.length) {
      ;(parameters[`${e.family}/${e.name}`] ??= {})[e.folder] = methods.map((m) => ({
        ...m,
        parameters: m.parameters.map((p) => (p.values ? { ...p, values: p.values.map((v) => resolve(v, colleague, banner)) } : p)),
      }))
    }
    const raw = results.get(id)?.fields
    if (!raw) return
    const tables = new Set(raw.base.flatMap((v) => (resolve(v, colleague, banner).places ?? []).map((p) => p.table)))
    baseTables.set(id, [...tables].sort())
    const done = (list: typeof raw.fields): DescribedField[] =>
      list.map((f) => (f.values ? { ...f, values: f.values.map((v) => resolve(v, colleague, banner)) } : f))
    const full = { fields: done(raw.fields), other: raw.other.map((o) => ({ schema: o.schema, fields: done(o.fields) })) }
    const version: VersionFields = { fields: plain(full.fields), other: full.other.map((o) => ({ schema: o.schema, fields: plain(o.fields) })) }
    coverages.set(id, coverage(version.fields))
    if (version.fields.length || version.other.length) {
      ;(fields[`${e.family}/${e.name}`] ??= {})[e.folder] = version
      ;(described[`${e.family}/${e.name}`] ??= {})[e.folder] = full
    }
  })
  return { fields, described, coverages, baseTables, parameters }
}

/**
 * Links the names in every lookup and derived-logic note, in place: to the
 * tables lineage names (with their columns), forms and APIs, once all of those are known. Every lookup first, so derived
 * logic can link the tables only lookups name. The fields' search copies share these values; search leaves the links out.
 */
function linkLookupsAndDerived(apis: Api[], fields: FieldsByApi, parameters: ParametersByApi) {
  const tables = new Map<string, Set<string>>()
  const columns = new Map<string, Set<string>>()
  const forms = new Map<string, Set<string>>()
  const apisByProduct = new Map<string, string[]>()
  const add = (map: Map<string, Set<string>>, key: string, name: string) => {
    let set = map.get(key)
    if (!set) map.set(key, (set = new Set()))
    set.add(name)
  }
  // Every value with its API's product and family.
  const values: { value: Value; product: string; family: string }[] = []
  for (const api of apis) {
    const product = productOfFamily(api.family).product
    let list = apisByProduct.get(product)
    if (!list) apisByProduct.set(product, (list = []))
    list.push(api.id)
    for (const v of api.versions) {
      for (const t of v.baseTables) add(tables, product, t)
      for (const f of v.forms) add(forms, product, f)
    }
    const all = [
      ...Object.values(fields[api.id] ?? {}).flatMap((v) => [...v.fields, ...v.other.flatMap((o) => o.fields)]),
      ...Object.values(parameters[api.id] ?? {}).flatMap((methods) => methods.flatMap((m) => m.parameters)),
    ]
    for (const f of all) {
      for (const value of f.values ?? []) {
        values.push({ value, product, family: api.family })
        for (const p of value.places ?? []) {
          add(tables, product, p.table)
          if (p.column) add(columns, tableKey(product, p.table), p.column)
        }
      }
    }
  }
  const linker = makeLinker({ tables, columns, forms, apis: apisByProduct })
  const link = (kind: "lookup" | "derived") => {
    for (const { value, product, family } of values) {
      if (value.kind !== kind) continue
      const links = kind === "lookup" ? linker.lookup(value.text, product, family) : linker.derived(value.text, product)
      if (links.length) value.links = links
    }
  }
  link("lookup")
  link("derived")
}

function toVersion(e: FolderEntry, r: JobResult | undefined, lineage: Coverage | null, baseTables: string[]): ApiVersion {
  return {
    version: e.version,
    folder: e.folder,
    relDir: e.relDir,
    specFile: e.specFile,
    nestedIn: e.nestedIn,
    zip: e.zip,
    read: r?.read ?? null,
    problem: r?.problem ?? null,
    details: r?.details ?? null,
    lineage,
    baseTables,
    forms: [],
  }
}

function groupApis(entries: FolderEntry[], versions: ApiVersion[]): Api[] {
  const byId = new Map<string, Api>()
  entries.forEach((e, i) => {
    const id = `${e.family}/${e.name}`
    let api = byId.get(id)
    if (!api) byId.set(id, (api = { id, family: e.family, name: e.name, product: productOf(e.family), versions: [] }))
    api.versions.push(versions[i])
  })
  const apis = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const api of apis) {
    api.versions.sort((a, b) => (a.version == null ? 1 : b.version == null ? -1 : compareVersions(a.version, b.version)))
  }
  return apis
}

function familyCounts(apis: Api[]): FamilyCount[] {
  const byName = new Map<string, FamilyCount>()
  for (const api of apis) {
    let f = byName.get(api.family)
    if (!f) byName.set(api.family, (f = { name: api.family, product: api.product, apis: 0, versions: 0 }))
    f.apis++
    f.versions += api.versions.length
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

function countAll(entries: FolderEntry[], versions: ApiVersion[], apis: number): Counts {
  const count = (test: (e: FolderEntry, v: ApiVersion) => unknown) => entries.filter((e, i) => test(e, versions[i])).length
  return {
    families: new Set(entries.map((e) => e.family)).size,
    specFiles: count((e) => e.specFile),
    apis,
    versions: entries.length,
    banner: count((e) => productOf(e.family) === "banner"),
    colleague: count((e) => productOf(e.family) === "colleague"),
    beta: count((_, v) => v.details?.beta),
    deprecated: count((_, v) => v.details?.deprecatedOn),
    sunset: count((_, v) => v.details?.sunsetOn),
    secondReader: count((_, v) => v.read === "second-reader"),
    repeatedKey: count((_, v) => v.read === "repeated-key"),
    nested: count((e) => e.nestedIn),
    dotFolders: count((e) => e.separator === "."),
    versionDiffers: count((_, v) => v.details?.versionDiffers),
    unreadable: count((_, v) => v.read === "unreadable"),
    noSpec: count((e) => !e.specFile),
    extraYaml: count((e) => e.extraYaml.length),
    noFolderVersion: count((e) => e.version == null),
  }
}

function careList(entries: FolderEntry[], versions: ApiVersion[]): Care {
  const care: Care = {
    secondReader: [],
    repeatedKey: [],
    nested: [],
    dotFolders: [],
    versionDiffers: [],
    unreadable: [],
    noSpec: [],
    extraYaml: [],
    noFolderVersion: [],
  }
  entries.forEach((e, i) => {
    const v = versions[i]
    const file = `${e.relDir}/${e.specFile}`
    if (v.read === "second-reader") care.secondReader.push(file)
    if (v.read === "repeated-key") care.repeatedKey.push(file)
    if (v.read === "unreadable") care.unreadable.push({ file, reason: v.problem ?? "" })
    if (e.nestedIn) care.nested.push(e.relDir)
    if (e.separator === ".") care.dotFolders.push(e.relDir)
    if (!e.specFile) care.noSpec.push(e.relDir)
    if (e.extraYaml.length) care.extraYaml.push(e.relDir)
    if (e.version == null) care.noFolderVersion.push(e.relDir)
    if (v.details?.versionDiffers && e.version && v.details.specVersion) {
      care.versionDiffers.push({ folder: e.relDir, folderVersion: e.version, specVersion: v.details.specVersion })
    }
  })
  return care
}

export const indexDir = (dataDir: string) => path.join(dataDir, "index")

/** Search's files, sent to the page as they are. */
export const SEARCH_FILE = "search.json"
export const DESCRIPTIONS_FILE = "search-descriptions.json"

// Half-written or replaced indexes left behind if an earlier run was killed mid-write.
function clearLeftovers(dataDir: string) {
  if (!fs.existsSync(dataDir)) return
  for (const name of fs.readdirSync(dataDir)) {
    if (/^index\.(tmp|old)-/.test(name)) fs.rmSync(path.join(dataDir, name), { recursive: true, force: true })
  }
}

function writeSafely(
  dataDir: string,
  info: IndexInfo,
  apis: Api[],
  parameters: ParametersByApi,
  fields: FieldsByApi,
  tables: Tables,
  forms: Forms,
  search: { search: SearchFile; descriptions: SearchDescriptions },
  catalogFiles: CatalogFiles,
  changes: ChangesFile | null,
) {
  const stamp = `${process.pid}-${Date.now()}`
  const tmp = path.join(dataDir, `index.tmp-${stamp}`)
  const old = path.join(dataDir, `index.old-${stamp}`)
  const final = indexDir(dataDir)
  fs.mkdirSync(tmp, { recursive: true })
  try {
    fs.writeFileSync(path.join(tmp, "apis.json"), JSON.stringify({ format: INDEX_FORMAT, apis }))
    fs.writeFileSync(path.join(tmp, "parameters.json"), JSON.stringify({ format: INDEX_FORMAT, apis: parameters }))
    fs.writeFileSync(path.join(tmp, "fields.json"), JSON.stringify({ format: INDEX_FORMAT, apis: fields }))
    fs.writeFileSync(path.join(tmp, "tables.json"), JSON.stringify({ format: INDEX_FORMAT, ...tables }))
    fs.writeFileSync(path.join(tmp, "forms.json"), JSON.stringify({ format: INDEX_FORMAT, ...forms }))
    fs.writeFileSync(path.join(tmp, SEARCH_FILE), JSON.stringify({ format: INDEX_FORMAT, ...search.search }))
    fs.writeFileSync(path.join(tmp, DESCRIPTIONS_FILE), JSON.stringify({ format: INDEX_FORMAT, apis: search.descriptions }))
    fs.writeFileSync(path.join(tmp, CATALOG_FILES), JSON.stringify({ format: INDEX_FORMAT, files: catalogFiles }))
    if (changes) fs.writeFileSync(path.join(tmp, CHANGES_FILE), JSON.stringify({ format: INDEX_FORMAT, ...changes }))
    fs.writeFileSync(path.join(tmp, "index-info.json"), JSON.stringify(info, null, 2))
    const hadPrevious = fs.existsSync(final)
    if (hadPrevious) fs.renameSync(final, old)
    try {
      fs.renameSync(tmp, final)
    } catch (e) {
      if (hadPrevious) fs.renameSync(old, final)
      throw e
    }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw e
  }
  fs.rmSync(old, { recursive: true, force: true })
}

export type IndexState = { state: "ready"; info: IndexInfo } | { state: "outdated" } | { state: "missing" }

// Just the small summary file: is there an index, and is it in this version's format? Cheap enough to ask often.
export function readIndexInfo(dataDir: string): IndexState {
  let info: IndexInfo
  try {
    info = JSON.parse(fs.readFileSync(path.join(indexDir(dataDir), "index-info.json"), "utf8")) as IndexInfo
  } catch {
    return { state: "missing" }
  }
  return info.format === INDEX_FORMAT ? { state: "ready", info } : { state: "outdated" }
}

// The current index, or null if there is none or it's in an older format (then it must be rebuilt).
export function readIndex(dataDir: string): IndexFiles | null {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(indexDir(dataDir), "index-info.json"), "utf8")) as IndexInfo
    if (info.format !== INDEX_FORMAT) return null
    const apis = JSON.parse(fs.readFileSync(path.join(indexDir(dataDir), "apis.json"), "utf8")) as { format: number; apis: Api[] }
    if (apis.format !== INDEX_FORMAT) return null
    return { info, apis: apis.apis }
  } catch {
    return null
  }
}

/** One API's parameters, by version folder (empty if it has none, or there's no current index). */
export function readParameters(dataDir: string, apiId: string): Record<string, MethodParameters[]> {
  return readOne<MethodParameters[]>(path.join(indexDir(dataDir), "parameters.json"), apiId)
}

/** One API's fields and lineage, by version folder (empty if it has none, or there's no current index). */
export function readFields(dataDir: string, apiId: string): Record<string, VersionFields> {
  return readOne<VersionFields>(path.join(indexDir(dataDir), "fields.json"), apiId)
}

/** Every table, for the tables list; empty if there's no current index. */
export function readTableList(dataDir: string): TableSummary[] {
  return cachedFile<Tables & { format: number }>(path.join(indexDir(dataDir), "tables.json"))?.list ?? []
}

/** One table's page, or null if the index has no such table. */
export function readTable(dataDir: string, product: string, name: string): TableDetail | null {
  const tables = cachedFile<Tables & { format: number }>(path.join(indexDir(dataDir), "tables.json"))?.tables
  const key = tableKey(product, name)
  return tables && Object.hasOwn(tables, key) ? tables[key] : null
}

/** Every form, for the forms list; empty if there's no current index. */
export function readFormList(dataDir: string): FormSummary[] {
  return cachedFile<Forms & { format: number }>(path.join(indexDir(dataDir), "forms.json"))?.list ?? []
}

/** One form's page, or null if the index has no such form. */
export function readForm(dataDir: string, product: string, code: string): FormDetail | null {
  const forms = cachedFile<Forms & { format: number }>(path.join(indexDir(dataDir), "forms.json"))?.forms
  const key = formKey(product, code)
  return forms && Object.hasOwn(forms, key) ? forms[key] : null
}

/** The catalog's YAML files as they were when it was read, or null (an index made by an older version). */
export function readCatalogFiles(dataDir: string): CatalogFiles | null {
  return cachedFile<{ files: CatalogFiles }>(path.join(indexDir(dataDir), CATALOG_FILES))?.files ?? null
}

/** What changed since the read before this one, or null (a first read, or an index made by an older version). */
export function readChanges(dataDir: string): ChangesFile | null {
  return cachedFile<ChangesFile>(path.join(indexDir(dataDir), CHANGES_FILE))
}

function readOne<T>(file: string, apiId: string): Record<string, T> {
  const apis = cachedFile<{ apis: Record<string, Record<string, T>> }>(file)?.apis
  return apis && Object.hasOwn(apis, apiId) ? apis[apiId] : {}
}

// These files are several MB, so each is kept once read, until a re-index replaces it (a new file, so a new date).
const cached = new Map<string, { stamp: string; content: unknown }>()

/** The file's content if it's in this version's format, else null. */
function cachedFile<T>(file: string): T | null {
  let stamp: string
  try {
    const stat = fs.statSync(file)
    stamp = `${stat.mtimeMs} ${stat.size}`
  } catch {
    return null
  }
  const hit = cached.get(file)
  if (hit?.stamp === stamp) return hit.content as T | null
  let content: unknown = null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { format: number }
    if (parsed.format === INDEX_FORMAT) content = parsed
  } catch {
    content = null
  }
  cached.set(file, { stamp, content })
  return content as T | null
}
