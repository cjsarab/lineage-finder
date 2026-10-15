import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { INDEX_FORMAT, type IndexInfo, type RunOptions } from "../indexer/run-index.ts"
import { createApi } from "./api.ts"
import type { Status } from "./api-types.ts"
import { createIndexing } from "./indexing.ts"
import { createAppServer, listen } from "./server.ts"
import { readSettings } from "./settings.ts"
import { FIVE_ZIP_SHAPE, testCatalog, zipCatalog, zippedTestCatalog } from "../indexer/test-support/zip-catalog.ts"

// The made-up catalog as Ellucian's zips.
const catalog = zippedTestCatalog()
afterAll(() => fs.rmSync(catalog, { recursive: true, force: true }))

let tmp: string
let dataDir: string
let defaultCatalog: string
const servers: http.Server[] = []

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-api-"))
  dataDir = path.join(tmp, "data")
  defaultCatalog = path.join(tmp, "catalog-zips")
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function startApp(indexing?: Parameters<typeof createApi>[0]["indexing"]) {
  const api = createApi({ dataDir, defaultCatalog, indexing })
  const server = createAppServer(tmp, api.handle)
  servers.push(server)
  const port = await listen(server, 0)
  return { port, api }
}

function request(port: number, method: string, urlPath: string, body?: unknown, origin: string | null = `http://localhost:${port}`) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const headers: Record<string, string> = { host: `localhost:${port}`, "content-type": "application/json" }
    if (origin) headers.origin = origin
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      let text = ""
      res.on("data", (chunk) => (text += chunk))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null }))
    })
    req.on("error", reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

const getStatus = async (port: number) => (await request(port, "GET", "/api/status")).json as Status

async function waitFor(port: number, test: (s: Status) => boolean): Promise<Status> {
  for (let i = 0; i < 200; i++) {
    const s = await getStatus(port)
    if (test(s)) return s
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error("timed out waiting for the status")
}

/** A pretend indexer that runs until the test ends it (as a failure, to keep it simple) or it's stopped. */
function fakeIndexer() {
  let finish!: () => void
  const runIndex = (o: RunOptions) =>
    new Promise<IndexInfo>((_, reject) => {
      o.onStage?.("reading")
      o.onProgress?.(3, 10)
      o.signal?.addEventListener("abort", () => reject(new Error("stopped")))
      finish = () => reject(new Error("ended by the test"))
    })
  return { indexing: createIndexing({ dataDir, runIndex }), finish: () => finish() }
}

describe("status", () => {
  it("says there's no index yet, and where things are", async () => {
    const { port } = await startApp()
    expect(await getStatus(port)).toEqual({
      app: { version: expect.stringMatching(/^\d+\.\d+\.\d+$/), indexFormat: INDEX_FORMAT },
      index: { state: "missing" },
      dataDir,
      catalog: { chosen: null, default: defaultCatalog },
      run: null,
      last: null,
      catalogCheck: { state: "unknown" },
    })
  })

  it("says an index from an older version of the app is outdated", async () => {
    fs.mkdirSync(path.join(dataDir, "index"), { recursive: true })
    fs.writeFileSync(path.join(dataDir, "index", "index-info.json"), JSON.stringify({ format: INDEX_FORMAT - 1 }))
    const { port } = await startApp()
    expect((await getStatus(port)).index).toEqual({ state: "outdated" })
  })
})

describe("noticing a changed catalog, and what changed", () => {
  async function readCopy() {
    zipCatalog(defaultCatalog)
    const first = await startApp()
    await request(first.port, "POST", "/api/start-reading", { path: defaultCatalog })
    await waitFor(first.port, (s) => s.last !== null && s.catalogCheck.state !== "checking")
    return first
  }

  it("says the catalog is the same after reading it, and changed once a zip changes (at the next start)", async () => {
    const { port } = await readCopy()
    expect((await getStatus(port)).catalogCheck).toMatchObject({ state: "same" })
    fs.rmSync(path.join(defaultCatalog, "production_API_catalog_C.zip"))
    const again = await startApp()
    const s = await waitFor(again.port, (s) => s.catalogCheck.state !== "checking")
    expect(s.catalogCheck).toEqual({ state: "changed", fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/) })
  })

  it("can't tell when the catalog folder has gone", async () => {
    await readCopy()
    fs.rmSync(defaultCatalog, { recursive: true })
    const again = await startApp()
    await new Promise((r) => setTimeout(r, 300))
    expect((await getStatus(again.port)).catalogCheck).toEqual({ state: "unknown" })
  })

  it("sends what changed, and a changed API's versions as they were", async () => {
    const { port } = await readCopy()
    expect((await request(port, "GET", "/api/changes")).json).toEqual({ changes: null })
    // A new download: the same zips, one spec edited.
    const copy = path.join(tmp, "copy")
    fs.cpSync(testCatalog, copy, { recursive: true })
    const spec = path.join(copy, "BannerWidgetAPIs", "widgets-1.2.0", "widgets.yaml")
    fs.writeFileSync(spec, fs.readFileSync(spec, "utf8").replace("- name: criteria", "- name: filter"))
    zipCatalog(defaultCatalog, FIVE_ZIP_SHAPE, copy)
    await request(port, "POST", "/api/start-reading", { path: defaultCatalog })
    await waitFor(port, (s) => s.run === null && s.last !== null)
    const changes = (await request(port, "GET", "/api/changes")).json.changes
    expect(changes).toMatchObject({ outcome: "compared", changed: [{ name: "widgets", version: "1.2.0" }] })
    const was = (await request(port, "GET", "/api/changes/BannerWidgetAPIs/widgets")).json.versions
    expect(Object.keys(was)).toEqual(["widgets-1.2.0"])
    expect((await request(port, "GET", "/api/changes/BannerWidgetAPIs/gizmos")).json).toEqual({ versions: {} })
  })
})

describe("reading a catalog", () => {
  it("reads it, reports the summary, and remembers the folder", async () => {
    const { port } = await startApp()
    expect((await request(port, "POST", "/api/start-reading", { path: `"${catalog}"` })).status).toBe(202)

    const s = await waitFor(port, (s) => s.run === null && s.last !== null)
    expect(s.last).toMatchObject({ outcome: "done", summary: { apis: 18, versions: 21, specFiles: 21 } })
    expect(s.index.state).toBe("ready")
    if (s.index.state !== "ready") return
    expect(s.index.summary.families).toEqual([
      { name: "BannerBusAPIs", group: "Banner", product: "Banner", apis: 2, versions: 2 },
      { name: "BannerErpAPIs", group: "Banner", product: "Banner", apis: 1, versions: 1 },
      { name: "BannerWidgetAPIs", group: "Banner", product: "Banner", apis: 13, versions: 16 },
      { name: "ColleagueBusAPIs", group: "Colleague", product: "Colleague", apis: 1, versions: 1 },
      { name: "ColleagueWidgetAPIs", group: "Colleague", product: "Colleague", apis: 1, versions: 1 },
    ])
    expect(s.index.summary.care).toContainEqual({ count: 1, text: "1 read by the second reader" })
    expect(s.index.summary.unreadable).toHaveLength(2)
    expect(s.catalog.chosen).toBe(catalog)
    expect(readSettings(dataDir)).toEqual({ catalog })
  })

  it("remembers the default folder as 'the default', not as a path", async () => {
    zipCatalog(defaultCatalog)
    const { port } = await startApp()
    await request(port, "POST", "/api/start-reading", { path: defaultCatalog })
    await waitFor(port, (s) => s.last !== null)
    expect(readSettings(dataDir)).toEqual({ catalog: null })
  })

  it("refuses a folder that isn't a catalog, saying why", async () => {
    const { port } = await startApp()
    const res = await request(port, "POST", "/api/start-reading", { path: testCatalog })
    expect(res.status).toBe(400)
    expect(res.json.check).toMatchObject({ kind: "unzipped" })
    expect((await getStatus(port)).run).toBeNull()
  })

  it("shows progress, and refuses a second reading while one is running", async () => {
    const fake = fakeIndexer()
    const { port } = await startApp(fake.indexing)
    expect((await request(port, "POST", "/api/start-reading", { path: catalog })).status).toBe(202)
    expect((await getStatus(port)).run).toMatchObject({ catalog, stage: "reading", done: 3, total: 10 })
    expect((await request(port, "POST", "/api/start-reading", { path: catalog })).status).toBe(409)
    fake.finish()
    await waitFor(port, (s) => s.run === null)
  })

  it("stops when asked, without remembering the folder", async () => {
    const fake = fakeIndexer()
    const { port } = await startApp(fake.indexing)
    await request(port, "POST", "/api/start-reading", { path: catalog })
    expect((await request(port, "POST", "/api/stop-reading")).status).toBe(200)
    const s = await waitFor(port, (s) => s.run === null)
    expect(s.last).toEqual({ outcome: "stopped" })
    expect(s.catalog.chosen).toBeNull()
  })

  it("stops on Ctrl+C too", async () => {
    const fake = fakeIndexer()
    const { port, api } = await startApp(fake.indexing)
    await request(port, "POST", "/api/start-reading", { path: catalog })
    api.stop()
    expect((await waitFor(port, (s) => s.run === null)).last).toEqual({ outcome: "stopped" })
  })

  it("reports a failure in plain words", async () => {
    const indexing = createIndexing({ dataDir, runIndex: () => Promise.reject(new Error("The folder vanished")) })
    const { port } = await startApp(indexing)
    await request(port, "POST", "/api/start-reading", { path: catalog })
    expect((await waitFor(port, (s) => s.last !== null)).last).toEqual({ outcome: "failed", message: "The folder vanished" })
  })
})

describe("the APIs", () => {
  it("sends every API in the index, and says when there's no index", async () => {
    const { port } = await startApp()
    expect(await request(port, "GET", "/api/apis")).toMatchObject({ status: 404, json: { error: "No index yet" } })

    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.index.state === "ready")
    const { status, json } = await request(port, "GET", "/api/apis")
    expect(status).toBe(200)
    expect(json.format).toBe(INDEX_FORMAT)
    expect(json.apis).toHaveLength(18)
    expect(json.apis.find((a: { id: string }) => a.id === "BannerWidgetAPIs/widgets").versions).toHaveLength(3)
  })
})

