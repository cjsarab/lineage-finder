// Shared by the page tests: a pretend server, and helpers to draw the whole app in a simulated browser and
// click around it. Made-up data only; no Ellucian material.
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, vi } from "vitest"
import { App } from "@/app"
import type { Api, Changes, FolderCheck, FormDetail, FormSummary, IndexSummary, MethodParameters, SearchApi, SearchTable, Status, TableDetail, TableSummary, VersionFields, VersionWas } from "@/lib/server"
import { POLL_MS } from "@/lib/use-status"

// Lets React know this is a test, so act() works without warnings.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export const DEFAULT = "C:\\apps\\lineage-finder\\catalog-zips"
export const DATA = "C:\\apps\\lineage-finder\\data"

export const summary: IndexSummary = {
  builtAt: "2026-10-08T14:02:00.000Z",
  catalog: DEFAULT,
  seconds: 31.2,
  apis: 16,
  versions: 19,
  specFiles: 19,
  families: [
    { name: "BannerWidgetAPIs", group: "Banner", product: "Banner", apis: 12, versions: 15 },
    { name: "BannerGadgetAPIs", group: "Banner", product: "Banner", apis: 1, versions: 1 },
    { name: "ColleagueWidgetAPIs", group: "Colleague", product: "Colleague", apis: 1, versions: 1 },
    { name: "SprocketAPIs", group: "Other products", product: "Sprocket Suite", apis: 2, versions: 2 },
  ],
  care: [{ count: 1, text: "1 read by the second reader" }],
  unreadable: [{ file: "BannerWidgetAPIs/broken-1.0.0/broken.yaml", reason: "empty file" }],
}

/** A made-up API. Versions oldest first; the details given apply to the newest. */
export function fakeApi(
  family: string,
  name: string,
  o: {
    versions?: string[]
    domain?: string | null
    release?: string | null
    beta?: boolean
    deprecated?: boolean
    /** The newest version's lineage: full (the default), partial or none. */
    lineage?: "full" | "partial" | "none"
    /** Every version's base tables. */
    baseTables?: string[]
    /** Every version's forms, with its x-source-name and x-source-title. */
    forms?: string[]
    sourceName?: string
    sourceTitle?: string
  } = {},
): Api {
  const versions = o.versions ?? ["1.0.0"]
  return {
    id: `${family}/${name}`,
    family,
    name,
    product: family.startsWith("Colleague") ? "colleague" : "banner",
    versions: versions.map((version, i) => ({
      version,
      folder: `${name}-${version}`,
      relDir: `${family}/${name}-${version}`,
      specFile: `${name}.yaml`,
      nestedIn: null,
      zip: "production_API_catalog_A_B.zip",
      read: "ok",
      problem: null,
      details: {
        title: name,
        description: null,
        specVersion: version,
        versionDiffers: false,
        beta: i === versions.length - 1 && (o.beta ?? false),
        apiType: null,
        releaseStatus: i === versions.length - 1 ? (o.release === undefined ? (o.beta ? "beta" : "ga") : o.release) : "ga",
        sourceSystem: null,
        sourceDomain: o.domain === undefined ? "Student" : o.domain,
        sourceName: o.sourceName ?? null,
        sourceTitle: o.sourceTitle ?? null,
        audience: null,
        deprecatedOn: i === versions.length - 1 && o.deprecated ? "2026-01-01" : null,
        sunsetOn: null,
        mediaTypes: [],
        methods: [],
      },
      lineage: { fields: 4, withLineage: i < versions.length - 1 || !o.lineage || o.lineage === "full" ? 4 : o.lineage === "partial" ? 2 : 0, unsupported: 0 },
      baseTables: o.baseTables ?? [],
      forms: o.forms ?? [],
    })),
  }
}

