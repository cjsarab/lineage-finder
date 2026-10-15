// The tables list's and table page's logic. Made-up tables only.
import { describe, expect, it } from "vitest"
import type { TableDetail, TableSummary } from "@/lib/server"
import {
  apiMatches,
  columnCount,
  columnPath,
  matchingFields,
  applyTableFilters,
  moduleLabel,
  modulesOf,
  productsOf,
  readTableFilters,
  shownColumn,
  shownTable,
  tableCounts,
  toListTables,
  writeTableFilters,
  type TableFilters,
} from "@/lib/tables"

const SUMMARIES: TableSummary[] = [
  { product: "Banner", name: "GWBWIDG", apis: ["BannerWidgetAPIs/widgets"], cols: [[0]] },
  { product: "Banner", name: "KWBWIDG", apis: ["BannerWidgetAPIs/widgets"], cols: [] },
  { product: "Banner", name: "SWBWIDG", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"], cols: [[0], [0, 1], [1]] },
  { product: "Banner", name: "SWRGUES", apis: ["BannerWidgetAPIs/widgets"], cols: [[0]], probable: true },
  { product: "Colleague", name: "WIDGETS", apis: ["ColleagueWidgetAPIs/widgets"], cols: [[0]] },
]
const none: TableFilters = { product: null, modules: [], name: "", page: 1 }

describe("the tables list", () => {
  it("leaves out hidden families: from the counts, and tables only they use", () => {
    const all = toListTables(SUMMARIES, [])
    expect(all.find((t) => t.name === "SWBWIDG")).toMatchObject({ module: "S", apis: 2, columns: 3, probable: false })
    expect(all.find((t) => t.name === "WIDGETS")?.module).toBeNull()
    const some = toListTables(SUMMARIES, ["BannerGadgetAPIs", "ColleagueWidgetAPIs"])
    expect(some.find((t) => t.name === "SWBWIDG")).toMatchObject({ apis: 1, columns: 2 })
    expect(some.map((t) => t.name)).not.toContain("WIDGETS")
  })

  it("offers products biggest first, and filters by product, module and name", () => {
    const list = toListTables(SUMMARIES, [])
    expect(productsOf(list)).toEqual([
      { product: "Banner", count: 4 },
      { product: "Colleague", count: 1 },
    ])
    expect(applyTableFilters(list, "Banner", none).map((t) => t.name)).toEqual(["GWBWIDG", "KWBWIDG", "SWBWIDG", "SWRGUES"])
    expect(applyTableFilters(list, "Banner", { ...none, modules: ["S", "G"] }).map((t) => t.name)).toEqual(["GWBWIDG", "SWBWIDG", "SWRGUES"])
    expect(applyTableFilters(list, "Banner", { ...none, name: " swb" }).map((t) => t.name)).toEqual(["SWBWIDG"])
    expect(applyTableFilters(list, "Banner", { ...none, name: "widg swb" }).map((t) => t.name)).toEqual(["SWBWIDG"])
    expect(applyTableFilters(list, "Colleague", none).map((t) => t.name)).toEqual(["WIDGETS"])
  })

  it("counts each product and module with the name filter as it is", () => {
    const list = toListTables(SUMMARIES, [])
    const c = tableCounts(list, "Banner", { ...none, name: "widg" })
    expect(c.products).toEqual(new Map([["Banner", 3], ["Colleague", 1]]))
    expect(c.modules).toEqual(new Map([["G", 1], ["Other", 1], ["S", 1]]))
  })

  it("names modules with their letter, largest first, with the small ones (Advancement too) under Other", () => {
    expect(moduleLabel("S")).toBe("Student (S)")
    expect(moduleLabel("Other")).toBe("Other")
    expect(toListTables([{ product: "Banner", name: "AWBWIDG", apis: ["BannerWidgetAPIs/widgets"], cols: [] }], [])[0].module).toBe("Other")
    expect(modulesOf(toListTables(SUMMARIES, []), "Banner")).toEqual(["S", "G", "Other"])
    expect(modulesOf(toListTables(SUMMARIES, []), "Colleague")).toEqual([])
  })

  it("keeps the filters in the address", () => {
    const f: TableFilters = { product: "Banner", modules: ["S", "G"], name: "swb", page: 3 }
    expect(writeTableFilters(f).toString()).toBe("product=Banner&module=S&module=G&name=swb&page=3")
    expect(readTableFilters(writeTableFilters(f))).toEqual(f)
    expect(readTableFilters(new URLSearchParams("page=-2"))).toEqual(none)
  })
})

describe("a table's page", () => {
  const detail: TableDetail = {
    product: "Banner",
    name: "SWBWIDG",
    columns: [
      { name: "SWBWIDG_CODE", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"] },
      { name: "SWBWIDG_SIZE", apis: ["BannerGadgetAPIs/gadgets"], probable: true },
    ],
    apis: [
      { id: "BannerGadgetAPIs/gadgets", fields: [{ path: "code", column: "SWBWIDG_CODE" }, { path: "size", column: "SWBWIDG_SIZE", probable: true }] },
      { id: "BannerWidgetAPIs/widgets", older: true, fields: [{ path: "owner.code", column: "SWBWIDG_CODE", older: true }] },
    ],
    alsoIn: [],
  }

  it("leaves out hidden families' APIs, and columns only they use", () => {
    expect(shownTable(detail, []).columns).toEqual([
      { name: "SWBWIDG_CODE", apis: 2, probable: false },
      { name: "SWBWIDG_SIZE", apis: 1, probable: true },
    ])
    const shown = shownTable(detail, ["BannerGadgetAPIs"])
    expect(shown.columns).toEqual([{ name: "SWBWIDG_CODE", apis: 1, probable: false }])
    expect(shown.apis.map((a) => a.id)).toEqual(["BannerWidgetAPIs/widgets"])
  })

  it("filters APIs by name, field or column, not by family", () => {
    const [gadgets, widgets] = detail.apis
    expect(apiMatches(gadgets, "GADG")).toBe(true)
    expect(apiMatches(widgets, "owner")).toBe(true)
    expect(apiMatches(gadgets, "widg_size")).toBe(true)
    expect(apiMatches(gadgets, "bannergadget")).toBe(false)
    expect(apiMatches(widgets, "")).toBe(true)
    // As search: a field can match on its API's name too, every word in any order.
    expect(matchingFields(gadgets, "size gadget")).toEqual([{ path: "size", column: "SWBWIDG_SIZE", probable: true }])
  })

  it("leaves only the matching fields when the filter matches fields, and all of them when it matches the name", () => {
    const [gadgets] = detail.apis
    expect(matchingFields(gadgets, "size")).toEqual([{ path: "size", column: "SWBWIDG_SIZE", probable: true }])
    expect(matchingFields(gadgets, "gadget")).toHaveLength(2)
    expect(matchingFields(gadgets, "nothing")).toBeNull()
    expect(columnCount(gadgets.fields)).toBe(2)
  })
})

describe("a table's page narrowed to one column", () => {
  const detail: TableDetail = {
    product: "Banner",
    name: "SWBWIDG",
    columns: [
      { name: "SWBWIDG_CODE", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"] },
      { name: "SWBWIDG_CODE_DESC", apis: ["BannerGadgetAPIs/gadgets"] },
      { name: "SWBWIDG_SIZE", apis: ["BannerGadgetAPIs/gadgets"], probable: true },
    ],
    apis: [
      {
        id: "BannerGadgetAPIs/gadgets",
        fields: [
          { path: "code", column: "SWBWIDG_CODE" },
          { path: "codeText", column: "SWBWIDG_CODE_DESC" },
          { path: "legacyCode", column: "SWBWIDG_CODE", older: true },
          { path: "size", column: "SWBWIDG_SIZE", probable: true },
        ],
      },
      { id: "BannerWidgetAPIs/widgets", fields: [{ path: "owner.code", column: "SWBWIDG_CODE", older: true }, { path: "name" }] },
    ],
    alsoIn: [],
  }

  it("keeps only the fields naming exactly that column, not columns that start the same", () => {
    const column = shownColumn(shownTable(detail, []), "SWBWIDG_CODE")
    expect(column).toEqual({
      apis: [
        { id: "BannerGadgetAPIs/gadgets", fields: [{ path: "code", column: "SWBWIDG_CODE" }, { path: "legacyCode", column: "SWBWIDG_CODE", older: true }] },
        // Its other field is in the newest version, but not with this column: older versions only for this column.
        { id: "BannerWidgetAPIs/widgets", older: true, fields: [{ path: "owner.code", column: "SWBWIDG_CODE", older: true }] },
      ],
      fields: 3,
      older: 1,
      probable: false,
    })
  })

  it("says when a column is known only from inferred values", () => {
    expect(shownColumn(shownTable(detail, []), "SWBWIDG_SIZE")).toMatchObject({ fields: 1, older: 0, probable: true })
  })

  it("leaves out hidden families, and is null for a column nobody shown uses", () => {
    expect(shownColumn(shownTable(detail, ["BannerWidgetAPIs"]), "SWBWIDG_CODE")?.apis.map((a) => a.id)).toEqual(["BannerGadgetAPIs/gadgets"])
    expect(shownColumn(shownTable(detail, ["BannerGadgetAPIs"]), "SWBWIDG_SIZE")).toBeNull()
    expect(shownColumn(shownTable(detail, []), "NOSUCH")).toBeNull()
  })

  it("has its own address, with the name encoded", () => {
    expect(columnPath("Banner", "SWBWIDG", "SWBWIDG_CODE")).toBe("/tables/Banner/SWBWIDG/SWBWIDG_CODE")
    expect(columnPath("CRM", "contact", "address.city")).toBe("/tables/CRM/contact/address.city")
    expect(columnPath("Colleague", "PERSON", "A/B")).toBe("/tables/Colleague/PERSON/A%2FB")
  })
})
