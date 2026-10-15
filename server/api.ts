// The app's own addresses (`/api/...`), used by the real server and, through vite.config.ts, by `npm run dev`.
import fs from "node:fs"
import type http from "node:http"
import path from "node:path"
import { PRODUCT_GROUPS, productOfFamily } from "../indexer/products.ts"
import { careLines } from "../indexer/report.ts"
import {
  DESCRIPTIONS_FILE,
  INDEX_FORMAT,
  indexDir,
  readFields,
  readForm,
  readFormList,
  SEARCH_FILE,
  readIndexInfo,
  readChanges,
  readParameters,
  readTable,
  readTableList,
  type IndexInfo,
} from "../indexer/run-index.ts"
import type { ApiChangesWas, ApiFields, ApiParameters, ChangesSent, FormList, IndexSummary, LastRun, Status, TableList } from "./api-types.ts"
import { createCatalogCheck } from "./catalog-check.ts"
import { checkFolder, tidyPath } from "./catalog-folder.ts"
import { createIndexing, type Indexing } from "./indexing.ts"
import { catalogFolder, deleteAppData, readSettings, writeSettings } from "./settings.ts"

const APP_VERSION: string = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8")).version

type Next = () => void
export type ApiHandler = (req: http.IncomingMessage, res: http.ServerResponse, next: Next) => void

export interface Api {
  handle: ApiHandler
  /** Stops any reading in progress (on Ctrl+C). */
  stop(): void
}

export function createApi(options: { dataDir: string; defaultCatalog: string; indexing?: Indexing }): Api {
  const { dataDir, defaultCatalog } = options
  const catalogCheck = createCatalogCheck(dataDir)
  void catalogCheck.refresh()
  const indexing =
    options.indexing ??
    createIndexing({
      dataDir,
      // Remember the folder only once it has been read successfully, so a stopped or failed attempt changes nothing.
      onDone: (_, catalog) => {
        writeSettings(dataDir, { catalog: catalog === defaultCatalog ? null : catalog })
        void catalogCheck.refresh()
      },
    })

  function status(): Status {
    const index = readIndexInfo(dataDir)
    const last = indexing.last()
    return {
      app: { version: APP_VERSION, indexFormat: INDEX_FORMAT },
      index: index.state === "ready" ? { state: "ready", summary: summarise(index.info) } : index,
      dataDir,
      catalog: { chosen: readSettings(dataDir).catalog, default: defaultCatalog },
      run: indexing.current(),
      last: last && (last.outcome === "done" ? { outcome: "done", summary: summarise(last.info) } : (last satisfies LastRun)),
      catalogCheck: catalogCheck.current(),
    }
  }

  const handle: ApiHandler = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const route = `${req.method} ${url.pathname}`
    if (!url.pathname.startsWith("/api/")) return next()

    if (req.method === "POST" && !fromOwnPage(req)) {
      return sendJson(res, 403, { error: "Only Lineage Finder's own page can ask for this." })
    }

    // One API's query parameters and headers, or its fields and lineage:
    // /api/apis/<family>/<name>/parameters or …/fields
    const one = req.method === "GET" ? url.pathname.match(/^\/api\/apis\/([^/]+)\/([^/]+)\/(parameters|fields)$/) : null
    if (one) {
      if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
      let id: string
      try {
        id = `${decodeURIComponent(one[1])}/${decodeURIComponent(one[2])}`
      } catch {
        return sendJson(res, 400, { error: "Not a valid address" })
      }
      if (one[3] === "fields") return sendJson(res, 200, { versions: readFields(dataDir, id) } satisfies ApiFields)
      return sendJson(res, 200, { versions: readParameters(dataDir, id) } satisfies ApiParameters)
    }

    // A changed API's versions as they were at the read before:
    // /api/changes/<family>/<name>
    const was = req.method === "GET" ? url.pathname.match(/^\/api\/changes\/([^/]+)\/([^/]+)$/) : null
    if (was) {
      if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
      let id: string
      try {
        id = `${decodeURIComponent(was[1])}/${decodeURIComponent(was[2])}`
      } catch {
        return sendJson(res, 400, { error: "Not a valid address" })
      }
      const all = readChanges(dataDir)?.was ?? {}
      return sendJson(res, 200, { versions: Object.hasOwn(all, id) ? all[id] : {} } satisfies ApiChangesWas)
    }

    // One table's page, /api/tables/<product>/<table>, or one form's, /api/forms/<product>/<code>
    const page = req.method === "GET" ? url.pathname.match(/^\/api\/(tables|forms)\/([^/]+)\/([^/]+)$/) : null
    if (page) {
      if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
      let product: string, name: string
      try {
        product = decodeURIComponent(page[2])
        name = decodeURIComponent(page[3])
      } catch {
        return sendJson(res, 400, { error: "Not a valid address" })
      }
      const kind = page[1] === "tables" ? "table" : "form"
      const detail = kind === "table" ? readTable(dataDir, product, name) : readForm(dataDir, product, name)
      return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: `No such ${kind}` })
    }

    switch (route) {
      case "GET /api/health":
        return sendJson(res, 200, { ok: true, app: "Lineage Finder" })
      case "GET /api/status":
        return sendJson(res, 200, status())
      case "GET /api/apis":
        return sendIndexFile(res, "apis.json")
      // Search's files: fetched the first time Search opens, and when Descriptions is switched on.
      case "GET /api/search":
        return sendIndexFile(res, SEARCH_FILE)
      case "GET /api/search/descriptions":
        return sendIndexFile(res, DESCRIPTIONS_FILE)
      case "GET /api/changes":
        if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
        return sendJson(res, 200, { changes: readChanges(dataDir)?.changes ?? null } satisfies ChangesSent)
      case "GET /api/tables":
        if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
        return sendJson(res, 200, { tables: readTableList(dataDir) } satisfies TableList)
      case "GET /api/forms":
        if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
        return sendJson(res, 200, { forms: readFormList(dataDir) } satisfies FormList)
      case "POST /api/check-folder":
        return withBody(req, res, (body) => {
          const given = String(body.path ?? "")
          const tidy = tidyPath(given)
          // The app's own catalog-zips folder is made for the user, so they needn't.
          if (path.isAbsolute(tidy) && path.resolve(tidy) === path.resolve(defaultCatalog)) fs.mkdirSync(defaultCatalog, { recursive: true })
          sendJson(res, 200, checkFolder(given))
        })
      case "POST /api/start-reading":
        return withBody(req, res, (body) => {
          const check = checkFolder(String(body.path ?? ""))
          if (check.kind !== "ok") return sendJson(res, 400, { error: "That folder doesn't look like a catalog.", check })
          if (!indexing.start(check.path)) return sendJson(res, 409, { error: "Already reading a catalog." })
          sendJson(res, 202, { ok: true })
        })
      case "POST /api/stop-reading":
        indexing.stop()
        return sendJson(res, 200, { ok: true })
      case "POST /api/delete-index":
        if (indexing.current()) return sendJson(res, 409, { error: "Can't delete the index while a catalog is being read." })
        deleteAppData(dataDir)
        void catalogCheck.refresh()
        return sendJson(res, 200, { ok: true })
      default:
        return sendJson(res, 404, { error: "Unknown address" })
    }
  }

  /**
   * One of the index's files as it is: apis.json (every API) or search's files. Read whole
   * before sending, so the file is never held open while a re-index swaps the new index in.
   */
  function sendIndexFile(res: http.ServerResponse, name: string) {
    if (readIndexInfo(dataDir).state !== "ready") return sendJson(res, 404, { error: "No index yet" })
    let body: Buffer
    try {
      body = fs.readFileSync(path.join(indexDir(dataDir), name))
    } catch {
      return sendJson(res, 404, { error: "No index yet" })
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    res.end(body)
  }

  return { handle, stop: () => indexing.stop() }
}

