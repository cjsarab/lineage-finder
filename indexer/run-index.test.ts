import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { writeZip, zippedTestCatalog } from "./test-support/zip-catalog.ts"
import {
  defaultThreads,
  INDEX_FORMAT,
  readFields,
  readForm,
  readFormList,
  readIndex,
  readIndexInfo,
  readParameters,
  readTableList,
  runIndex,
  SEARCH_FILE,
  type IndexFiles,
  type Stage,
} from "./run-index.ts"

// The made-up catalog in Ellucian's shape: three zips, families at three depths (test-support/zip-catalog.ts).
const catalog = zippedTestCatalog()
afterAll(() => fs.rmSync(catalog, { recursive: true, force: true }))

describe("runIndex on the made-up catalog", () => {
  let dataDir: string
  let index: IndexFiles

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-index-"))
    await runIndex({ catalog, dataDir, threads: 2 })
    const read = readIndex(dataDir)
    if (!read) throw new Error("no index written")
    index = read
    return () => fs.rmSync(dataDir, { recursive: true, force: true })
  })

  const api = (id: string) => index.apis.find((a) => a.id === id)
  const version = (id: string, v: string | null) => api(id)?.versions.find((x) => x.version === v)

  it("counts everything in the summary", () => {
    expect(index.info.counts).toEqual({
      families: 5,
      specFiles: 21,
      apis: 18,
      versions: 21,
      banner: 19,
      colleague: 2,
      beta: 2,
      deprecated: 1,
      sunset: 1,
      secondReader: 1,
      repeatedKey: 1,
      nested: 1,
      dotFolders: 1,
      versionDiffers: 1,
      unreadable: 2,
      noSpec: 0,
      extraYaml: 0,
      noFolderVersion: 1,
    })
  })

  it("groups versions into APIs by family and name, in version order", () => {
    expect(api("BannerWidgetAPIs/widgets")?.versions.map((v) => v.version)).toEqual(["1.2.0", "1.10.0", "2.0.0"])
    expect(api("BannerWidgetAPIs/widgets")).toMatchObject({ family: "BannerWidgetAPIs", name: "widgets", product: "banner" })
  })

  it("keeps the same name in two families as two APIs", () => {
    expect(api("ColleagueWidgetAPIs/widgets")).toMatchObject({ product: "colleague" })
    expect(api("ColleagueWidgetAPIs/widgets")?.versions).toHaveLength(1)
  })

  it("stores each version's details and methods", () => {
    const v = version("BannerWidgetAPIs/widgets", "1.2.0")
    expect(v).toMatchObject({ folder: "widgets-1.2.0", specFile: "widgets.yaml", read: "ok", problem: null })
    expect(v?.details).toMatchObject({ title: "widgets", sourceName: "SWAWIDG" })
    expect(v?.details?.methods).toHaveLength(5)
  })

  it("shows the folder's version, with the spec's own number kept where it differs", () => {
    expect(version("BannerWidgetAPIs/levers", "1.1.0")?.details).toMatchObject({ specVersion: "1.0.0", versionDiffers: true })
    expect(api("BannerWidgetAPIs/levers")?.versions.map((v) => v.version)).toEqual(["1.0.0", "1.1.0"])
  })

  it("reads every zip's families, however deep they sit, keeping paths without the zip's own folders", () => {
    expect(version("BannerBusAPIs/widget-types", "1.0.0")).toMatchObject({ relDir: "BannerBusAPIs/widget-types-1.0.0", zip: "production_API_catalog_A_B.zip", read: "ok" })
    expect(version("ColleagueBusAPIs/intake", "1.0.0")).toMatchObject({ relDir: "ColleagueBusAPIs/intake-1.0.0", zip: "production_API_catalog_C.zip", read: "ok" })
    expect(version("BannerWidgetAPIs/widgets", "1.2.0")).toMatchObject({ relDir: "BannerWidgetAPIs/widgets-1.2.0", zip: "production_API_catalog_W.zip" })
  })

  it("indexes the misplaced API under its own name, flagged", () => {
    expect(version("BannerWidgetAPIs/springs", "1.0.0")).toMatchObject({ nestedIn: "hinges-1.0.0" })
  })

  it("keeps an unreadable version in the index, with the reason, and reads the rest", () => {
    expect(version("BannerWidgetAPIs/blanks", "1.0.0")).toMatchObject({ read: "unreadable", problem: "empty file", details: null })
    expect(version("BannerWidgetAPIs/broken", "1.0.0")).toMatchObject({ read: "unreadable", details: null })
  })

  it("lists by name every file that needed care", () => {
    const care = index.info.care
    expect(care.unreadable.map((u) => u.file)).toEqual([
      "BannerWidgetAPIs/blanks-1.0.0/blanks.yaml",
      "BannerWidgetAPIs/broken-1.0.0/broken.yaml",
    ])
    expect(care.secondReader).toEqual(["BannerWidgetAPIs/pulleys-1.0.0/pulleys.yaml"])
    expect(care.repeatedKey).toEqual(["BannerWidgetAPIs/ratchets-1.0.0/ratchets.yaml"])
    expect(care.nested).toEqual(["BannerWidgetAPIs/hinges-1.0.0/springs-1.0.0"])
    expect(care.dotFolders).toEqual(["BannerWidgetAPIs/gizmos.2.0.0"])
    expect(care.noFolderVersion).toEqual(["BannerWidgetAPIs/oddments"])
    expect(care.versionDiffers).toEqual([
      { folder: "BannerWidgetAPIs/levers-1.1.0", folderVersion: "1.1.0", specVersion: "1.0.0" },
    ])
  })

  it("counts each family's APIs and versions, for the first-run summary", () => {
    expect(index.info.families).toEqual([
      { name: "BannerBusAPIs", product: "banner", apis: 2, versions: 2 },
      { name: "BannerErpAPIs", product: "banner", apis: 1, versions: 1 },
      { name: "BannerWidgetAPIs", product: "banner", apis: 13, versions: 16 },
      { name: "ColleagueBusAPIs", product: "colleague", apis: 1, versions: 1 },
      { name: "ColleagueWidgetAPIs", product: "colleague", apis: 1, versions: 1 },
    ])
  })

  it("keeps each method's parameters in parameters.json, by API and version folder, not in apis.json", () => {
    const widgets = readParameters(dataDir, "BannerWidgetAPIs/widgets")
    expect(Object.keys(widgets)).toEqual(["widgets-1.2.0"])
    expect(widgets["widgets-1.2.0"].map((m) => `${m.method} ${m.path} ${m.parameters.length}`)).toEqual([
      "GET /api/widgets 4",
      "POST /api/widgets 1",
      "PUT /api/widgets/{id} 1",
    ])
    expect(readParameters(dataDir, "BannerWidgetAPIs/cogs")).toEqual({})
    expect(readParameters(dataDir, "constructor")).toEqual({})
    expect(fs.readFileSync(path.join(dataDir, "index", "apis.json"), "utf8")).not.toContain("criteria")
  })

  it("keeps each version's fields and lineage in fields.json, with tables worked out across the whole catalog", () => {
    const sprockets = readFields(dataDir, "BannerWidgetAPIs/sprockets")["sprockets-1.0.0"]
    const value = (name: string) => sprockets.fields.find((f) => f.name === name)?.values
    expect(value("code")).toEqual([{ kind: "ref", text: "SWBSPRK_CODE", places: [{ table: "SWBSPRK", column: "SWBSPRK_CODE" }] }])
    expect(value("title")?.[0].places).toEqual([{ table: "SWBSPRK", column: "SWBSPRK_TITLE", probable: true }])
    expect(value("batch")?.[0].places).toBeUndefined()
    expect(value("preference")?.[0].note).toBe("unsupported")
    expect(sprockets.other.map((o) => o.schema)).toEqual(["OldSprocket"])
    const colleague = readFields(dataDir, "ColleagueWidgetAPIs/widgets")["widgets-1.0.0"]
    expect(colleague.fields[1].values?.[0].places).toEqual([{ table: "WIDGET", column: "CODE" }])
    expect(fs.readFileSync(path.join(dataDir, "index", "apis.json"), "utf8")).not.toContain("SWBSPRK_CODE")
  })

  it("writes search.json: fields merged across versions, and tables with their columns; descriptions apart", () => {
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dataDir, "index", name), "utf8"))
    const search = read("search.json")
    expect(search.format).toBe(INDEX_FORMAT)
    const levers = search.apis.find((a: { id: string }) => a.id === "BannerWidgetAPIs/levers")
    expect(levers.fields.map((f: { path: string; v: number[] }) => `${f.path} ${f.v.join(",")}`)).toEqual(["code 0,1", "handle 0"])
    expect(search.tables.find((t: { name: string }) => t.name === "SWBLEVR").columns.map((c: { name: string }) => c.name)).toEqual(["SWBLEVR_CODE", "SWBLEVR_HANDLE"])
    expect(read("search-descriptions.json").apis["BannerWidgetAPIs/levers"]).toEqual(["The lever's code. Newer words.", null])
    // Descriptions stay out of the files the API page reads.
    expect(fs.readFileSync(path.join(dataDir, "index", "fields.json"), "utf8")).not.toContain("lever's code")
  })

  it("keeps each version's base tables in apis.json: one per table, A–Z, screen blocks and forms left out (steps 12a, 12c)", () => {
    expect(version("BannerWidgetAPIs/flanges", "1.0.0")?.baseTables).toEqual(["SWBFLNG", "SWRFLDT"])
    expect(version("BannerWidgetAPIs/sprockets", "1.0.0")?.baseTables).toEqual(["SWBSPRK"])
    expect(version("BannerWidgetAPIs/cogs", "1.0.0")?.baseTables).toEqual([])
  })

  it("doesn't let a base table make camelCase field names into its columns (it may be a form's name)", () => {
    const flanges = readFields(dataDir, "BannerWidgetAPIs/flanges")["flanges-1.0.0"]
    expect(flanges.fields.find((f) => f.name === "formCode")?.values).toEqual([{ kind: "ref", text: "swaflngCode" }])
  })

  it("works out parameters' tables and columns with the same rules as fields", () => {
    const [get] = readParameters(dataDir, "BannerWidgetAPIs/flanges")["flanges-1.0.0"]
    const values = (name: string) => get.parameters.find((p) => p.name === name)?.values
    expect(values("code")).toEqual([{ kind: "ref", text: "SWBFLNG_CODE", places: [{ table: "SWBFLNG", column: "SWBFLNG_CODE" }] }])
    expect(values("ownerTitle")?.[0].places).toEqual([{ table: "SWBFLNG", column: "SWBFLNG_TITLE", probable: true }])
    expect(values("typeFlag")).toEqual([{ kind: "ref", text: "TYPE_IND" }])
    // A query parameter's lookup links as a field's does; no lineage names SWVSIZE, so lookups alone list it.
    expect(values("size")).toEqual([{ kind: "lookup", text: "SWVSIZE", links: [{ at: 0, length: 7, table: "SWVSIZE" }] }])
    expect(values("limit")).toBeUndefined()
  })

  it("puts base tables and parameters on the table pages", () => {
    const tables = JSON.parse(fs.readFileSync(path.join(dataDir, "index", "tables.json"), "utf8")).tables
    expect(tables["Banner/SWRFLDT"].apis).toEqual([{ id: "BannerWidgetAPIs/flanges", base: true, fields: [] }])
    expect(tables["Banner/SWBFLNG"].apis).toEqual([
      {
        id: "BannerWidgetAPIs/flanges",
        base: true,
        fields: [
          { path: "code", column: "SWBFLNG_CODE" },
          { path: "code", column: "SWBFLNG_CODE", parameter: true },
          { path: "ownerTitle", column: "SWBFLNG_TITLE", probable: true, parameter: true },
        ],
      },
    ])
    expect(tables["Banner/KEY"]).toBeUndefined()
  })

  it("notes the forms each version works through in apis.json", () => {
    expect(version("BannerBusAPIs/widget-requests", "1.0.0")?.forms).toEqual(["SWAWIDG"])
    expect(version("BannerBusAPIs/widget-types", "1.0.0")?.forms).toEqual(["SWVWTYP"])
    expect(version("BannerErpAPIs/widget-summary", "1.0.0")?.forms).toEqual(["SWAWIDG", "SWIWINQ"])
    expect(version("ColleagueBusAPIs/intake", "1.0.0")?.forms).toEqual(["WDG001"])
    expect(version("BannerWidgetAPIs/widgets", "1.2.0")?.forms).toEqual([])
  })

  it("writes forms.json: the list, and each form's page", () => {
    expect(readFormList(dataDir).map((f) => `${f.product}/${f.code} ${f.apis.length}${f.table ? " table" : ""}`)).toEqual([
      "Banner/SWAWIDG 2",
      "Banner/SWIWINQ 1",
      "Banner/SWVWTYP 1 table",
      "Colleague/WDG001 1",
    ])
    expect(readForm(dataDir, "Banner", "SWAWIDG")).toEqual({
      product: "Banner",
      code: "SWAWIDG",
      title: "Widget Maintenance",
      titles: [],
      apis: [
        { id: "BannerBusAPIs/widget-requests", versions: ["1.0.0"], baseTables: ["SWBWREQ"] },
        { id: "BannerErpAPIs/widget-summary", versions: ["1.0.0"], baseTables: [], source: "SWAWIDG, SWBWREQ and SWIWINQ" },
      ],
    })
    expect(readForm(dataDir, "Banner", "SWBWREQ")).toBeNull()
    expect(readForm(dataDir, "Banner", "constructor")).toBeNull()
  })

  it("flags query parameters from the form's key block, keeping the catalog's required", () => {
    const [get] = readParameters(dataDir, "BannerBusAPIs/widget-requests")["widget-requests-1.0.0"]
    expect(get.parameters.map((p) => `${p.name} ${p.required}${p.formKey ? " key" : ""}`)).toEqual(["id false key", "termCode false key", "status true"])
  })

  it("shows a form's name, its key block and guesses from it as written, and keeps them off the tables list", () => {
    const request = readFields(dataDir, "BannerBusAPIs/widget-requests")["widget-requests-1.0.0"]
    const value = (name: string) => request.fields.find((f) => f.name === name)?.values
    expect(value("course")).toEqual([{ kind: "ref", text: "SWACRSE_CRSE_NUMB" }])
    expect(value("keys")).toEqual([{ kind: "ref", text: "SWAWIDG_KEY_BLOCK" }])
    expect(value("termEff")).toEqual([{ kind: "ref", text: "swawidgTermEff" }])
    const names = readTableList(dataDir).map((t) => t.name)
    expect(names).toContain("SWBWREQ")
    expect(names).not.toContain("SWAWIDG")
    expect(names).not.toContain("SWACRSE")
    expect(names).not.toContain("SWAFLNG")
  })

  it("links the names in lookups and derived logic, keeping the text as written", () => {
    const request = readFields(dataDir, "BannerBusAPIs/widget-requests")["widget-requests-1.0.0"]
    const links = (name: string, kind: "lookup" | "derived" = "lookup") => {
      const value = request.fields.find((f) => f.name === name)?.values?.find((v) => v.kind === kind)
      return (value?.links ?? []).map((l) => `${value!.text.slice(l.at, l.at + l.length)} → ${l.column ?? l.table ?? l.form ?? l.api}`)
    }
    expect(links("term")).toEqual(["sxvterm → SXVTERM"])
    expect(links("types")).toEqual(["sxvterm → SXVTERM", "swvwtyp → SWVWTYP"])
    expect(links("page")).toEqual(["SWAWIDG → SWAWIDG"])
    expect(links("widgetType")).toEqual(["widget-types → BannerBusAPIs/widget-types"])
    expect(links("sprocket")).toEqual(["sprockets → BannerWidgetAPIs/sprockets"])
    expect(links("parameter")).toEqual(["SWBPVAL → SWBPVAL"])
    expect(links("checked")).toEqual(["sxvterm_code → SXVTERM_CODE", "sxvterm → SXVTERM"])
    expect(links("fee", "derived")).toEqual(["SXVTERM_CODE → SXVTERM_CODE", "SWBWREQ → SWBWREQ", "SWBPVAL → SWBPVAL"])
    // The Table and Column cells don't change: a lookup isn't where the field is kept.
    expect(request.fields.find((f) => f.name === "term")?.values?.map((v) => v.places)).toEqual([[{ table: "SWBWREQ", column: "SWBWREQ_TERM_CODE" }], undefined])
    const colleague = readFields(dataDir, "ColleagueWidgetAPIs/widgets")["widgets-1.0.0"].fields.find((f) => f.name === "kind")?.values
    expect(colleague?.map((v) => `${v.kind} ${v.links?.length ?? 0}`)).toEqual(["lookup 1", "derived 0"])
  })

  it("puts lookups and derived logic on the table pages, and lists tables only lookups name", () => {
    const tables = JSON.parse(fs.readFileSync(path.join(dataDir, "index", "tables.json"), "utf8")).tables
    expect(tables["Banner/SXVTERM"].apis.map((a: { id: string; fields: { path: string; via?: string }[] }) => `${a.id}: ${a.fields.map((f) => `${f.path} ${f.via ?? "lineage"}`).join(", ")}`)).toEqual([
      "BannerBusAPIs/widget-requests: checked lookup, term lookup, types lookup, fee derived",
      "BannerBusAPIs/widget-types: term lineage",
    ])
    const list = readTableList(dataDir)
    expect(list.find((t) => t.name === "SXVTERM")?.apis).toEqual(["BannerBusAPIs/widget-types"])
    expect(list.find((t) => t.name === "SWBPVAL")).toMatchObject({ apis: ["BannerBusAPIs/widget-requests"], lookupsOnly: true })
    // Not tables: a form's on-screen item, a word written alone, and guesses from them.
    const names = list.map((t) => t.name)
    expect(names).not.toContain("DISPLAY")
    expect(names).not.toContain("AMOUNT")
    expect(readFields(dataDir, "BannerBusAPIs/widget-requests")["widget-requests-1.0.0"].fields.find((f) => f.name === "displayOptions")?.values).toEqual([
      { kind: "ref", text: "displayOptions" },
    ])
  })

  it("leaves the links out of search.json: search matches the text", () => {
    expect(fs.readFileSync(path.join(dataDir, "index", SEARCH_FILE), "utf8")).not.toContain('"links"')
  })

  it("puts the forms in search.json, with their titles", () => {
    const search = JSON.parse(fs.readFileSync(path.join(dataDir, "index", SEARCH_FILE), "utf8"))
    expect(search.forms).toContainEqual({ product: "Banner", code: "SWVWTYP", title: null, apis: ["BannerBusAPIs/widget-types"] })
    expect(search.forms).toContainEqual({ product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueBusAPIs/intake"] })
  })

  it("counts each version's fields with lineage, for the list", () => {
    expect(version("BannerWidgetAPIs/sprockets", "1.0.0")?.lineage).toEqual({ fields: 17, withLineage: 14, unsupported: 1 })
    expect(version("BannerWidgetAPIs/cogs", "1.0.0")?.lineage).toEqual({ fields: 0, withLineage: 0, unsupported: 0 })
  })

  it("records when, from where and how", () => {
    expect(index.info).toMatchObject({ format: INDEX_FORMAT, catalog, threads: 2 })
    expect(Date.parse(index.info.builtAt)).not.toBeNaN()
    expect(index.info.seconds).toBeGreaterThan(0)
  })
})

