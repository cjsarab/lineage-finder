// Tables worked out from the fields. Made-up APIs and tables only.
import { describe, expect, it } from "vitest"
import type { Field, Link, Place, Value } from "./lineage.ts"
import { buildTables, type TableSource } from "./tables.ts"

const ref = (...places: Place[]): Value => ({ kind: "ref", text: "x", places })
const at = (table: string, column?: string, probable = false): Place => ({ table, ...(column ? { column } : {}), ...(probable ? { probable: true as const } : {}) })
const field = (name: string, depth: number, ...values: Value[]): Field => ({ name, depth, ...(values.length ? { values } : {}) })

const source = (id: string, versions: Record<string, Field[]>, other: Record<string, { schema: string; fields: Field[] }[]> = {}): TableSource => ({
  id,
  family: id.split("/")[0],
  folders: Object.keys(versions),
  fields: Object.fromEntries(Object.entries(versions).map(([folder, fields]) => [folder, { fields, other: other[folder] ?? [] }])),
})

describe("building the tables", () => {
  it("lists each table once per product, with its columns, the APIs using it and their fields' full paths", () => {
    const { list, tables } = buildTables([
      source("BannerWidgetAPIs/widgets", {
        "widgets-1.0.0": [field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE"))), field("owner", 0), field("title", 1, ref(at("SWBWIDG", "SWBWIDG_TITLE")))],
      }),
      source("BannerGadgetAPIs/gadgets", { "gadgets-1.0.0": [field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE")))] }),
    ])
    expect(list).toEqual([
      { product: "Banner", name: "SWBWIDG", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"], cols: [[0, 1], [1]] },
    ])
    expect(tables["Banner/SWBWIDG"]).toEqual({
      product: "Banner",
      name: "SWBWIDG",
      columns: [
        { name: "SWBWIDG_CODE", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"] },
        { name: "SWBWIDG_TITLE", apis: ["BannerWidgetAPIs/widgets"] },
      ],
      apis: [
        { id: "BannerGadgetAPIs/gadgets", fields: [{ path: "code", column: "SWBWIDG_CODE" }] },
        {
          id: "BannerWidgetAPIs/widgets",
          fields: [
            { path: "code", column: "SWBWIDG_CODE" },
            { path: "owner.title", column: "SWBWIDG_TITLE" },
          ],
        },
      ],
      alsoIn: [],
    })
  })

  it("counts every version, marking what's only in older ones", () => {
    const { tables } = buildTables([
      source("BannerWidgetAPIs/widgets", {
        "widgets-1.0.0": [field("old", 0, ref(at("SWBOLDW", "SWBOLDW_CODE"))), field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE")))],
        "widgets-2.0.0": [field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE")))],
      }),
    ])
    expect(tables["Banner/SWBOLDW"].apis).toEqual([{ id: "BannerWidgetAPIs/widgets", older: true, fields: [{ path: "old", column: "SWBOLDW_CODE", older: true }] }])
    expect(tables["Banner/SWBWIDG"].apis).toEqual([{ id: "BannerWidgetAPIs/widgets", fields: [{ path: "code", column: "SWBWIDG_CODE" }] }])
  })

  it("marks probable tables and columns, and keeps tables with no column named", () => {
    const { list, tables } = buildTables([
      source("BannerWidgetAPIs/widgets", {
        "widgets-1.0.0": [
          field("title", 0, ref(at("SWBWIDG", "SWBWIDG_TITLE", true))),
          field("guess", 0, ref(at("SWBGUES", "SWBGUES_NAME", true))),
          field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE"))),
          field("bare", 0, ref(at("SWBBARE"))),
        ],
      }),
    ])
    expect(list.map((t) => [t.name, t.cols.length, t.probable ?? false])).toEqual([
      ["SWBBARE", 0, false],
      ["SWBGUES", 1, true],
      ["SWBWIDG", 2, false],
    ])
    expect(tables["Banner/SWBWIDG"].columns).toEqual([
      { name: "SWBWIDG_CODE", apis: ["BannerWidgetAPIs/widgets"] },
      { name: "SWBWIDG_TITLE", apis: ["BannerWidgetAPIs/widgets"], probable: true },
    ])
    expect(tables["Banner/SWBBARE"].apis[0].fields).toEqual([{ path: "bare" }])
  })

  it("keeps products apart, saying where else a name appears", () => {
    const { list, tables } = buildTables([
      source("ColleagueWidgetAPIs/widgets", { "widgets-1.0.0": [field("name", 0, ref(at("WIDGETS", "NAME")))] }),
      source("CRMWidgetAPIs/widgets", { "widgets-1.0.0": [field("name", 0, ref(at("WIDGETS", "NAME")))] }),
    ])
    expect(list.map((t) => `${t.product}/${t.name}`)).toEqual(["CRM/WIDGETS", "Colleague/WIDGETS"])
    expect(tables["Colleague/WIDGETS"].alsoIn).toEqual(["CRM"])
    expect(tables["CRM/WIDGETS"].alsoIn).toEqual(["Colleague"])
  })

  it("includes schemas no method uses, labelled with the schema, after the API's own fields", () => {
    const { tables } = buildTables([
      source(
        "BannerWidgetAPIs/widgets",
        { "widgets-1.0.0": [field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE")))] },
        { "widgets-1.0.0": [{ schema: "OldWidget", fields: [field("legacy", 0, ref(at("SWBWIDG", "SWBWIDG_LEGACY")))] }] },
      ),
    ])
    expect(tables["Banner/SWBWIDG"].apis[0].fields).toEqual([
      { path: "code", column: "SWBWIDG_CODE" },
      { path: "legacy", column: "SWBWIDG_LEGACY", schema: "OldWidget" },
    ])
  })

  it("adds query parameters as entries after the fields, merged across methods", () => {
    const param = (name: string, ...values: Value[]) => ({ name, in: "query", required: false, description: null, values })
    const { tables } = buildTables([
      {
        ...source("BannerWidgetAPIs/widgets", { "widgets-1.0.0": [field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE")))] }),
        parameters: {
          "widgets-1.0.0": [
            { path: "/widgets", method: "GET", parameters: [param("code", ref(at("SWBWIDG", "SWBWIDG_CODE"))), param("limit")] },
            { path: "/widgets/all", method: "GET", parameters: [param("code", ref(at("SWBWIDG", "SWBWIDG_CODE")))] },
          ],
        },
      },
    ])
    expect(tables["Banner/SWBWIDG"].apis[0].fields).toEqual([
      { path: "code", column: "SWBWIDG_CODE" },
      { path: "code", column: "SWBWIDG_CODE", parameter: true },
    ])
    expect(tables["Banner/SWBWIDG"].columns).toEqual([{ name: "SWBWIDG_CODE", apis: ["BannerWidgetAPIs/widgets"] }])
  })

  it("marks the APIs whose base table it is, even with no field naming it, and only older ones as older", () => {
    const { list, tables } = buildTables([
      {
        ...source("BannerWidgetAPIs/widgets", { "widgets-1.0.0": [], "widgets-2.0.0": [field("code", 0, ref(at("SWBWIDG", "SWBWIDG_CODE")))] }),
        baseTables: { "widgets-1.0.0": ["SWBOLDW"], "widgets-2.0.0": ["SWBWIDG", "SWRDTLS"] },
      },
    ])
    expect(tables["Banner/SWBWIDG"].apis).toEqual([{ id: "BannerWidgetAPIs/widgets", base: true, fields: [{ path: "code", column: "SWBWIDG_CODE" }] }])
    expect(tables["Banner/SWRDTLS"].apis).toEqual([{ id: "BannerWidgetAPIs/widgets", base: true, fields: [] }])
    expect(tables["Banner/SWBOLDW"].apis).toEqual([{ id: "BannerWidgetAPIs/widgets", older: true, base: true, fields: [] }])
    expect(list.find((t) => t.name === "SWRDTLS")).toEqual({ product: "Banner", name: "SWRDTLS", apis: ["BannerWidgetAPIs/widgets"], cols: [] })
  })

  it("lists a value naming two tables under each, and a field naming the same column twice once", () => {
    const { tables } = buildTables([
      source("BannerWidgetAPIs/widgets", {
        "widgets-1.0.0": [field("either", 0, ref(at("SWBWIDG", "SWBWIDG_CODE"), at("SWRSIZE", "SWRSIZE_SIZE")), ref(at("SWBWIDG", "SWBWIDG_CODE")))],
      }),
    ])
    expect(tables["Banner/SWBWIDG"].apis[0].fields).toEqual([{ path: "either", column: "SWBWIDG_CODE" }])
    expect(tables["Banner/SWRSIZE"].apis[0].fields).toEqual([{ path: "either", column: "SWRSIZE_SIZE" }])
  })
})

describe("lookups and derived logic on the table pages", () => {
  const lookup = (...links: Link[]): Value => ({ kind: "lookup", text: "x", links })
  const derived = (...links: Link[]): Value => ({ kind: "derived", text: "x", links })
  const to = (table: string, column?: string): Link => ({ at: 0, length: 1, table, ...(column ? { column } : {}) })

  const built = () =>
    buildTables([
      source("BannerWidgetAPIs/widgets", {
        "widgets-1.0.0": [
          field("term", 0, ref(at("SWBWIDG", "SWBWIDG_TERM")), lookup(to("SXVTERM"))),
          field("total", 0, derived(to("SXVTERM", "SXVTERM_CODE"), to("SXVTERM"), to("SWBWIDG"))),
          field("parameter", 0, lookup(to("SWBPVAL"))),
          field("page", 0, lookup({ at: 0, length: 1, form: "SWAWIDG" })),
        ],
      }),
      source("BannerTermAPIs/terms", { "terms-1.0.0": [field("code", 0, ref(at("SXVTERM", "SXVTERM_CODE"))), field("check", 0, lookup(to("SXVTERM")))] }),
    ])

  it("adds the APIs whose lookups or derived logic name it, each use marked with its words, after the lineage", () => {
    const { tables } = built()
    expect(tables["Banner/SXVTERM"].apis).toEqual([
      {
        id: "BannerTermAPIs/terms",
        fields: [
          { path: "code", column: "SXVTERM_CODE" },
          { path: "check", via: "lookup", text: "x" },
        ],
      },
      {
        id: "BannerWidgetAPIs/widgets",
        fields: [
          { path: "term", via: "lookup", text: "x" },
          { path: "total", column: "SXVTERM_CODE", via: "derived", text: "x" },
        ],
      },
    ])
    expect(tables["Banner/SWBWIDG"].apis[0].fields).toEqual([
      { path: "term", column: "SWBWIDG_TERM" },
      { path: "total", via: "derived", text: "x" },
    ])
  })

  it("keeps the columns and the list's count to lineage", () => {
    const { list, tables } = built()
    expect(tables["Banner/SXVTERM"].columns).toEqual([{ name: "SXVTERM_CODE", apis: ["BannerTermAPIs/terms"] }])
    expect(list.find((t) => t.name === "SXVTERM")).toEqual({ product: "Banner", name: "SXVTERM", apis: ["BannerTermAPIs/terms"], cols: [[0]] })
    expect(tables["Banner/SWAWIDG"]).toBeUndefined()
  })

  it("lists a table only lookups name, marked, counting those lookups' APIs", () => {
    const { list, tables } = built()
    expect(list.find((t) => t.name === "SWBPVAL")).toEqual({ product: "Banner", name: "SWBPVAL", apis: ["BannerWidgetAPIs/widgets"], cols: [], lookupsOnly: true })
    expect(tables["Banner/SWBPVAL"]).toEqual({
      product: "Banner",
      name: "SWBPVAL",
      columns: [],
      apis: [{ id: "BannerWidgetAPIs/widgets", fields: [{ path: "parameter", via: "lookup", text: "x" }] }],
      alsoIn: [],
      lookupsOnly: true,
    })
  })
})