describe("search's files", () => {
  it("sends the search file and the descriptions file, and says when there's no index", async () => {
    const { port } = await startApp()
    expect(await request(port, "GET", "/api/search")).toMatchObject({ status: 404, json: { error: "No index yet" } })
    expect(await request(port, "GET", "/api/search/descriptions")).toMatchObject({ status: 404, json: { error: "No index yet" } })

    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.index.state === "ready")
    const search = await request(port, "GET", "/api/search")
    expect(search.status).toBe(200)
    expect(search.json.format).toBe(INDEX_FORMAT)
    expect(search.json.apis.some((a: { id: string }) => a.id === "BannerWidgetAPIs/sprockets")).toBe(true)
    expect(search.json.tables.some((t: { name: string }) => t.name === "SWBSPRK")).toBe(true)
    const descriptions = await request(port, "GET", "/api/search/descriptions")
    expect(descriptions.json.apis["BannerWidgetAPIs/levers"]).toEqual(["The lever's code. Newer words.", null])
  })
})

describe("one API's parameters", () => {
  it("sends them by version folder, nothing for an API without any, and says when there's no index", async () => {
    const { port } = await startApp()
    const address = "/api/apis/BannerWidgetAPIs/widgets/parameters"
    expect(await request(port, "GET", address)).toMatchObject({ status: 404, json: { error: "No index yet" } })

    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.index.state === "ready")
    const { status, json } = await request(port, "GET", address)
    expect(status).toBe(200)
    expect(Object.keys(json.versions)).toEqual(["widgets-1.2.0"])
    expect(json.versions["widgets-1.2.0"][0].parameters[0]).toEqual({ name: "criteria", in: "query", required: false, description: "Filter the widgets." })
    expect(await request(port, "GET", "/api/apis/BannerWidgetAPIs/no-such-api/parameters")).toMatchObject({ status: 200, json: { versions: {} } })
    expect((await request(port, "GET", "/api/apis/%E0%A4%A/x/parameters")).status).toBe(400)
  })
})