/** The made-up APIs behind `summary`: 16 APIs, 19 versions, in the same four families. */
export const fakeApis: Api[] = [
  fakeApi("BannerWidgetAPIs", "widget-requests", { versions: ["1.0.0", "2.1.0"] }),
  fakeApi("BannerWidgetAPIs", "widget-request-holds", { beta: true }),
  fakeApi("BannerWidgetAPIs", "widget-totals", { versions: ["1.0.0", "2.0.0", "3.0.0"], domain: "Finance", beta: true }),
  fakeApi("BannerWidgetAPIs", "widget-summaries", { domain: "Finance", deprecated: true, lineage: "none" }),
  fakeApi("BannerWidgetAPIs", "widget-codes", { domain: "student" }),
  fakeApi("BannerWidgetAPIs", "widget-forms", { domain: "WIDGFRM" }),
  fakeApi("BannerWidgetAPIs", "widget-fees", { domain: "Finance", lineage: "partial" }),
  fakeApi("BannerWidgetAPIs", "widget-grants", { domain: "Financial Aid" }),
  fakeApi("BannerWidgetAPIs", "widget-staff", { domain: "Human Resources" }),
  fakeApi("BannerWidgetAPIs", "widget-people", { domain: "Foundation" }),
  fakeApi("BannerWidgetAPIs", "widget-terms"),
  fakeApi("BannerWidgetAPIs", "widgets", { domain: null, release: null }),
  fakeApi("BannerGadgetAPIs", "gadgets"),
  fakeApi("ColleagueWidgetAPIs", "widget-requests"),
  fakeApi("SprocketAPIs", "sprockets", { domain: "Foundation", lineage: "none" }),
  fakeApi("SprocketAPIs", "sprocket-gears", { domain: "Foundation" }),
]

/** The pretend server's state; tests change it to set the scene. */
export const server = {} as {
  status: Status
  apis: Api[]
  /** By API id, then version folder (GET /api/apis/<family>/<name>/parameters). */
  parameters: Record<string, Record<string, MethodParameters[]>>
  /** By API id, then version folder (GET /api/apis/<family>/<name>/fields). */
  fields: Record<string, Record<string, VersionFields>>
  /** GET /api/tables, and each table's page by "<product>/<table>" (GET /api/tables/<product>/<table>). */
  tables: TableSummary[]
  tableDetails: Record<string, TableDetail>
  /** GET /api/forms, and each form's page by "<product>/<code>". */
  forms: FormSummary[]
  formDetails: Record<string, FormDetail>
  /** GET /api/search and GET /api/search/descriptions. */
  search: { apis: SearchApi[]; tables: SearchTable[]; forms?: FormSummary[] }
  searchDescriptions: Record<string, (string | null)[]>
  /** GET /api/changes, and by API id then version folder, GET /api/changes/<family>/<name>. */
  changes: Changes | null
  changesWas: Record<string, Record<string, VersionWas>>
  /** Addresses asked for, in order. */
  asked: string[]
  /** Addresses that answer with an error. */
  failing: string[]
  checks: Record<string, FolderCheck>
  started: string[]
  stopped: number
  deleted: number
  down: boolean
}

function fakeFetch(url: string, init?: RequestInit) {
  if (server.down) return Promise.reject(new Error("connection refused"))
  server.asked.push(url)
  if (server.failing.includes(url)) return Promise.resolve(new Response(JSON.stringify({ error: "Broken" }), { status: 500 }))
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  const reply = (json: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(json), { status }))
  const one = url.match(/^\/api\/apis\/([^/]+)\/([^/]+)\/(parameters|fields)$/)
  if (one) {
    if (server.status.index.state !== "ready") return reply({ error: "No index yet" }, 404)
    const id = `${decodeURIComponent(one[1])}/${decodeURIComponent(one[2])}`
    return reply({ versions: (one[3] === "fields" ? server.fields : server.parameters)[id] ?? {} })
  }
  const was = url.match(/^\/api\/changes\/([^/]+)\/([^/]+)$/)
  if (was) {
    if (server.status.index.state !== "ready") return reply({ error: "No index yet" }, 404)
    return reply({ versions: server.changesWas[`${decodeURIComponent(was[1])}/${decodeURIComponent(was[2])}`] ?? {} })
  }
  const page = url.match(/^\/api\/(tables|forms)\/([^/]+)\/([^/]+)$/)
  if (page) {
    if (server.status.index.state !== "ready") return reply({ error: "No index yet" }, 404)
    const key = `${decodeURIComponent(page[2])}/${decodeURIComponent(page[3])}`
    const detail = page[1] === "tables" ? server.tableDetails[key] : server.formDetails[key]
    return detail ? reply(detail) : reply({ error: `No such ${page[1] === "tables" ? "table" : "form"}` }, 404)
  }
  switch (url) {
    case "/api/status":
      return reply(server.status)
    case "/api/apis":
      return server.status.index.state === "ready" ? reply({ format: 4, apis: server.apis }) : reply({ error: "No index yet" }, 404)
    case "/api/changes":
      return server.status.index.state === "ready" ? reply({ changes: server.changes }) : reply({ error: "No index yet" }, 404)
    case "/api/tables":
      return server.status.index.state === "ready" ? reply({ tables: server.tables }) : reply({ error: "No index yet" }, 404)
    case "/api/forms":
      return server.status.index.state === "ready" ? reply({ forms: server.forms }) : reply({ error: "No index yet" }, 404)
    case "/api/search":
      return server.status.index.state === "ready" ? reply({ format: 6, ...server.search }) : reply({ error: "No index yet" }, 404)
    case "/api/search/descriptions":
      return server.status.index.state === "ready" ? reply({ format: 6, apis: server.searchDescriptions }) : reply({ error: "No index yet" }, 404)
    case "/api/check-folder":
      return reply(server.checks[body.path] ?? { kind: "missing", path: body.path })
    case "/api/start-reading":
      server.started.push(body.path)
      server.status = { ...server.status, run: { catalog: body.path, stage: "finding", done: 0, total: 0, readingSeconds: 0 }, last: null }
      return reply({ ok: true }, 202)
    case "/api/stop-reading":
      server.stopped++
      server.status = { ...server.status, run: null, last: { outcome: "stopped" } }
      return reply({ ok: true })
    case "/api/delete-index":
      server.deleted++
      server.status = { ...server.status, index: { state: "missing" }, catalog: { ...server.status.catalog, chosen: null } }
      return reply({ ok: true })
  }
  return reply({ error: "Unknown address" }, 404)
}