describe("safe writing", () => {
  let dataDir: string
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-index-"))
  })
  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }))

  const leftovers = () => fs.readdirSync(dataDir).filter((n) => n !== "index")

  it("leaves the previous index untouched when indexing is interrupted", async () => {
    await runIndex({ catalog, dataDir, threads: 2 })
    const before = readIndex(dataDir)?.info.builtAt

    const controller = new AbortController()
    const run = runIndex({
      catalog,
      dataDir,
      threads: 2,
      signal: controller.signal,
      onProgress: (done) => {
        if (done === 3) controller.abort()
      },
    })
    await expect(run).rejects.toThrow(/stopped/i)
    expect(readIndex(dataDir)?.info.builtAt).toBe(before)
    expect(leftovers()).toEqual([])
  })

  it("replaces the previous index once a new one is complete", async () => {
    await runIndex({ catalog, dataDir, threads: 1 })
    const first = readIndex(dataDir)?.info.builtAt
    await new Promise((r) => setTimeout(r, 5))
    await runIndex({ catalog, dataDir, threads: 1 })
    expect(readIndex(dataDir)?.info.builtAt).not.toBe(first)
    expect(leftovers()).toEqual([])
  })

  it("stops with the zip's name when a zip can't be unpacked, leaving the previous index untouched", async () => {
    await runIndex({ catalog, dataDir, threads: 1 })
    const before = readIndex(dataDir)?.info.builtAt
    // A zip whose list of files is fine but whose contents are garbage, as a damaged download could be.
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-zips-"))
    writeZip(path.join(broken, "production_API_catalog_A_B.zip"), { "WidgetAPIs/widgets-1.0.0/widgets.yaml": "openapi: 3.0.0\n".repeat(50) })
    const file = path.join(broken, "production_API_catalog_A_B.zip")
    const bytes = fs.readFileSync(file)
    bytes.fill(0xff, 70, 80) // inside the packed spec: after the 30-byte header and the 37-character name
    fs.writeFileSync(file, bytes)
    try {
      await expect(runIndex({ catalog: broken, dataDir, threads: 1 })).rejects.toThrow("production_API_catalog_A_B.zip can't be opened. Download it again.")
      expect(readIndex(dataDir)?.info.builtAt).toBe(before)
      expect(leftovers()).toEqual([])
    } finally {
      fs.rmSync(broken, { recursive: true, force: true })
    }
  })

  it("clears away a half-written index left by an earlier crash", async () => {
    fs.mkdirSync(path.join(dataDir, "index.tmp-12345"))
    await runIndex({ catalog, dataDir, threads: 1 })
    expect(leftovers()).toEqual([])
  })

  it("reports progress up to the total", async () => {
    const seen: [number, number][] = []
    await runIndex({ catalog, dataDir, threads: 2, onProgress: (done, total) => seen.push([done, total]) })
    expect(seen.at(-1)).toEqual([21, 21])
  })

  it("says which stage it's in, in order", async () => {
    const stages: Stage[] = []
    await runIndex({ catalog, dataDir, threads: 1, onStage: (s) => stages.push(s) })
    expect(stages).toEqual(["finding", "reading", "writing"])
  })
})

