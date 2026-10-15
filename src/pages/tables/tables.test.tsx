// @vitest-environment jsdom
// The tables list and table page. Made-up tables only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import type { TableDetail, TableSummary } from "@/lib/server"
import { button, choose, click, follow, page, renderAt, server, settle, summary, text, typeInto, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const TABLES: TableSummary[] = [
  { product: "Banner", name: "GWBWIDG", apis: ["BannerWidgetAPIs/widget-requests"], cols: [[0]] },
  { product: "Banner", name: "KWBWIDG", apis: ["BannerWidgetAPIs/widget-requests"], cols: [] },
  { product: "Banner", name: "SWBWIDG", apis: ["BannerGadgetAPIs/gadget-summaries", "BannerWidgetAPIs/widget-requests"], cols: [[0, 1], [1]] },
  { product: "Banner", name: "SWRGUES", apis: ["BannerWidgetAPIs/widget-requests"], cols: [[0]], probable: true },
  { product: "Colleague", name: "SWBWIDG", apis: ["ColleagueWidgetAPIs/widget-requests"], cols: [[0]] },
]

const SWBWIDG: TableDetail = {
  product: "Banner",
  name: "SWBWIDG",
  columns: [
    { name: "SWBWIDG_CODE", apis: ["BannerGadgetAPIs/gadget-summaries", "BannerWidgetAPIs/widget-requests"] },
    { name: "SWBWIDG_TITLE", apis: ["BannerWidgetAPIs/widget-requests"], probable: true },
  ],
  apis: [
    { id: "BannerGadgetAPIs/gadget-summaries", older: true, fields: [{ path: "code", column: "SWBWIDG_CODE", older: true }] },
    {
      id: "BannerWidgetAPIs/widget-requests",
      fields: [
        { path: "code", column: "SWBWIDG_CODE" },
        { path: "owner.title", column: "SWBWIDG_TITLE", probable: true },
        { path: "legacy", column: "SWBWIDG_CODE", schema: "OldWidget" },
      ],
    },
  ],
  alsoIn: ["Colleague"],
}

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.tables = TABLES
  server.tableDetails = {
    "Banner/SWBWIDG": SWBWIDG,
    "Banner/KWBWIDG": { product: "Banner", name: "KWBWIDG", columns: [], apis: [{ id: "BannerWidgetAPIs/widget-requests", fields: [{ path: "kind" }] }], alsoIn: [] },
  }
})

