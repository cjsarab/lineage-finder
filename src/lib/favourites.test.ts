// @vitest-environment jsdom
// Favourites and Recently viewed: saving, the recent list, and the checks against the
// index. Made-up APIs and tables only.
import { afterEach, describe, expect, it } from "vitest"
import type { FormSummary, TableDetail, TableSummary } from "@/lib/server"
import { fakeApi } from "@/test-support/fake-app"
import {
  addRecent,
  apiState,
  clearRecent,
  columnState,
  FAVOURITES_KEY,
  favourites,
  formState,
  RECENT_KEY,
  recent,
  recordRecent,
  setFavourite,
  shownRecent,
  sortFavourites,
  tableState,
  type Favourite,
  type Recent,
} from "./favourites"

afterEach(() => localStorage.clear())

const apis = [
  fakeApi("BannerWidgetAPIs", "widget-requests", { versions: ["1.0.0", "2.0.0", "2.1.0"] }),
  fakeApi("SprocketAPIs", "sprockets"),
]
const widgetRequests = (version: string, newest = version): Favourite & { kind: "api" } => ({
  kind: "api",
  family: "BannerWidgetAPIs",
  name: "widget-requests",
  version,
  newest,
})

describe("saving favourites", () => {
  it("saves, keeps one copy, and removes", () => {
    const table: Favourite = { kind: "table", product: "Banner", name: "SWBWIDG" }
    setFavourite(table, true)
    setFavourite(table, true)
    setFavourite(widgetRequests("2.1.0"), true)
    expect(favourites()).toEqual([table, widgetRequests("2.1.0")])
    setFavourite(table, false)
    expect(favourites()).toEqual([widgetRequests("2.1.0")])
  })

  it("keeps each version of an API separately", () => {
    setFavourite(widgetRequests("1.0.0", "2.1.0"), true)
    setFavourite(widgetRequests("2.1.0"), true)
    setFavourite(widgetRequests("1.0.0", "2.1.0"), false)
    expect(favourites()).toEqual([widgetRequests("2.1.0")])
  })

  it("leaves out anything unreadable instead of failing", () => {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify([{ kind: "table", product: "Banner", name: "SWBWIDG" }, { kind: "api" }, 7, null]))
    expect(favourites()).toEqual([{ kind: "table", product: "Banner", name: "SWBWIDG" }])
    localStorage.setItem(FAVOURITES_KEY, "not json")
    expect(favourites()).toEqual([])
  })

  it("sorts A–Z within APIs, then tables, then columns", () => {
    const list: Favourite[] = [
      { kind: "column", product: "Banner", table: "SWBWIDG", column: "SWBWIDG_CODE" },
      { kind: "table", product: "Banner", name: "SWBWIDG" },
      { kind: "table", product: "Banner", name: "GWBWIDG" },
      widgetRequests("2.1.0"),
      { kind: "api", family: "SprocketAPIs", name: "sprockets", version: "1.0.0", newest: "1.0.0" },
      widgetRequests("1.0.0", "2.1.0"),
    ]
    expect(sortFavourites(list).map((f) => (f.kind === "api" ? `${f.name} ${f.version}` : f.kind === "table" ? f.name : f.kind === "column" ? f.column : f.code))).toEqual([
      "sprockets 1.0.0",
      "widget-requests 1.0.0",
      "widget-requests 2.1.0",
      "GWBWIDG",
      "SWBWIDG",
      "SWBWIDG_CODE",
    ])
  })
})

describe("recently viewed", () => {
  const api = (version: string): Recent => ({ kind: "api", family: "BannerWidgetAPIs", name: "widget-requests", version })
  const table = (name: string, column: string | null = null): Recent => ({ kind: "table", product: "Banner", name, column })

  it("puts the newest first, keeps one entry per API or table, and stops at 10", () => {
    let list: Recent[] = []
    list = addRecent(list, api("1.0.0"))
    list = addRecent(list, table("SWBWIDG"))
    list = addRecent(list, api("2.1.0"))
    list = addRecent(list, table("SWBWIDG", "SWBWIDG_CODE"))
    expect(list).toEqual([table("SWBWIDG", "SWBWIDG_CODE"), api("2.1.0")])
    for (let i = 0; i < 12; i++) list = addRecent(list, table(`T${i}`))
    expect(list).toHaveLength(10)
    expect(list[0]).toEqual(table("T11"))
  })

  it("is remembered, and Clear empties it", () => {
    recordRecent(api("2.1.0"))
    recordRecent(table("SWBWIDG"))
    expect(recent()).toEqual([table("SWBWIDG"), api("2.1.0")])
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toHaveLength(2)
    clearRecent()
    expect(recent()).toEqual([])
  })

  it("leaves out what's gone or hidden, and links to the version or column last seen", () => {
    const tables: TableSummary[] = [
      { product: "Banner", name: "SWBWIDG", apis: ["BannerWidgetAPIs/widget-requests"], cols: [] },
      { product: "Banner", name: "SPROCKT", apis: ["SprocketAPIs/sprockets"], cols: [] },
    ]
    const list: Recent[] = [
      api("1.0.0"),
      table("SWBWIDG", "SWBWIDG_CODE"),
      table("GONE"),
      table("SPROCKT"),
      { kind: "api", family: "SprocketAPIs", name: "sprockets", version: "1.0.0" },
      { kind: "api", family: "BannerWidgetAPIs", name: "old-api", version: "1.0.0" },
    ]
    expect(shownRecent(list, apis, tables, ["SprocketAPIs"]).map((r) => r.path)).toEqual([
      "/apis/BannerWidgetAPIs/widget-requests?version=1.0.0",
      "/tables/Banner/SWBWIDG/SWBWIDG_CODE",
    ])
  })
})

