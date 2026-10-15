// @vitest-environment jsdom
// The forms list and a form's page. Made-up forms only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import type { FormDetail, FormSummary, TableSummary } from "@/lib/server"
import { click, follow, page, renderAt, server, settle, summary, text, typeInto, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const FORMS: FormSummary[] = [
  { product: "Banner", code: "GWIWINQ", title: "Widget Inquiry", apis: ["BannerWidgetAPIs/widget-requests"] },
  {
    product: "Banner",
    code: "SWAWIDG",
    title: "Widget Maintenance",
    apis: ["BannerGadgetAPIs/gadget-summaries", "BannerWidgetAPIs/widget-holds", "BannerWidgetAPIs/widget-requests"],
  },
  { product: "Banner", code: "SWVWTYP", title: "Widget Type Validation", apis: ["BannerWidgetAPIs/widget-types"], table: true },
  { product: "Banner", code: "ZWIWNOT", title: null, apis: ["BannerGadgetAPIs/gadget-summaries"] },
  { product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueWidgetAPIs/widget-requests"] },
]

const SWAWIDG: FormDetail = {
  product: "Banner",
  code: "SWAWIDG",
  title: "Widget Maintenance",
  titles: ["Widget Maintenance Form"],
  apis: [
    { id: "BannerGadgetAPIs/gadget-summaries", versions: ["1.0.0"], baseTables: [], source: "SWAWIDG, SWBWIDG and GWIWINQ" },
    { id: "BannerWidgetAPIs/widget-holds", versions: ["1.0.0"], baseTables: ["SWRHOLD"], older: true },
    { id: "BannerWidgetAPIs/widget-requests", versions: ["1.0.0", "2.0.0"], baseTables: ["SWBWIDG", "SWRWREQ"] },
  ],
}

const TABLES: TableSummary[] = [
  { product: "Banner", name: "SWBWIDG", apis: ["BannerWidgetAPIs/widget-requests"], cols: [] },
  { product: "Banner", name: "SWVWTYP", apis: ["BannerWidgetAPIs/widget-types"], cols: [] },
]

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.forms = FORMS
  server.tables = TABLES
  server.formDetails = {
    "Banner/SWAWIDG": SWAWIDG,
    "Banner/SWVWTYP": { product: "Banner", code: "SWVWTYP", title: "Widget Type Validation", titles: [], apis: [{ id: "BannerWidgetAPIs/widget-types", versions: ["1.0.0"], baseTables: ["SWVWTYP"] }], table: true },
  }
})