/** The table rows on the list, by name. */
const rows = () => [...page().querySelectorAll<HTMLAnchorElement>('main ul a[href^="/tables/"]')].map((a) => a.textContent)
const search = () => new URLSearchParams(window.location.search)
/** A table's Details box, label → value. */
const details = () => Object.fromEntries([...page().querySelectorAll("main dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]))
/** Each API block on a table's page: its heading, counts and the fields shown. */
const blocks = () =>
  [...page().querySelectorAll("main section > div > ul > li")].map((li) => ({
    heading: li.querySelector("h3")?.textContent,
    counts: li.querySelector("h3")?.nextElementSibling?.textContent,
    fields: [...li.querySelectorAll(":scope > ul > li")].map((f) => f.textContent),
  }))

/** Ticks the module (or picks the product) whose label starts with `label` (labels end with a count). */
async function pick(label: string) {
  const l = [...document.querySelectorAll("aside label")].find((x) => x.firstElementChild?.textContent === label)
  const box = l?.getAttribute("for") ? document.getElementById(l.getAttribute("for")!) : null
  if (!box) throw new Error(`No "${label}" option. Page says: ${text()}`)
  await act(async () => box.click())
  await settle()
}

describe("the tables list", () => {
  it("opens from the header with Banner tables A–Z, their columns and APIs, and what's probable or has no columns", async () => {
    await renderAt("/")
    await follow("Tables", "/tables")
    expect(window.location.pathname).toBe("/tables")
    expect(text()).toContain("4 Banner tables")
    expect(rows()).toEqual(["GWBWIDG1 column·1 API", "KWBWIDGno columns named1 API", "SWBWIDG2 columns·2 APIs", "SWRGUESprobable1 column·1 API"])
  })

  it("switches product, keeping Colleague files apart", async () => {
    await renderAt("/tables")
    await pick("Colleague")
    expect(search().get("product")).toBe("Colleague")
    expect(rows()).toEqual(["SWBWIDG1 column·1 API"])
    expect(text()).not.toContain("Student (S)") // modules are Banner's only
  })

  it("filters Banner tables by module, named with their letter, and by name", async () => {
    await renderAt("/tables")
    expect([...document.querySelectorAll("aside label")].map((l) => l.firstElementChild?.textContent)).toEqual(["Banner", "Colleague", "Student (S)", "General (G)", "Other"])
    await pick("Student (S)")
    expect(search().getAll("module")).toEqual(["S"])
    expect(rows().map((r) => r!.slice(0, 7))).toEqual(["SWBWIDG", "SWRGUES"])
    await typeInto("Filter by table name", "rgu")
    expect(rows().map((r) => r!.slice(0, 7))).toEqual(["SWRGUES"])
    await click("Clear filters")
    expect(rows()).toHaveLength(4)
  })

  it("leaves out families hidden in Settings", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerGadgetAPIs", "ColleagueWidgetAPIs"]))
    await renderAt("/tables")
    // Both columns are still used by the API shown; the hidden family's API isn't counted.
    expect(rows()).toContain("SWBWIDG2 columns·1 API")
    expect(text()).toContain("2 families hidden in Settings")
    expect(text()).not.toContain("Colleague")
  })

  it("splits a long list into pages", async () => {
    server.tables = Array.from({ length: 45 }, (_, i) => ({ product: "Banner", name: `SWB${String(i).padStart(4, "0")}`, apis: ["BannerWidgetAPIs/widget-requests"], cols: [] }))
    await renderAt("/tables")
    expect(text()).toContain("1–20 of 45 Banner tables")
    expect(rows()).toHaveLength(20)
  })
})

describe("a table's page", () => {
  it("shows its columns and every API and field using it, with links both ways", async () => {
    await renderAt("/tables")
    await follow("SWBWIDG")
    expect(window.location.pathname).toBe("/tables/Banner/SWBWIDG")
    expect(details()).toEqual({
      Product: "Banner",
      Module: "Student (S)",
      Columns: "2",
      APIs: "2 (1 in older versions only)",
      Families: "BannerGadgetAPIs1 APIBannerWidgetAPIs1 API",
      "Also named in": "Colleague",
    })
    const columns = [...page().querySelectorAll("main section tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent))
    expect(columns).toEqual([
      ["SWBWIDG_CODE", "2"],
      ["SWBWIDG_TITLEprobable", "1"],
    ])
    expect(blocks()).toEqual([
      { heading: "gadget-summariesBannerGadgetAPIsolder versions only", counts: "1 field · 1 column", fields: ["codeSWBWIDG_CODE"] },
      {
        heading: "widget-requestsBannerWidgetAPIs",
        counts: "3 fields · 2 columns",
        fields: ["codeSWBWIDG_CODE", "owner.titleSWBWIDG_TITLEprobable", "legacySWBWIDG_CODEin OldWidget, not used by any method"],
      },
    ])
    await follow("widget-requests")
    expect(window.location.pathname).toBe("/apis/BannerWidgetAPIs/widget-requests")
  })

  it("links the module and families in Details to the lists", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    await follow("Student (S)")
    expect(window.location.pathname + window.location.search).toBe("/tables?product=Banner&module=S")
    expect(rows().map((r) => r!.slice(0, 7))).toEqual(["SWBWIDG", "SWRGUES"])
  })

  it("goes back to the list as you left it", async () => {
    await renderAt("/tables?module=S")
    await follow("SWBWIDG")
    await click("Back to the list")
    expect(window.location.search).toBe("?module=S")
  })

  it("shows the first 6 fields of an API until asked for all, and the filter leaves only matching fields", async () => {
    server.tableDetails["Banner/SWBWIDG"] = {
      ...SWBWIDG,
      apis: [{ id: "BannerWidgetAPIs/widget-requests", fields: Array.from({ length: 9 }, (_, i) => ({ path: `field${i}`, column: i === 7 ? "SWBWIDG_SPECIAL" : "SWBWIDG_CODE" })) }],
    }
    await renderAt("/tables/Banner/SWBWIDG")
    expect(blocks()[0].fields).toHaveLength(6)
    await click("Show all 9 fields")
    expect(blocks()[0].fields).toHaveLength(9)
    await click("Show fewer")
    expect(blocks()[0].fields).toHaveLength(6)
    await typeInto("Filter by API, field or column", "special")
    expect(blocks()[0]).toMatchObject({ counts: "1 of 9 fields match · 2 columns", fields: ["field7SWBWIDG_SPECIAL"] })
  })

  it("filters the APIs by name, field or column", async () => {
    server.tableDetails["Banner/SWBWIDG"] = {
      ...SWBWIDG,
      apis: Array.from({ length: 7 }, (_, i) => ({ id: `BannerWidgetAPIs/widget-${i}`, fields: [{ path: i === 3 ? "special" : "code", column: "SWBWIDG_CODE" }] })),
    }
    await renderAt("/tables/Banner/SWBWIDG")
    await typeInto("Filter by API, field or column", "special")
    expect([...page().querySelectorAll('main a[href^="/apis/"]')].map((a) => a.textContent)).toEqual(["widget-3"])
  })

  it("says when the catalog names no columns", async () => {
    await renderAt("/tables/Banner/KWBWIDG")
    expect(text()).toContain("The catalog names no columns for this table")
    expect(details()).toMatchObject({ Module: "Other", Columns: "none named", APIs: "1", Family: "BannerWidgetAPIs1 API" })
  })

  it("says when there's no such table", async () => {
    await renderAt("/tables/Banner/NOSUCH")
    expect(text()).toContain("No Banner table called NOSUCH in the index.")
    expect(button("See every table")).toBeNull() // it's a link
  })

  it("says when only hidden families use it", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerWidgetAPIs", "BannerGadgetAPIs"]))
    await renderAt("/tables/Banner/SWBWIDG")
    expect(text()).toContain("SWBWIDG is only used by families hidden in Settings.")
  })

  it("leaves out hidden families' APIs and columns only they use", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerWidgetAPIs"]))
    await renderAt("/tables/Banner/SWBWIDG")
    expect(details()).toMatchObject({ Columns: "1", APIs: "1 (1 in older versions only)", Family: "BannerGadgetAPIs1 API" })
    expect(text()).not.toContain("SWBWIDG_TITLE")
  })
})

describe("from an API's fields", () => {
  it("links each table to its page, within the API's product", async () => {
    server.fields = {
      "BannerWidgetAPIs/widget-requests": {
        "widget-requests-2.1.0": { fields: [{ name: "code", depth: 0, values: [{ kind: "ref", text: "SWBWIDG_CODE", places: [{ table: "SWBWIDG", column: "SWBWIDG_CODE" }] }] }], other: [] },
      },
    }
    await renderAt("/apis/BannerWidgetAPIs/widget-requests")
    await follow("SWBWIDG", "/tables/Banner/SWBWIDG")
    expect(window.location.pathname).toBe("/tables/Banner/SWBWIDG")
    expect(text()).toContain("SWBWIDG_TITLE")
  })
})

describe("a table's page narrowed to one column", () => {
  /** The Columns list's rows, and which one is marked as chosen. */
  const columnRows = () => [...page().querySelectorAll("main section tbody tr")].map((r) => r.querySelector("td")?.textContent)
  const chosenRow = () => page().querySelector('main section tbody tr[aria-current="true"]')?.querySelector("td")?.textContent
  const headings = () => [...page().querySelectorAll("main h2")].map((h) => h.textContent)

  it("opens from a column in an API's fields, keeping only the fields naming exactly that column", async () => {
    server.fields = {
      "BannerWidgetAPIs/widget-requests": {
        "widget-requests-2.1.0": { fields: [{ name: "code", depth: 0, values: [{ kind: "ref", text: "SWBWIDG_CODE", places: [{ table: "SWBWIDG", column: "SWBWIDG_CODE" }] }] }], other: [] },
      },
    }
    await renderAt("/apis/BannerWidgetAPIs/widget-requests")
    await follow("SWBWIDG_CODE", "/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    expect(window.location.pathname).toBe("/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    expect(chosenRow()).toBe("SWBWIDG_CODE")
    expect(headings()).toContain("APIs using SWBWIDG_CODE")
    expect(text()).toContain("SWBWIDG_CODE: 2 APIs (1 in older versions only), 3 fields")
    // The column isn't repeated beside each field, and the counts leave out "· 1 column".
    expect(blocks()).toEqual([
      { heading: "gadget-summariesBannerGadgetAPIsolder versions only", counts: "1 field", fields: ["code"] },
      { heading: "widget-requestsBannerWidgetAPIs", counts: "2 fields", fields: ["code", "legacyin OldWidget, not used by any method"] },
    ])
    // Details stays the table's.
    expect(details()).toMatchObject({ Columns: "2", APIs: "2 (1 in older versions only)" })
  })

  it("moves between columns and back to the whole table without adding to Back", async () => {
    await renderAt("/tables?module=S")
    await follow("SWBWIDG")
    const depth = window.history.length
    await follow("SWBWIDG_CODE", "/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    await follow("SWBWIDG_TITLE", "/tables/Banner/SWBWIDG/SWBWIDG_TITLE")
    expect(window.location.pathname).toBe("/tables/Banner/SWBWIDG/SWBWIDG_TITLE")
    expect(chosenRow()).toBe("SWBWIDG_TITLEprobable")
    expect(text()).toContain("SWBWIDG_TITLE: 1 API, 1 field")
    expect(blocks().map((b) => b.fields)).toEqual([["owner.titleprobable"]])
    await follow("Show all APIs using the whole table")
    expect(window.location.pathname).toBe("/tables/Banner/SWBWIDG")
    expect(chosenRow()).toBeUndefined()
    expect(headings()).toContain("APIs using this table")
    expect(window.history.length).toBe(depth)
    await click("Back to the list")
    expect(window.location.search).toBe("?module=S")
  })

  it("links each field's column in the whole table's API blocks", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    await follow("SWBWIDG_TITLE", "/tables/Banner/SWBWIDG/SWBWIDG_TITLE")
    expect(chosenRow()).toBe("SWBWIDG_TITLEprobable")
  })

  it("opens the Columns list on the page with the chosen column", async () => {
    const names = Array.from({ length: 25 }, (_, i) => `SWBWIDG_C${String(i).padStart(2, "0")}`)
    server.tableDetails["Banner/SWBWIDG"] = {
      ...SWBWIDG,
      columns: names.map((name) => ({ name, apis: ["BannerWidgetAPIs/widget-requests"] })),
      apis: [{ id: "BannerWidgetAPIs/widget-requests", fields: names.map((column) => ({ path: column.toLowerCase(), column })) }],
    }
    await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_C22")
    expect(text()).toContain("21–25 of 25 columns")
    expect(chosenRow()).toBe("SWBWIDG_C22")
    expect(columnRows()).toHaveLength(5)
  })

  it("says when the table has no such column, and shows the whole table", async () => {
    await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_GONE")
    expect(text()).toContain("SWBWIDG has no column called SWBWIDG_GONE.")
    expect(headings()).toContain("APIs using this table")
    await follow("Show all APIs using the whole table")
    expect(window.location.pathname).toBe("/tables/Banner/SWBWIDG")
    expect(text()).not.toContain("no column called")
  })

  it("says when only hidden families use the column", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerWidgetAPIs"]))
    await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_TITLE")
    expect(text()).toContain("SWBWIDG_TITLE is only used by families hidden in Settings.")
    expect(button("Open Settings")).not.toBeNull()
  })

  describe("scrolling", () => {
    /** What was scrolled into view, in order: the heading of a section, or the text of a row's first cell. */
    let scrolled: string[]
    beforeEach(() => {
      scrolled = []
      Element.prototype.scrollIntoView = function (this: Element) {
        scrolled.push(this.matches("tr") ? (this.querySelector("td")?.textContent ?? "") : (this.querySelector("h2")?.textContent ?? ""))
      }
      return () => {
        delete (Element.prototype as Partial<Element>).scrollIntoView
      }
    })

    it("scrolls to the column's APIs when a column is chosen in the Columns list or an API block", async () => {
      await renderAt("/tables/Banner/SWBWIDG")
      expect(scrolled).toEqual([])
      await follow("SWBWIDG_CODE", "/tables/Banner/SWBWIDG/SWBWIDG_CODE")
      expect(scrolled).toEqual(["APIs using SWBWIDG_CODE"])
      await follow("Show all APIs using the whole table")
      await follow("SWBWIDG_TITLE", "/tables/Banner/SWBWIDG/SWBWIDG_TITLE") // the last one: in an API block
      expect(scrolled).toEqual(["APIs using SWBWIDG_CODE", "APIs using SWBWIDG_TITLE"])
    })

    it("scrolls the same way when arriving at a column from an API's lineage or its own address", async () => {
      server.fields = {
        "BannerWidgetAPIs/widget-requests": {
          "widget-requests-2.1.0": { fields: [{ name: "code", depth: 0, values: [{ kind: "ref", text: "SWBWIDG_CODE", places: [{ table: "SWBWIDG", column: "SWBWIDG_CODE" }] }] }], other: [] },
        },
      }
      await renderAt("/apis/BannerWidgetAPIs/widget-requests")
      await follow("SWBWIDG_CODE", "/tables/Banner/SWBWIDG/SWBWIDG_CODE")
      expect(scrolled).toEqual(["APIs using SWBWIDG_CODE"])
    })

    it("scrolls once per column, not again when the page redraws", async () => {
      // Enough APIs for the APIs filter to show.
      server.tableDetails["Banner/SWBWIDG"] = {
        ...SWBWIDG,
        apis: Array.from({ length: 6 }, (_, i) => ({ id: `BannerWidgetAPIs/widget-${i}`, fields: [{ path: "code", column: "SWBWIDG_CODE" }] })),
      }
      await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_CODE")
      expect(scrolled).toEqual(["APIs using SWBWIDG_CODE"])
      await click("Pick another column")
      await typeInto("Filter by API or field", "code")
      expect(scrolled).toEqual(["APIs using SWBWIDG_CODE", "SWBWIDG_CODE"])
    })

    it("scrolls back up to the chosen column with Pick another column", async () => {
      await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_TITLE")
      await click("Pick another column")
      expect(scrolled).toEqual(["APIs using SWBWIDG_TITLE", "SWBWIDG_TITLEprobable"])
    })
  })

  it("leaves 'or column' out of the APIs filter's words in the column view", async () => {
    const placeholder = () => page().querySelector('input[aria-label^="Filter by API"]')?.getAttribute("placeholder")
    server.tableDetails["Banner/SWBWIDG"] = {
      ...SWBWIDG,
      apis: Array.from({ length: 6 }, (_, i) => ({ id: `BannerWidgetAPIs/widget-${i}`, fields: [{ path: "code", column: "SWBWIDG_CODE" }] })),
    }
    await renderAt("/tables/Banner/SWBWIDG")
    expect(placeholder()).toBe("Filter by API, field or column…")
    await follow("SWBWIDG_CODE", "/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    expect(placeholder()).toBe("Filter by API or field…")
  })
})

describe("base tables and query parameters", () => {
  beforeEach(() => {
    server.tableDetails["Banner/SWBWIDG"] = {
      ...SWBWIDG,
      apis: [
        SWBWIDG.apis[0],
        { id: "BannerWidgetAPIs/widget-holds", base: true, fields: [] },
        { ...SWBWIDG.apis[1], base: true, fields: [...SWBWIDG.apis[1].fields, { path: "code", column: "SWBWIDG_CODE", parameter: true }] },
      ],
    }
  })

  /** Ticks or unticks a box on the page by its label. */
  async function tick(label: string) {
    const l = [...page().querySelectorAll("main label")].find((x) => x.textContent === label)
    const box = l?.getAttribute("for") ? document.getElementById(l.getAttribute("for")!) : null
    if (!box) throw new Error(`No "${label}" box. Page says: ${text()}`)
    await act(async () => box.click())
    await settle()
  }

  it("counts and labels the APIs whose base table it is, keeping A–Z, with parameters among the fields", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    expect(details()).toMatchObject({ "Base table of": "2 APIs", APIs: "3 (1 in older versions only)" })
    expect(blocks()).toEqual([
      { heading: "gadget-summariesBannerGadgetAPIsolder versions only", counts: "1 field · 1 column", fields: ["codeSWBWIDG_CODE"] },
      { heading: "widget-holdsBannerWidgetAPIsbase table", counts: "base table only", fields: [] },
      {
        heading: "widget-requestsBannerWidgetAPIsbase table",
        counts: "3 fields · 1 parameter · 2 columns",
        fields: ["codeSWBWIDG_CODE", "owner.titleSWBWIDG_TITLEprobable", "legacySWBWIDG_CODEin OldWidget, not used by any method", "codeSWBWIDG_CODEquery parameter"],
      },
    ])
  })

  it("shows only the APIs using it as their base table when ticked", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    await tick("Only APIs using it as their base table")
    expect(blocks().map((b) => b.heading)).toEqual(["widget-holdsBannerWidgetAPIsbase table", "widget-requestsBannerWidgetAPIsbase table"])
    await tick("Only APIs using it as their base table")
    expect(blocks()).toHaveLength(3)
  })

  it("has no tick box when no API has it as its base table", async () => {
    server.tableDetails["Banner/SWBWIDG"] = SWBWIDG
    await renderAt("/tables/Banner/SWBWIDG")
    expect(text()).not.toContain("Only APIs using it as their base table")
    expect(details()["Base table of"]).toBeUndefined()
  })

  it("lists the parameters filtering on a column in the column view, still labelled", async () => {
    await renderAt("/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    expect(blocks().map((b) => [b.heading, b.fields])).toEqual([
      ["gadget-summariesBannerGadgetAPIsolder versions only", ["code"]],
      ["widget-requestsBannerWidgetAPIsbase table", ["code", "legacyin OldWidget, not used by any method", "codequery parameter"]],
    ])
  })

  it("finds a parameter by name with the APIs filter", async () => {
    // Enough entries (over 6) for the filter box to show.
    for (const path of ["ownerName", "zipCode", "deptCode"]) server.tableDetails["Banner/SWBWIDG"].apis[2].fields.push({ path, column: "SWBWIDG_CODE", parameter: true })
    await renderAt("/tables/Banner/SWBWIDG")
    await typeInto("Filter by API, field or column", "ownername")
    expect(blocks()).toMatchObject([{ counts: "1 of 7 fields and parameters match · 2 columns", fields: ["ownerNameSWBWIDG_CODEquery parameter"] }])
  })
})

