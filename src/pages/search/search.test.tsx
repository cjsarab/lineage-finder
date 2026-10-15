// @vitest-environment jsdom
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import type { SearchField } from "@/lib/server"
import { choose, click, follow, page, renderAt, server, settle, summary, text, typeInto, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const ref = (text: string, table: string, column: string) => ({ kind: "ref" as const, text, places: [{ table, column }] })

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.search = {
    apis: [
      {
        // Versions 1.0.0 and 2.1.0 (src/test-support/fake-app.tsx).
        id: "BannerWidgetAPIs/widget-requests",
        fields: [
          { path: "code", values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")], v: [0, 1] },
          { path: "requestType", v: [1] },
          { path: "requestType.code", values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")], v: [1] },
          { path: "oldCode", values: [ref("SWBWIDG_OLD_CODE", "SWBWIDG", "SWBWIDG_OLD_CODE")], v: [0] },
          { path: "total", values: [{ kind: "derived", text: "Adds up SWRCOST_AMOUNT." }], v: [1] },
        ],
      },
      { id: "ColleagueWidgetAPIs/widget-requests", fields: [{ path: "code", values: [ref("WIDGET.CODE", "WIDGET", "CODE")], v: [0] }] },
    ],
    tables: [
      {
        product: "Banner",
        name: "SWBWIDG",
        apis: ["BannerWidgetAPIs/widget-requests"],
        columns: [
          { name: "SWBWIDG_CODE", apis: [0] },
          { name: "SWBWIDG_OLD_CODE", apis: [0] },
        ],
      },
      { product: "Colleague", name: "WIDGET", apis: ["ColleagueWidgetAPIs/widget-requests"], columns: [{ name: "CODE", apis: [0] }] },
    ],
  }
})

const search = () => new URLSearchParams(window.location.search)
/** The groups shown, each with its heading and the first link of each row. */
const groups = () =>
  [...page().querySelectorAll("main section")].map((s) => ({
    heading: s.querySelector("h2")?.textContent,
    rows: [...s.querySelectorAll("li")].map((li) => li.querySelector("a")?.textContent),
  }))
const row = (label: string) => [...page().querySelectorAll("main li")].find((li) => li.querySelector("a")?.textContent === label)

describe("the Search page", () => {
  it("opens from the header, says what it searches, and fetches the search file once", async () => {
    await renderAt("/")
    await follow("Search", "/search")
    expect(window.location.pathname).toBe("/search")
    expect(text()).toContain("every word you type must appear")
    await follow("APIs", "/apis")
    await follow("Search", "/search")
    expect(window.location.pathname).toBe("/search")
    expect(server.asked.filter((a) => a === "/api/search")).toHaveLength(1)
    expect(server.asked).not.toContain("/api/search/descriptions")
  })

  it("shows results as you type, grouped, keeping the search in the address", async () => {
    await renderAt("/search")
    const before = window.history.length
    await typeInto("Search", "code")
    expect(search().get("q")).toBe("code")
    expect(window.history.length).toBe(before) // typing replaces the address
    expect(groups()).toEqual([
      { heading: "APIs (1)", rows: ["widget-codes"] },
      { heading: "Fields (4)", rows: ["code", "code", "requestType.code", "oldCode"] },
      { heading: "Tables (0)", rows: [] },
      { heading: "Columns (3)", rows: ["CODE", "SWBWIDG_CODE", "SWBWIDG_OLD_CODE"] },
    ].filter((g) => g.rows.length > 0))
  })

  it("finds part of a column's name, and every word in any order", async () => {
    await renderAt("/search?q=old+code")
    expect(groups().map((g) => g.heading)).toEqual(["Fields (1)", "Columns (1)"])
    await typeInto("Search", "swbwidg old")
    expect(groups().map((g) => g.heading)).toEqual(["Fields (1)", "Columns (1)"])
  })

  it("shows a field's API, version and lineage, and an older-versions-only field as such", async () => {
    await renderAt("/search?q=code")
    expect(row("requestType.code")?.textContent).toBe("requestType.codewidget-requests 2.1.0SWBWIDG.SWBWIDG_CODE")
    expect(row("oldCode")?.textContent).toContain("widget-requests (older versions only)")
    expect(row("SWBWIDG_CODE")?.textContent).toBe("SWBWIDG_CODESWBWIDG · Banner1 API")
  })

  it("opens a field on its API's page at the version that has it, with the Fields filter set to it", async () => {
    server.fields["BannerWidgetAPIs/widget-requests"] = {
      "widget-requests-1.0.0": {
        fields: [
          { name: "code", depth: 0, values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")] },
          { name: "oldCode", depth: 0, values: [ref("SWBWIDG_OLD_CODE", "SWBWIDG", "SWBWIDG_OLD_CODE")] },
        ],
        other: [],
      },
    }
    await renderAt("/search?q=oldcode")
    await follow("oldCode")
    expect(window.location.pathname).toBe("/apis/BannerWidgetAPIs/widget-requests")
    expect(search().get("version")).toBe("1.0.0")
    const box = page().querySelector<HTMLInputElement>('input[aria-label="Filter by field or lineage"]')
    expect(box?.value).toBe("oldCode")
    const fieldNames = [...page().querySelectorAll("main tbody tr td:first-child")].map((td) => td.textContent)
    expect(fieldNames).toEqual(["oldCode"])
  })

  it("matches a field on its API's name too, after fields matching on their own", async () => {
    await renderAt("/search?q=widget+code")
    // All four need the API's name for "widget"; then as ever, whole names (`code`) before the rest.
    expect(groups().find((g) => g.heading?.startsWith("Fields"))?.rows).toEqual(["code", "code", "requestType.code", "oldCode"])
  })

  it("searches derived logic with that switch on (as it starts), and not with it off", async () => {
    await renderAt("/search?q=swrcost")
    expect(row("total")?.textContent).toContain("in derived logic")
    await choose("Derived logic")
    expect(search().get("derived")).toBe("off")
    expect(row("total")).toBeUndefined()
    expect(text()).toContain("Nothing matches.")
  })

  it("fetches the fields' descriptions only when Descriptions is switched on, and searches them", async () => {
    server.searchDescriptions = { "BannerWidgetAPIs/widget-requests": [null, null, null, "The code used before 2020.", null] }
    await renderAt("/search?q=before+2020")
    expect(text()).toContain("Nothing matches.")
    expect(server.asked).not.toContain("/api/search/descriptions")
    await choose("Descriptions")
    expect(search().get("descriptions")).toBe("on")
    expect(server.asked).toContain("/api/search/descriptions")
    expect(row("oldCode")?.textContent).toContain("in description")
  })

  it("shows the first 10 of a group, with Show all listing it alone in pages", async () => {
    const many: SearchField[] = Array.from({ length: 23 }, (_, i) => ({ path: `item${String(i + 1).padStart(2, "0")}`, v: [0] }))
    server.search = { apis: [{ id: "BannerWidgetAPIs/widget-codes", fields: many }], tables: [] }
    await renderAt("/search?q=item")
    expect(groups()[0]).toMatchObject({ heading: "Fields (23)" })
    expect(groups()[0].rows).toHaveLength(10)
    await follow("Show all 23")
    expect(search().get("show")).toBe("fields")
    expect(text()).toContain("1–20 of 23 fields")
    await act(async () => page().querySelector<HTMLAnchorElement>('a[aria-label="Next page"]')!.click())
    await settle()
    expect(search().get("page")).toBe("2")
    expect([...page().querySelectorAll("main li a")].map((a) => a.textContent).filter((t) => t?.startsWith("item"))).toEqual(["item21", "item22", "item23"])
    await follow("All results")
    expect(search().get("show")).toBeNull()
  })

  it("offers close real words when there are few results, and searches for one when clicked", async () => {
    await renderAt("/search?q=swbwigd")
    expect(text()).toContain("Did you mean")
    await click("swbwidg")
    expect(search().get("q")).toBe("swbwidg")
    expect(groups().map((g) => g.heading)).toContain("Tables (1)")
  })

  it("leaves out families hidden in Settings, saying how many results that hides", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["ColleagueWidgetAPIs"]))
    await renderAt("/search?q=code")
    expect(groups().find((g) => g.heading?.startsWith("Fields"))?.rows).toEqual(["code", "requestType.code", "oldCode"])
    expect(text()).toContain("2 more results in families hidden in Settings") // the Colleague field and its column CODE
    await click("Open Settings")
    expect(text()).toContain("Families shown")
  })

  it("says so plainly if the search file can't be loaded", async () => {
    server.failing = ["/api/search"]
    await renderAt("/search?q=code")
    expect(text()).toContain("Couldn't load search")
  })
})

describe("forms", () => {
  beforeEach(() => {
    server.search.forms = [
      { product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] },
      { product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueWidgetAPIs/widget-requests"] },
    ]
  })

  it("shows a Forms group after Tables, a form found by its code or title opening its page", async () => {
    await renderAt("/search?q=widget")
    expect(groups().map((g) => g.heading?.split(/\s/)[0])).toEqual(["APIs", "Fields", "Tables", "Forms"])
    const forms = groups().find((g) => g.heading?.startsWith("Forms"))
    expect(forms?.rows).toEqual(["SWAWIDG", "WDG001"])
    expect(row("SWAWIDG")?.textContent).toContain("Widget Maintenance")
    expect(row("SWAWIDG")?.querySelector("a")?.getAttribute("href")).toBe("/forms/Banner/SWAWIDG")
  })

  it("finds a form by a word of its title alone", async () => {
    await renderAt("/search?q=maintenance")
    expect(groups().map((g) => g.heading?.split(/\s/)[0])).toEqual(["Forms"])
  })

  it("leaves out forms only hidden families use", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["ColleagueWidgetAPIs"]))
    await renderAt("/search?q=intake")
    expect(groups()).toEqual([])
    expect(text()).toContain("in families hidden in Settings")
  })
})