describe("one API's fields", () => {
  it("sends them by version folder, and nothing for an API without any", async () => {
    const { port } = await startApp()
    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.index.state === "ready")
    const { status, json } = await request(port, "GET", "/api/apis/BannerWidgetAPIs/sprockets/fields")
    expect(status).toBe(200)
    expect(json.versions["sprockets-1.0.0"].fields[0]).toMatchObject({ name: "id", depth: 0 })
    expect(await request(port, "GET", "/api/apis/BannerWidgetAPIs/cogs/fields")).toMatchObject({ status: 200, json: { versions: {} } })
  })
})

describe("tables", () => {
  it("sends the list and one table, and says when there's no index or no such table", async () => {
    const { port } = await startApp()
    expect(await request(port, "GET", "/api/tables")).toMatchObject({ status: 404, json: { error: "No index yet" } })
    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.index.state === "ready")

    const list = await request(port, "GET", "/api/tables")
    expect(list.status).toBe(200)
    const names = list.json.tables.map((t: { product: string; name: string }) => `${t.product}/${t.name}`)
    expect(names).toEqual(expect.arrayContaining(["Banner/SWBSPRK", "Banner/SWRSIZE", "Colleague/WIDGET"]))
    expect(names).not.toContain("Banner/BATCH") // the false-table rule still applies

    const one = await request(port, "GET", "/api/tables/Banner/SWRSIZE")
    expect(one.status).toBe(200)
    expect(one.json).toMatchObject({ product: "Banner", name: "SWRSIZE", columns: [{ name: "SWRSIZE_SIZE" }] })
    expect(one.json.apis.map((a: { id: string }) => a.id)).toEqual(["BannerWidgetAPIs/sprockets"])
    expect(await request(port, "GET", "/api/tables/Banner/NOSUCH")).toMatchObject({ status: 404, json: { error: "No such table" } })
    expect((await request(port, "GET", "/api/tables/%E0%A4%A/x")).status).toBe(400)
  })
})