describe("forms", () => {
  beforeEach(() => {
    server.forms = [
      { product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] },
      { product: "Banner", code: "SWBWIDG", title: "Widget Base", apis: ["BannerWidgetAPIs/widget-requests"], table: true },
    ]
  })

  it("links a table that shares its name with a form to the form", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    expect(details()["Also a form"]).toBe("SWBWIDG")
    expect([...page().querySelectorAll("main dd a")].map((a) => a.getAttribute("href"))).toContain("/forms/Banner/SWBWIDG")
  })

  it("has no 'Also a form' row for a table no form shares", async () => {
    await renderAt("/tables/Banner/KWBWIDG")
    expect(details()["Also a form"]).toBeUndefined()
  })

  it("points a name that's a form, not a table, to the form", async () => {
    await renderAt("/tables/Banner/SWAWIDG")
    expect(text()).toContain("No Banner table called SWAWIDG in the index.")
    expect(text()).toContain("SWAWIDG is a form.")
    expect([...page().querySelectorAll("main a")].map((a) => a.getAttribute("href"))).toContain("/forms/Banner/SWAWIDG")
  })
})

describe("lookups and derived logic on a table's page", () => {
  const SXVTERM: TableDetail = {
    product: "Banner",
    name: "SXVTERM",
    columns: [{ name: "SXVTERM_CODE", apis: ["BannerWidgetAPIs/widget-codes", "BannerWidgetAPIs/widget-terms"] }],
    apis: [
      { id: "BannerGadgetAPIs/gadgets", fields: [{ path: "total", column: "SXVTERM_CODE", via: "derived", text: "Adds SXVTERM_CODE to the total." }] },
      {
        id: "BannerWidgetAPIs/widget-codes",
        fields: [
          { path: "code", column: "SXVTERM_CODE" },
          { path: "termCode", via: "lookup", text: "sxvterm" },
        ],
      },
      { id: "BannerWidgetAPIs/widget-requests", fields: [{ path: "term", via: "lookup", text: "saturn,sxvterm" }] },
      { id: "BannerWidgetAPIs/widget-terms", fields: [{ path: "code", column: "SXVTERM_CODE" }] },
    ],
    alsoIn: [],
  }
  const GWBPVAL: TableDetail = {
    product: "Banner",
    name: "GWBPVAL",
    columns: [],
    apis: [{ id: "BannerWidgetAPIs/widget-requests", fields: [{ path: "parameter", via: "lookup", text: "GWBPVAL" }] }],
    alsoIn: [],
    lookupsOnly: true,
  }
  beforeEach(() => {
    server.tables = [
      ...TABLES,
      { product: "Banner", name: "GWBPVAL", apis: ["BannerWidgetAPIs/widget-requests"], cols: [], lookupsOnly: true },
      { product: "Banner", name: "SXVTERM", apis: ["BannerWidgetAPIs/widget-codes", "BannerWidgetAPIs/widget-terms"], cols: [[0, 1]] },
    ]
    server.tableDetails = { ...server.tableDetails, "Banner/SXVTERM": SXVTERM, "Banner/GWBPVAL": GWBPVAL }
  })
  const showOptions = () => [...page().querySelectorAll('[aria-label="Show"] label')].map((l) => l.textContent)
  const noteOf = (label: string) => [...page().querySelectorAll('[aria-label="Show"] label')].find((l) => l.textContent?.startsWith(label))?.closest("[title]")?.getAttribute("title")

  it("counts lookups and derived logic apart in Details; APIs and families stay direct lineage", async () => {
    await renderAt("/tables/Banner/SXVTERM")
    expect(details()).toMatchObject({ APIs: "2", "Looked up by": "2 APIs", "In derived logic": "1 API", Family: "BannerWidgetAPIs2 APIs" })
  })

  it("offers the Show choice, starting on Direct lineage, each option with its hover note", async () => {
    await renderAt("/tables/Banner/SXVTERM")
    expect(showOptions()).toEqual(["All (4)", "Direct lineage (2)", "Looked up (2)", "In derived logic (1)"])
    expect(noteOf("Looked up")).toBe("The data is kept in another table and must be one of this table's values.")
    expect(noteOf("All")).toBe("Every API that uses this table in any of the ways below.")
    expect(blocks()).toEqual([
      { heading: "widget-codesBannerWidgetAPIslooks it up", counts: "1 field · 1 column", fields: ["codeSXVTERM_CODE"] },
      { heading: "widget-termsBannerWidgetAPIs", counts: "1 field · 1 column", fields: ["codeSXVTERM_CODE"] },
    ])
  })

  it("shows the lookups, labelled, with the catalog's words", async () => {
    await renderAt("/tables/Banner/SXVTERM")
    await choose("Looked up (2)")
    expect(blocks()).toEqual([
      { heading: "widget-codesBannerWidgetAPIslooks it up", counts: "1 lookup", fields: ["termCodeLookup: sxvterm"] },
      { heading: "widget-requestsBannerWidgetAPIslooks it up only", counts: "1 lookup", fields: ["termLookup: saturn,sxvterm"] },
    ])
    const label = [...page().querySelectorAll("main h3 span")].find((s) => s.textContent === "looks it up only")
    expect(label?.getAttribute("title")).toBe("The data is kept in another table and must be one of this table's values.")
  })

  it("shows every API at once on All, each with all its uses", async () => {
    await renderAt("/tables/Banner/SXVTERM")
    await choose("All (4)")
    expect(blocks().map((b) => `${b.heading}: ${b.counts}`)).toEqual([
      "gadgetsBannerGadgetAPIsderived logic: 1 derived note",
      "widget-codesBannerWidgetAPIslooks it up: 1 field · 1 lookup · 1 column",
      "widget-requestsBannerWidgetAPIslooks it up only: 1 lookup",
      "widget-termsBannerWidgetAPIs: 1 field · 1 column",
    ])
    expect(blocks()[0].fields).toEqual(["totalSXVTERM_CODEDerived logic: Adds SXVTERM_CODE to the total."])
  })

  it("narrowed to a column, includes derived logic naming it, but not lookups", async () => {
    await renderAt("/tables/Banner/SXVTERM/SXVTERM_CODE")
    await choose("All (3)")
    // Only what names the column: widget-codes's lookup (of the whole table) isn't here, nor its label.
    expect(blocks().map((b) => b.heading)).toEqual(["gadgetsBannerGadgetAPIsderived logic", "widget-codesBannerWidgetAPIs", "widget-termsBannerWidgetAPIs"])
    expect(blocks()[1].fields).toEqual(["code"])
  })

  it("has no Show choice where every API uses it the same way", async () => {
    await renderAt("/tables/Banner/SWBWIDG")
    expect(page().querySelector('[aria-label="Show"]')).toBeNull()
  })

  it("lists a table only lookups name, marked, and opens its page on its lookups", async () => {
    await renderAt("/tables")
    expect(rows()).toContain("GWBPVALnamed only in lookups1 API")
    await follow("GWBPVAL")
    expect(page().querySelector("h1")?.textContent).toContain("named only in lookups")
    expect(details()).toMatchObject({ "Looked up by": "1 API" })
    expect(details()).not.toHaveProperty("APIs")
    expect(page().querySelector('[aria-label="Show"]')).toBeNull()
    expect(blocks()).toEqual([{ heading: "widget-requestsBannerWidgetAPIslooks it up only", counts: "1 lookup", fields: ["parameterLookup: GWBPVAL"] }])
  })
})