/** The form rows on the list. */
const rows = () => [...page().querySelectorAll<HTMLAnchorElement>('main ul a[href^="/forms/"]')].map((a) => a.textContent)
/** The Details box, label → value. */
const details = () => Object.fromEntries([...page().querySelectorAll("main dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]))
/** Each API on a form's page. */
const apis = () => [...page().querySelectorAll("main section ul > li")].map((li) => li.textContent)
const hrefs = () => [...page().querySelectorAll("main a")].map((a) => a.getAttribute("href"))

async function pick(label: string) {
  const l = [...document.querySelectorAll("aside label")].find((x) => x.firstElementChild?.textContent === label)
  const box = l?.getAttribute("for") ? document.getElementById(l.getAttribute("for")!) : null
  if (!box) throw new Error(`No "${label}" option. Page says: ${text()}`)
  await act(async () => box.click())
  await settle()
}

describe("the forms list", () => {
  it("opens from the header, after Tables, with Banner forms A–Z: code, title, APIs and 'also a table'", async () => {
    await renderAt("/")
    expect([...document.querySelectorAll('nav[aria-label="Pages"] a')].map((a) => a.textContent)).toEqual(["APIs", "Tables", "Forms", "Search"])
    await follow("Forms", "/forms")
    expect(window.location.pathname).toBe("/forms")
    expect(text()).toContain("4 Banner forms")
    expect(rows()).toEqual([
      "GWIWINQWidget Inquiry1 API",
      "SWAWIDGWidget Maintenance3 APIs",
      "SWVWTYPWidget Type Validationalso a table1 API",
      "ZWIWNOTno title in the catalog1 API",
    ])
  })

  it("switches to Colleague forms", async () => {
    await renderAt("/forms")
    await pick("Colleague")
    expect(rows()).toEqual(["WDG001Widget Intake (WDGI)1 API"])
  })

  it("filters by module and by code or title", async () => {
    await renderAt("/forms")
    expect([...document.querySelectorAll("aside label")].map((l) => l.firstElementChild?.textContent)).toEqual(["Banner", "Colleague", "Student (S)", "General (G)", "Other"])
    await pick("General (G)")
    expect(rows()).toEqual(["GWIWINQWidget Inquiry1 API"])
    await click("Clear filters")
    await typeInto("Filter by form code or title", "type valid")
    expect(rows()).toEqual(["SWVWTYPWidget Type Validationalso a table1 API"])
    await typeInto("Filter by form code or title", "swaw")
    expect(rows()).toEqual(["SWAWIDGWidget Maintenance3 APIs"])
  })

  it("leaves out families hidden in Settings", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerGadgetAPIs"]))
    await renderAt("/forms")
    expect(rows()).toEqual(["GWIWINQWidget Inquiry1 API", "SWAWIDGWidget Maintenance2 APIs", "SWVWTYPWidget Type Validationalso a table1 API"])
  })
})

describe("a form's page", () => {
  it("shows its title, Details and every API built on it, with versions and base tables", async () => {
    await renderAt("/forms")
    await follow("SWAWIDG")
    expect(window.location.pathname).toBe("/forms/Banner/SWAWIDG")
    expect(page().querySelector("h1")?.textContent).toBe("SWAWIDGWidget Maintenance")
    expect(details()).toEqual({
      Product: "Banner",
      Module: "Student (S)",
      APIs: "3 (1 in older versions only)",
      Families: "BannerWidgetAPIs2 APIsBannerGadgetAPIs1 API",
      "Other titles": "Widget Maintenance Form",
    })
    expect(apis()).toEqual([
      "gadget-summariesBannerGadgetAPIs1.0.0Also names SWAWIDG, SWBWIDG and GWIWINQ",
      "widget-holdsBannerWidgetAPIs1.0.0older versions onlyBase table SWRHOLD",
      "widget-requestsBannerWidgetAPIs1.0.0, 2.0.0Base tables SWBWIDG, SWRWREQ",
    ])
    expect(hrefs()).toEqual(
      expect.arrayContaining(["/apis/BannerWidgetAPIs/widget-requests", "/tables/Banner/SWRWREQ", "/forms?module=S", "/forms/Banner/GWIWINQ", "/tables/Banner/SWBWIDG"]),
    )
    expect(page().querySelector('input[aria-label="Filter by API name"]')).toBeNull() // 3 APIs: no filter box
    // The ERP value's own form isn't linked to itself; a name that's neither a known form nor a table isn't linked.
    expect(hrefs()).not.toContain("/forms/Banner/SWAWIDG")
  })

  it("links a form that's also a table to the table", async () => {
    await renderAt("/forms/Banner/SWVWTYP")
    expect(details()["Also a table"]).toBe("SWVWTYP")
    expect(hrefs()).toContain("/tables/Banner/SWVWTYP")
  })

  it("goes back to the list as you left it", async () => {
    await renderAt("/forms?name=widget")
    await follow("SWAWIDG")
    await click("Back to the list")
    await settle()
    expect(window.location.pathname).toBe("/forms")
    expect(window.location.search).toBe("?name=widget")
  })

  it("filters its APIs by name once there are more than 5", async () => {
    const many = ["a", "b", "c", "d", "e", "holds"].map((x) => ({ id: `BannerWidgetAPIs/widget-${x}`, versions: ["1.0.0"], baseTables: [] }))
    server.formDetails["Banner/SWAWIDG"] = { ...SWAWIDG, apis: many }
    await renderAt("/forms/Banner/SWAWIDG")
    await typeInto("Filter by API name", "holds")
    expect(apis()).toEqual(["widget-holdsBannerWidgetAPIs1.0.0"])
  })

  it("says when there's no such form", async () => {
    await renderAt("/forms/Banner/NOSUCH")
    expect(text()).toContain("No Banner form called NOSUCH in the index.")
  })

  it("says when only hidden families use it", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerWidgetAPIs"]))
    await renderAt("/forms/Banner/SWVWTYP")
    expect(text()).toContain("SWVWTYP is only used by families hidden in Settings.")
  })

  it("leaves out hidden families' APIs", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerGadgetAPIs"]))
    await renderAt("/forms/Banner/SWAWIDG")
    expect(apis().map((a) => a.split("Banner")[0])).toEqual(["widget-holds", "widget-requests"])
  })
})