let container: HTMLDivElement
let root: Root

/** Call once at the top of a test file: a fresh pretend server and page for every test. */
export function useFakeApp() {
  beforeEach(() => {
    Object.assign(server, {
      status: {
        app: { version: "0.1.0", indexFormat: 4 },
        index: { state: "missing" },
        dataDir: DATA,
        catalog: { chosen: null, default: DEFAULT },
        run: null,
        last: null,
        catalogCheck: { state: "unknown" },
      },
      apis: fakeApis,
      parameters: {},
      fields: {},
      tables: [],
      tableDetails: {},
      forms: [],
      formDetails: {},
      search: { apis: [], tables: [] },
      searchDescriptions: {},
      changes: null,
      changesWas: {},
      asked: [],
      failing: [],
      checks: { [DEFAULT]: { kind: "ok", path: DEFAULT, families: 20, zips: 5, others: 0 } },
      started: [],
      stopped: 0,
      deleted: 0,
      down: false,
    } satisfies typeof server)
    vi.stubGlobal("fetch", fakeFetch)
    vi.stubGlobal("scrollTo", () => {}) // the simulated browser doesn't scroll
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    localStorage.clear()
    document.documentElement.classList.remove("dark")
    delete document.documentElement.dataset.accent
    vi.unstubAllGlobals()
    window.history.pushState({}, "", "/")
  })
}

export async function renderAt(path: string) {
  window.history.pushState({}, "", path)
  await act(async () => root.render(<App />))
  await settle()
}

/** Lets pending fetches and re-draws finish. */
export const settle = () => act(() => new Promise((r) => setTimeout(r, 10)))
/** Waits long enough for the page to ask the server again. */
export const nextPoll = () => act(() => new Promise((r) => setTimeout(r, POLL_MS + 50)))

/** Everything on the page, including panels and dialogs drawn outside the app's own box. */
export const text = () => document.body.textContent ?? ""
export const page = () => container

export const button = (label: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label).at(-1) ??
  null

export async function click(label: string) {
  const b = button(label)
  if (!b) throw new Error(`No "${label}" button. Page says: ${text()}`)
  await act(async () => b.click())
  await settle()
}

/** Clicks the tick box or radio button whose label is `label`. */
export async function choose(label: string) {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label)
  const target = l?.htmlFor ? document.getElementById(l.htmlFor) : null
  if (!target) throw new Error(`No "${label}" choice. Page says: ${text()}`)
  await act(async () => (target as HTMLElement).click())
  await settle()
}

export async function type(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Catalog folder"]')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

/** Follows the link whose text starts with `label` (the last one, if several). */
export async function follow(label: string, href?: string) {
  const a = [...document.querySelectorAll("a")].filter((x) => x.textContent?.trim().startsWith(label) && (!href || x.getAttribute("href") === href)).at(-1)
  if (!a) throw new Error(`No "${label}" link. Page says: ${text()}`)
  await act(async () => a.click())
  await settle()
}

/** Types into the box with this aria-label (the first, if there are several). */
export async function typeInto(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!input) throw new Error(`No "${label}" box`)
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await settle()
}
