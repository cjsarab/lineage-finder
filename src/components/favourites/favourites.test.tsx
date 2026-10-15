// @vitest-environment jsdom
// Favourites: the stars on the API and table pages, the header's panel, and Recently
// viewed. Made-up APIs and tables only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import { FAVOURITES_KEY, recent, RECENT_KEY, type Favourite } from "@/lib/favourites"
import type { TableDetail, TableSummary } from "@/lib/server"
import { button, click, renderAt, server, settle, summary, text, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const TABLES: TableSummary[] = [
  { product: "Banner", name: "SWBWIDG", apis: ["BannerWidgetAPIs/widget-requests", "SprocketAPIs/sprockets"], cols: [[0], [1]] },
]

const SWBWIDG: TableDetail = {
  product: "Banner",
  name: "SWBWIDG",
  columns: [
    { name: "SWBWIDG_CODE", apis: ["BannerWidgetAPIs/widget-requests"] },
    { name: "SWBWIDG_GEAR", apis: ["SprocketAPIs/sprockets"] },
  ],
  apis: [
    { id: "BannerWidgetAPIs/widget-requests", fields: [{ path: "code", column: "SWBWIDG_CODE" }] },
    { id: "SprocketAPIs/sprockets", fields: [{ path: "gear", column: "SWBWIDG_GEAR" }] },
  ],
  alsoIn: [],
}

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.tables = TABLES
  server.tableDetails = { "Banner/SWBWIDG": SWBWIDG }
})

/** The star for `what` ("widget-requests 2.1.0", "SWBWIDG", "SWBWIDG_CODE"), whichever way it's set. */
const star = (what: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label")?.endsWith(`Favourites: ${what}`)).at(-1) ?? null
const pressed = (what: string) => star(what)?.getAttribute("aria-pressed")
async function clickStar(what: string) {
  const b = star(what)
  if (!b) throw new Error(`No star for "${what}". Page says: ${text()}`)
  await act(async () => b.click())
  await settle()
}
const saved = () => JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? "[]") as Favourite[]
const save = (list: Favourite[]) => localStorage.setItem(FAVOURITES_KEY, JSON.stringify(list))
/** The panel's links, as text → address. */
const panelLinks = () =>
  Object.fromEntries([...document.querySelectorAll('[data-slot="sheet-content"] a')].map((a) => [a.textContent, a.getAttribute("href")]))

describe("the header's Favourites button", () => {
  it("opens the panel, empty to begin with, and closes", async () => {
    await renderAt("/apis")
    expect(button("Favourites")).not.toBeNull()
    await click("Favourites")
    expect(text()).toContain("Nothing here yet. Use")
    expect(text()).toContain("Recently viewed")
    await click("Close")
    expect(text()).not.toContain("Nothing here yet")
  })
})

describe("starring on the pages", () => {
  it("saves the API version on show, and follows the version", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-requests")
    expect(pressed("widget-requests 2.1.0")).toBe("false")
    await clickStar("widget-requests 2.1.0")
    expect(pressed("widget-requests 2.1.0")).toBe("true")
    expect(saved()).toEqual([{ kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version: "2.1.0", newest: "2.1.0" }])

    await click("1.0.0")
    expect(pressed("widget-requests 1.0.0")).toBe("false")
    await clickStar("widget-requests 1.0.0")
    expect(saved()).toHaveLength(2)

    await click("Favourites")
    const links = [...document.querySelectorAll('[data-slot="sheet-content"] a')].map((a) => a.getAttribute("href"))
    expect(links.slice(0, 2)).toEqual(["/apis/BannerWidgetAPIs/widget-requests?version=1.0.0", "/apis/BannerWidgetAPIs/widget-requests"])
    expect(text()).toContain("BannerWidgetAPIs")
  })

  it("unstars from the page", async () => {
    save([{ kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version: "2.1.0", newest: "2.1.0" }])
    await renderAt("/apis/BannerWidgetAPIs/widget-requests")
    expect(pressed("widget-requests 2.1.0")).toBe("true")
    await clickStar("widget-requests 2.1.0")
    expect(saved()).toEqual([])
  })

  it("saves a table, and a column from its row in the Columns list", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    await clickStar("SWBWIDG")
    await clickStar("SWBWIDG_CODE")
    expect(pressed("SWBWIDG_CODE")).toBe("true")
    expect(pressed("SWBWIDG_GEAR")).toBe("false")
    expect(document.querySelector("h1")?.textContent).toBe("SWBWIDG")

    await click("Favourites")
    expect(panelLinks()).toMatchObject({ SWBWIDG: "/tables/Banner/SWBWIDG", "SWBWIDG.SWBWIDG_CODE": "/tables/Banner/SWBWIDG/SWBWIDG_CODE" })
    expect(text()).toContain("Tables")
    expect(text()).toContain("Columns")
  })
})

