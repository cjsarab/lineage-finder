// The landing page's counts broken down. Made-up APIs, tables and forms only.
import { describe, expect, it } from "vitest"
import { NOT_STATED, applyFilters, readFilters, toListApis } from "@/lib/api-list"
import { toListForms } from "@/lib/forms"
import { apiWay, formWay, tableWay, type Way } from "@/lib/landing"
import type { FormSummary, TableSummary } from "@/lib/server"
import { applyTableFilters, readTableFilters, toListTables, type Listed } from "@/lib/tables"
import { fakeApis, summary } from "@/test-support/fake-app"

const list = toListApis(fakeApis, summary.families)

const TABLES: TableSummary[] = [
  { product: "Banner", name: "GWBWIDG", apis: ["BannerWidgetAPIs/widgets"], cols: [[0]] },
  { product: "Banner", name: "SWBWIDG", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"], cols: [[0], [0, 1], [1]] },
  { product: "Banner", name: "SWRGUES", apis: ["BannerWidgetAPIs/widgets"], cols: [[0]] },
  { product: "Banner", name: "XWBWIDG", apis: ["BannerGadgetAPIs/gadgets"], cols: [] },
  { product: "Colleague", name: "WIDGETS", apis: ["ColleagueWidgetAPIs/widgets"], cols: [[0]] },
]

const FORMS: FormSummary[] = [
  { product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] },
  { product: "Banner", code: "SWVWTYP", title: "Widget Type Validation", apis: ["BannerGadgetAPIs/gadgets"], table: true },
  { product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueWidgetAPIs/intake"] },
]

const labels = (way: Way, title: string) => way.breakdowns.find((b) => b.title === title)!.bits.map((b) => `${b.label} ${b.count}`)

/** Every badge's count is what the list it opens shows: counted as the lists count them. */
function expectApiBitsMatchTheList(way: Way, hidden: readonly string[]) {
  const visible = list.filter((a) => !hidden.includes(a.family))
  for (const b of way.breakdowns.flatMap((x) => x.bits)) {
    const [path, query] = b.href.split("?")
    expect(path).toBe("/apis")
    expect(applyFilters(visible, readFilters(new URLSearchParams(query))).length, b.label).toBe(b.count)
  }
}

function expectPlaceBitsMatchTheList(way: Way, items: readonly Listed[], base: string) {
  for (const b of way.breakdowns.flatMap((x) => x.bits)) {
    const [path, query] = b.href.split("?")
    expect(path).toBe(base)
    const f = readTableFilters(new URLSearchParams(query))
    expect(applyTableFilters(items, f.product!, f).length, b.label).toBe(b.count)
  }
}

describe("the APIs card", () => {
  it("counts the APIs and versions the list shows, by product, family and domain, largest first", () => {
    const way = apiWay(list, summary.families, [])
    expect(way.count).toBe(16)
    expect(way.extra).toBe(19)
    expect(labels(way, "By product")).toEqual(["Banner 13", "Other products 2", "Colleague 1"])
    expect(labels(way, "By family")).toEqual(["BannerWidgetAPIs 12", "SprocketAPIs 2", "BannerGadgetAPIs 1", "ColleagueWidgetAPIs 1"])
    const domains = labels(way, "By domain")
    expect(domains.at(-1)).toMatch(new RegExp(`^${NOT_STATED} `))
    expectApiBitsMatchTheList(way, [])
  })

  it("opens the list with all of a product's families ticked", () => {
    const banner = apiWay(list, summary.families, []).breakdowns[0].bits.find((b) => b.label === "Banner")!
    expect(new URLSearchParams(banner.href.split("?")[1]).getAll("family")).toEqual(["BannerWidgetAPIs", "BannerGadgetAPIs"])
  })

  it("leaves hidden families out, as the list does", () => {
    const hidden = ["BannerWidgetAPIs", "SprocketAPIs"]
    const way = apiWay(list, summary.families, hidden)
    expect(way.count).toBe(2)
    expect(labels(way, "By product")).toEqual(["Banner 1", "Colleague 1"])
    expect(labels(way, "By family")).toEqual(["BannerGadgetAPIs 1", "ColleagueWidgetAPIs 1"])
    expectApiBitsMatchTheList(way, hidden)
  })

  it("has nothing to break down when every family is hidden", () => {
    const way = apiWay(list, summary.families, summary.families.map((f) => f.name))
    expect(way.count).toBe(0)
    expect(way.breakdowns.every((b) => b.bits.length === 0)).toBe(true)
  })
})

describe("the Tables and Forms cards", () => {
  it("counts tables and their columns by product and Banner module, as the tables list does", () => {
    const tables = toListTables(TABLES, [])
    const way = tableWay(tables)
    expect(way.count).toBe(5)
    expect(way.extra).toBe(6)
    expect(labels(way, "By product")).toEqual(["Banner 4", "Colleague 1"])
    // Largest first, "Other" (here X) last, as the module filter has them.
    expect(labels(way, "Banner, by module")).toEqual(["Student (S) 2", "General (G) 1", "Other 1"])
    expectPlaceBitsMatchTheList(way, tables, "/tables")
  })

  it("leaves out tables only hidden families use", () => {
    const tables = toListTables(TABLES, ["BannerGadgetAPIs", "ColleagueWidgetAPIs"])
    const way = tableWay(tables)
    expect(way.count).toBe(3)
    expect(labels(way, "By product")).toEqual(["Banner 3"])
    expect(labels(way, "Banner, by module")).toEqual(["Student (S) 2", "General (G) 1"])
    expectPlaceBitsMatchTheList(way, tables, "/tables")
  })

  it("counts forms, and those that are also a table, as the forms list does", () => {
    const forms = toListForms(FORMS, [])
    const way = formWay(forms)
    expect(way.count).toBe(3)
    expect(way.extra).toBe(1)
    expect(labels(way, "By product")).toEqual(["Banner 2", "Colleague 1"])
    expect(labels(way, "Banner, by module")).toEqual(["Student (S) 2"])
    expectPlaceBitsMatchTheList(way, forms, "/forms")
  })
})