/** The folder `npm run index` and the app read when none is given: the one chosen, or the default. */
export function rememberedCatalog(dataDir: string, defaultCatalog: string): string {
  return catalogFolder(readSettings(dataDir), defaultCatalog)
}

function summarise(info: IndexInfo): IndexSummary {
  return {
    builtAt: info.builtAt,
    catalog: info.catalog,
    seconds: info.seconds,
    apis: info.counts.apis,
    versions: info.counts.versions,
    specFiles: info.counts.specFiles,
    families: info.families
      .map((f) => ({ name: f.name, ...productOfFamily(f.name), apis: f.apis, versions: f.versions }))
      .sort((a, b) => PRODUCT_GROUPS.indexOf(a.group) - PRODUCT_GROUPS.indexOf(b.group) || (a.name < b.name ? -1 : 1)),
    care: careLines(info.counts),
    unreadable: info.care.unreadable,
  }
}

/**
 * Only accept "do something" requests from the app's own page. Browsers label every POST with the site it came
 * from (the Origin header), so a website you visit can't start reading or probe which folders exist.
 */
export function fromOwnPage(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return false
  try {
    const o = new URL(origin)
    return isLocalHost(o.host) && o.host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Only answer requests addressed to this computer by name. A web page on another site can't then
 * trick the browser into reading the app's data ("DNS rebinding").
 */
export function isLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  const name = hostHeader.replace(/:\d+$/, "").toLowerCase()
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]"
}

const MAX_BODY = 64 * 1024

function withBody(req: http.IncomingMessage, res: http.ServerResponse, use: (body: Record<string, unknown>) => void) {
  let text = ""
  let tooBig = false
  req.setEncoding("utf8")
  req.on("data", (chunk: string) => {
    text += chunk
    if (text.length > MAX_BODY) tooBig = true
  })
  req.on("end", () => {
    if (tooBig) return sendJson(res, 413, { error: "Request too large" })
    let body: unknown
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      return sendJson(res, 400, { error: "Not valid JSON" })
    }
    if (typeof body !== "object" || body === null) return sendJson(res, 400, { error: "Expected a JSON object" })
    use(body as Record<string, unknown>)
  })
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}