describe("defaultThreads", () => {
  it("leaves one CPU thread for the rest of the computer", () => {
    expect(defaultThreads(4)).toBe(3)
    expect(defaultThreads(1)).toBe(1)
  })

  it("stops at 6, where more threads only add memory", () => {
    expect(defaultThreads(12)).toBe(6)
    expect(defaultThreads(32)).toBe(6)
  })
})

describe("readIndex", () => {
  let dataDir: string
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-index-"))
  })
  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }))

  it("gives nothing when there is no index yet", () => {
    expect(readIndex(dataDir)).toBeNull()
  })

  it("gives nothing for an index in an older format, so it gets rebuilt", async () => {
    await runIndex({ catalog, dataDir, threads: 1 })
    const infoFile = path.join(dataDir, "index", "index-info.json")
    const info = JSON.parse(fs.readFileSync(infoFile, "utf8"))
    fs.writeFileSync(infoFile, JSON.stringify({ ...info, format: INDEX_FORMAT - 1 }))
    expect(readIndex(dataDir)).toBeNull()
    expect(readIndexInfo(dataDir)).toEqual({ state: "outdated" })
  })

  it("tells missing, outdated and ready apart from the small summary file alone", async () => {
    expect(readIndexInfo(dataDir)).toEqual({ state: "missing" })
    await runIndex({ catalog, dataDir, threads: 1 })
    expect(readIndexInfo(dataDir)).toMatchObject({ state: "ready", info: { format: INDEX_FORMAT } })
  })
})