describe("forms", () => {
  it("sends the list and one form, and says when there's no index or no such form", async () => {
    const { port } = await startApp()
    expect(await request(port, "GET", "/api/forms")).toMatchObject({ status: 404, json: { error: "No index yet" } })
    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.index.state === "ready")

    const list = await request(port, "GET", "/api/forms")
    expect(list.status).toBe(200)
    expect(list.json.forms.map((f: { product: string; code: string }) => `${f.product}/${f.code}`)).toEqual([
      "Banner/SWAWIDG",
      "Banner/SWIWINQ",
      "Banner/SWVWTYP",
      "Colleague/WDG001",
    ])

    const one = await request(port, "GET", "/api/forms/Colleague/WDG001")
    expect(one).toMatchObject({ status: 200, json: { code: "WDG001", title: "Widget Intake (WDGI)", apis: [{ id: "ColleagueBusAPIs/intake" }] } })
    expect(await request(port, "GET", "/api/forms/Banner/SWBWREQ")).toMatchObject({ status: 404, json: { error: "No such form" } })
    expect((await request(port, "GET", "/api/forms/%E0%A4%A/x")).status).toBe(400)
  })
})

describe("deleting the index data", () => {
  it("deletes the index and the remembered folder, then there's no index", async () => {
    const { port } = await startApp()
    await request(port, "POST", "/api/start-reading", { path: catalog })
    await waitFor(port, (s) => s.last !== null)
    expect((await request(port, "POST", "/api/delete-index")).status).toBe(200)
    const s = await getStatus(port)
    expect(s.index).toEqual({ state: "missing" })
    expect(s.catalog.chosen).toBeNull()
    expect(fs.existsSync(dataDir)).toBe(false)
  })

  it("leaves anything else in the data folder alone", async () => {
    fs.mkdirSync(path.join(dataDir, "index"), { recursive: true })
    fs.mkdirSync(path.join(dataDir, "index.tmp-1-2"))
    fs.writeFileSync(path.join(dataDir, "settings.json"), "{}")
    fs.writeFileSync(path.join(dataDir, "my-notes.txt"), "mine")
    const { port } = await startApp()
    await request(port, "POST", "/api/delete-index")
    expect(fs.readdirSync(dataDir)).toEqual(["my-notes.txt"])
  })

  it("refuses while a catalog is being read", async () => {
    const fake = fakeIndexer()
    fs.mkdirSync(path.join(dataDir, "index"), { recursive: true })
    const { port } = await startApp(fake.indexing)
    await request(port, "POST", "/api/start-reading", { path: catalog })
    expect((await request(port, "POST", "/api/delete-index")).status).toBe(409)
    expect(fs.existsSync(path.join(dataDir, "index"))).toBe(true)
    fake.finish()
    await waitFor(port, (s) => s.run === null)
  })
})

describe("checking a folder", () => {
  it("answers with what it found", async () => {
    const { port } = await startApp()
    const res = await request(port, "POST", "/api/check-folder", { path: catalog })
    expect(res.json).toEqual({ kind: "ok", path: catalog, families: 5, zips: 3, others: 0 })
  })

  it("makes the app's own catalog-zips folder if it isn't there, but no other", async () => {
    const { port } = await startApp()
    expect((await request(port, "POST", "/api/check-folder", { path: path.join(tmp, "elsewhere") })).json).toMatchObject({ kind: "missing" })
    expect(fs.existsSync(path.join(tmp, "elsewhere"))).toBe(false)
    expect((await request(port, "POST", "/api/check-folder", { path: `"${defaultCatalog}\\"` })).json).toEqual({ kind: "empty", path: defaultCatalog, others: 0 })
    expect(fs.statSync(defaultCatalog).isDirectory()).toBe(true)
  })
})

describe("safety", () => {
  it("refuses 'do something' requests from another site", async () => {
    const { port } = await startApp()
    fs.mkdirSync(path.join(dataDir, "index"), { recursive: true })
    for (const p of ["/api/check-folder", "/api/start-reading", "/api/stop-reading", "/api/delete-index"]) {
      expect((await request(port, "POST", p, { path: catalog }, "https://evil.example")).status).toBe(403)
    }
    expect((await getStatus(port)).run).toBeNull()
    expect(fs.existsSync(path.join(dataDir, "index"))).toBe(true)
  })

  it("refuses them when the request doesn't say where it came from", async () => {
    const { port } = await startApp()
    expect((await request(port, "POST", "/api/check-folder", { path: catalog }, null)).status).toBe(403)
  })

  it("refuses a body that isn't JSON", async () => {
    const { port } = await startApp()
    const res = await new Promise<number>((resolve) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/check-folder", method: "POST", headers: { host: `localhost:${port}`, origin: `http://localhost:${port}` } },
        (r) => resolve(r.statusCode ?? 0),
      )
      req.end("not json")
    })
    expect(res).toBe(400)
  })
})