describe("the panel", () => {
  it("removes with the star, keeps the row until it closes, and puts it back on a second click", async () => {
    save([{ kind: "table", product: "Banner", name: "SWBWIDG" }])
    await renderAt("/apis")
    await click("Favourites")
    await clickStar("SWBWIDG")
    expect(saved()).toEqual([])
    expect(pressed("SWBWIDG")).toBe("false")
    expect(panelLinks()).toMatchObject({ SWBWIDG: "/tables/Banner/SWBWIDG" })

    await clickStar("SWBWIDG")
    expect(saved()).toHaveLength(1)

    await clickStar("SWBWIDG")
    await click("Close")
    await click("Favourites")
    expect(text()).toContain("Nothing here yet")
  })

  it("says what's gone, hidden or has a newer version", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    save([
      { kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version: "1.0.0", newest: "1.0.0" },
      { kind: "api", family: "BannerWidgetAPIs", name: "old-api", version: "1.0.0", newest: "1.0.0" },
      { kind: "api", family: "SprocketAPIs", name: "sprockets", version: "1.0.0", newest: "1.0.0" },
      { kind: "column", product: "Banner", table: "SWBWIDG", column: "SWBWIDG_GONE" },
    ])
    await renderAt("/apis")
    await click("Favourites")
    expect(text()).toContain("Newer version: 2.1.0")
    expect(text()).toContain("Hidden in Settings")
    expect(text().match(/No longer in your catalog/g)).toHaveLength(2)

    await click("Remove")
    await click("Remove")
    expect(text()).not.toContain("No longer in your catalog")
    expect(saved().map((f) => f.kind === "api" && f.name)).toEqual(["widget-requests", "sprockets"])

    await click("Open Settings")
    expect(text()).toContain("Families shown")
  })

  it("says when a saved version has gone, with the way to the newest", async () => {
    save([{ kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version: "0.9.0", newest: "0.9.0" }])
    await renderAt("/apis")
    await click("Favourites")
    expect(text()).toContain("Version 0.9.0 is no longer in your catalog.")
    expect(panelLinks()).toMatchObject({ "Open the newest": "/apis/BannerWidgetAPIs/widget-requests" })
  })
})

describe("recently viewed", () => {
  it("records API and table pages, with the version and column on show", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-requests?version=1.0.0")
    expect(recent()).toEqual([{ kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version: "1.0.0" }])
  })

  it("records a table with its chosen column, not a missing table", async () => {
    await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    expect(recent()).toEqual([{ kind: "table", product: "Banner", name: "SWBWIDG", column: "SWBWIDG_CODE" }])
    localStorage.clear()
    await renderAt("/tables/Banner/NOSUCH")
    expect(recent()).toEqual([])
  })

  it("lists them newest first, leaves out hidden ones, and clears", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([
        { kind: "table", product: "Banner", name: "SWBWIDG", column: "SWBWIDG_CODE" },
        { kind: "api", family: "SprocketAPIs", name: "sprockets", version: "1.0.0" },
        { kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version: "1.0.0" },
      ]),
    )
    await renderAt("/apis")
    await click("Favourites")
    const links = [...document.querySelectorAll('[data-slot="sheet-content"] li a')].map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/tables/Banner/SWBWIDG/SWBWIDG_CODE", "/apis/BannerWidgetAPIs/widget-requests?version=1.0.0"])
    expect(text()).not.toContain("sprockets")
    await click("Clear")
    expect(text()).toContain("Nothing yet.")
    expect(recent()).toEqual([])
  })
})

describe("forms", () => {
  beforeEach(() => {
    server.forms = [{ product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] }]
    server.formDetails = {
      "Banner/SWAWIDG": {
        product: "Banner",
        code: "SWAWIDG",
        title: "Widget Maintenance",
        titles: [],
        apis: [{ id: "BannerWidgetAPIs/widget-requests", versions: ["1.0.0"], baseTables: [] }],
      },
    }
  })

  it("stars a form on its page, and lists it in the panel under Forms", async () => {
    await renderAt("/forms/Banner/SWAWIDG")
    await clickStar("SWAWIDG")
    expect(saved()).toEqual([{ kind: "form", product: "Banner", code: "SWAWIDG" }])
    await click("Favourites")
    expect(text()).toContain("Forms")
    expect(panelLinks()).toMatchObject({ SWAWIDG: "/forms/Banner/SWAWIDG" })
  })

  it("records a form's page in Recently viewed", async () => {
    await renderAt("/forms/Banner/SWAWIDG")
    expect(recent()).toEqual([{ kind: "form", product: "Banner", code: "SWAWIDG" }])
  })
})