describe("checks against the index", () => {
  it("links to the version saved: the plain address for the newest", () => {
    expect(apiState(widgetRequests("2.1.0"), apis, [])).toEqual({ kind: "ok", path: "/apis/BannerWidgetAPIs/widget-requests", newer: null })
    expect(apiState(widgetRequests("1.0.0", "2.1.0"), apis, [])).toEqual({
      kind: "ok",
      path: "/apis/BannerWidgetAPIs/widget-requests?version=1.0.0",
      newer: null,
    })
  })

  it("mentions a newer version only when it arrived after saving", () => {
    // Saved when 2.0.0 was the newest; 2.1.0 has arrived since.
    expect(apiState(widgetRequests("2.0.0"), apis, [])).toMatchObject({ newer: { version: "2.1.0", path: "/apis/BannerWidgetAPIs/widget-requests" } })
    expect(apiState(widgetRequests("1.0.0", "2.0.0"), apis, [])).toMatchObject({ newer: { version: "2.1.0" } })
    // An older version saved on purpose while 2.1.0 was already the newest: no note.
    expect(apiState(widgetRequests("1.0.0", "2.1.0"), apis, [])).toMatchObject({ newer: null })
  })

  it("says when an API or its version has gone, or its family is hidden", () => {
    expect(apiState(widgetRequests("0.9.0", "2.1.0"), apis, [])).toEqual({ kind: "versionGone", newestPath: "/apis/BannerWidgetAPIs/widget-requests" })
    expect(apiState({ ...widgetRequests("1.0.0"), name: "old-api" }, apis, [])).toEqual({ kind: "gone" })
    expect(apiState(widgetRequests("2.1.0"), apis, ["BannerWidgetAPIs"])).toEqual({ kind: "hidden" })
  })

  it("checks tables and columns", () => {
    const tables: TableSummary[] = [{ product: "Banner", name: "SWBWIDG", apis: ["BannerWidgetAPIs/widget-requests", "SprocketAPIs/sprockets"], cols: [] }]
    const t = { kind: "table", product: "Banner", name: "SWBWIDG" } as const
    expect(tableState(t, tables, [])).toEqual({ kind: "ok", path: "/tables/Banner/SWBWIDG" })
    expect(tableState(t, tables, ["SprocketAPIs"])).toEqual({ kind: "ok", path: "/tables/Banner/SWBWIDG" })
    expect(tableState(t, tables, ["SprocketAPIs", "BannerWidgetAPIs"])).toEqual({ kind: "hidden" })
    expect(tableState({ ...t, name: "GONE" }, tables, [])).toEqual({ kind: "gone" })

    const detail: TableDetail = {
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
    const c = (column: string) => ({ kind: "column", product: "Banner", table: "SWBWIDG", column }) as const
    expect(columnState(c("SWBWIDG_CODE"), detail, [])).toEqual({ kind: "ok", path: "/tables/Banner/SWBWIDG/SWBWIDG_CODE" })
    expect(columnState(c("SWBWIDG_GEAR"), detail, ["SprocketAPIs"])).toEqual({ kind: "hidden" })
    expect(columnState(c("SWBWIDG_GONE"), detail, [])).toEqual({ kind: "gone" })
    expect(columnState(c("SWBWIDG_CODE"), null, [])).toEqual({ kind: "gone" })
  })
})

describe("forms", () => {
  const forms: FormSummary[] = [{ product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] }]
  const form = { kind: "form", product: "Banner", code: "SWAWIDG" } as const

  it("saves a form, listed after APIs, tables and columns", () => {
    setFavourite(form, true)
    setFavourite({ kind: "table", product: "Banner", name: "SWBWIDG" }, true)
    expect(favourites()).toEqual([form, { kind: "table", product: "Banner", name: "SWBWIDG" }])
    expect(sortFavourites(favourites()).map((f) => f.kind)).toEqual(["table", "form"])
  })

  it("checks a form against the index: there, hidden or gone", () => {
    expect(formState(form, forms, [])).toEqual({ kind: "ok", path: "/forms/Banner/SWAWIDG" })
    expect(formState(form, forms, ["BannerWidgetAPIs"])).toEqual({ kind: "hidden" })
    expect(formState({ ...form, code: "GONE" }, forms, [])).toEqual({ kind: "gone" })
  })

  it("keeps forms in Recently viewed, one entry each, leaving out gone ones", () => {
    const list: Recent[] = [form, { kind: "form", product: "Banner", code: "GONE" }]
    expect(addRecent([form], form)).toEqual([form])
    expect(shownRecent(list, apis, [], [], forms).map((r) => r.path)).toEqual(["/forms/Banner/SWAWIDG"])
    recordRecent(form)
    expect(recent()).toEqual([form])
  })
})

