import { describe, expect, it } from "vitest"
import type { Api, FormSummary, SearchApi, SearchTable } from "@/lib/server"
import {
  buildSearchIndex,
  descriptionsInOrder,
  editDistance,
  matchesQuery,
  prepare,
  prepareDescriptions,
  resultCount,
  search,
  suggestions,
  type SearchOptions,
} from "./search"

// Made-up catalog only.
function api(family: string, name: string, o: { versions?: number; title?: string; description?: string } = {}): Api {
  const n = o.versions ?? 1
  return {
    id: `${family}/${name}`,
    family,
    name,
    product: "banner",
    versions: Array.from({ length: n }, (_, i) => ({
      version: `${i + 1}.0.0`,
      folder: `${name}-${i + 1}.0.0`,
      relDir: "",
      specFile: null,
      nestedIn: null,
      zip: "production_API_catalog_A_B.zip",
      read: "ok",
      problem: null,
      details: {
        title: o.title ?? name,
        description: o.description ?? null,
        specVersion: null,
        versionDiffers: false,
        beta: false,
        apiType: null,
        releaseStatus: null,
        sourceSystem: null,
        sourceDomain: null,
        sourceName: null,
        sourceTitle: null,
        audience: null,
        deprecatedOn: null,
        sunsetOn: null,
        mediaTypes: [],
        methods: [],
      },
      lineage: null,
      baseTables: [],
      forms: [],
    })),
  }
}

const ref = (text: string, table: string, column?: string) => ({ kind: "ref" as const, text, places: [{ table, ...(column ? { column } : {}) }] })

const apis = [
  api("BannerWidgetAPIs", "widget-requests", { versions: 2, title: "Widget requests", description: "Asks for a <b>widget</b> to be made." }),
  api("BannerWidgetAPIs", "widget-codes"),
  api("BannerWidgetAPIs", "codes"),
  api("ColleagueWidgetAPIs", "widget-owners"),
]

const searchApis: SearchApi[] = [
  {
    id: "BannerWidgetAPIs/widget-requests",
    fields: [
      { path: "code", values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")], v: [0, 1] },
      { path: "requestType", v: [1] },
      { path: "requestType.code", values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")], v: [1] },
      { path: "activityDate", values: [ref("SWBWIDG_ACTIVITY_DATE", "SWBWIDG", "SWBWIDG_ACTIVITY_DATE")], v: [0] },
      { path: "total", values: [{ kind: "derived", text: "Adds up SWRCOST_AMOUNT for the term." }], v: [0, 1] },
    ],
  },
  {
    id: "ColleagueWidgetAPIs/widget-owners",
    fields: [{ path: "owner.widgetCode", values: [ref("WIDGET.CODE", "WIDGET", "CODE")], v: [0] }],
  },
]

const tables: SearchTable[] = [
  {
    product: "Banner",
    name: "SWBWIDG",
    apis: ["BannerWidgetAPIs/widget-requests"],
    columns: [
      { name: "SWBWIDG_ACTIVITY_DATE", apis: [0] },
      { name: "SWBWIDG_CODE", apis: [0] },
    ],
  },
  { product: "Colleague", name: "WIDGET", apis: ["ColleagueWidgetAPIs/widget-owners"], columns: [{ name: "CODE", apis: [0] }] },
]

const index = buildSearchIndex(apis, { apis: searchApis, tables })
const on: SearchOptions = { derived: true, descriptions: false, hidden: new Set() }
const names = (q: string, o: SearchOptions = on) => {
  const r = search(index, q, o)
  return {
    apis: r.apis.map((h) => h.item.api.name),
    fields: r.fields.map((h) => `${h.item.apiName}:${h.item.field.path}${h.why ? ` (${h.why})` : ""}`),
    tables: r.tables.map((h) => h.item.table.name),
    columns: r.columns.map((h) => h.item.name),
    hidden: r.hidden,
  }
}

describe("the matching rules", () => {
  it("ignores capitals and counts _ . - / as spaces", () => {
    expect(prepare("SWBWIDG_ACTIVITY_DATE")).toBe("swbwidg activity date")
    expect(prepare("owner.widget-code/x")).toBe("owner widget code x")
  })

  it("needs every word, in any order, part of a word being enough", () => {
    expect(matchesQuery("activity date", "SWBWIDG_ACTIVITY_DATE")).toBe(true)
    expect(matchesQuery("date activ", "SWBWIDG_ACTIVITY_DATE")).toBe(true)
    expect(matchesQuery("activity code", "SWBWIDG_ACTIVITY_DATE")).toBe(false)
    expect(matchesQuery("", "anything")).toBe(true)
  })

  it("still finds a name typed run together, and looks across all the texts given", () => {
    expect(matchesQuery("widgetreq", "widget-requests")).toBe(true)
    expect(matchesQuery("Widget Req", "widget-requests")).toBe(true)
    expect(matchesQuery("code swbwidg", "code", "SWBWIDG_CODE")).toBe(true)
  })
})

describe("search", () => {
  it("finds part of a column's name in every group it appears in", () => {
    expect(names("activity date")).toEqual({
      apis: [],
      fields: ["widget-requests:activityDate"],
      tables: [],
      columns: ["SWBWIDG_ACTIVITY_DATE"],
      hidden: 0,
    })
  })

  it("puts whole-name matches first, then names starting with it, then the rest, A–Z within each", () => {
    const r = names("code")
    expect(r.apis).toEqual(["codes", "widget-codes"])
    expect(r.columns).toEqual(["CODE", "SWBWIDG_CODE"])
    expect(r.fields).toEqual(["widget-requests:code", "widget-requests:requestType.code", "widget-owners:owner.widgetCode"])
  })

  it("matches a field on its API's name too, after fields matching on their own", () => {
    expect(names("widget code").fields).toEqual(["widget-owners:owner.widgetCode", "widget-requests:code", "widget-requests:requestType.code"])
  })

  it("searches derived logic while that switch is on, and says so", () => {
    expect(names("swrcost").fields).toEqual(["widget-requests:total (derived logic)"])
    expect(names("swrcost", { ...on, derived: false }).fields).toEqual([])
  })

  it("searches descriptions only while that switch is on: the APIs' own, and the fields' once loaded", () => {
    expect(names("made").apis).toEqual([])
    const withDescriptions = { ...on, descriptions: true }
    expect(names("made", withDescriptions).apis).toEqual(["widget-requests"])
    expect(search(index, "made", withDescriptions).apis[0].why).toBe("description")
    const fieldDescriptions = descriptionsInOrder(
      index,
      prepareDescriptions({ "BannerWidgetAPIs/widget-requests": [null, null, null, "When the request was last CHANGED.", null] }),
    )
    expect(names("changed", { ...withDescriptions, fieldDescriptions }).fields).toEqual(["widget-requests:activityDate (description)"])
  })

  it("leaves out families hidden in Settings, counting what that hides", () => {
    const r = names("widget", { ...on, hidden: new Set(["ColleagueWidgetAPIs"]) })
    // `codes` is there through its family's name, BannerWidgetAPIs.
    expect(r.apis).toEqual(["widget-codes", "widget-requests", "codes"])
    expect(r.tables).toEqual([])
    expect(r.hidden).toBe(3) // widget-owners, its field owner.widgetCode, and the WIDGET table
  })

  it("leaves the 'APIs' ending of family names out, so 'api' doesn't find every API", () => {
    expect(names("apis").apis).toEqual([])
    expect(names("colleague").apis).toEqual(["widget-owners"])
  })

  it("finds nothing for nothing typed", () => {
    expect(resultCount(search(index, "  ", on))).toBe(0)
  })
})

describe("Did you mean", () => {
  it("counts single changes, a swap of neighbours being one", () => {
    expect(editDistance("swridn", "swriden", 2)).toBe(1)
    expect(editDistance("swbwdig", "swbwidg", 2)).toBe(1)
    expect(editDistance("abc", "xyz", 1)).toBe(2)
  })

  it("offers close real words for a word that isn't in the catalog, keeping the other words", () => {
    expect(suggestions(index, "swbwigd")).toEqual(["swbwidg"])
    expect(suggestions(index, "activty date")).toEqual(["activity date"])
  })

  it("offers nothing when every word is in the catalog, or part of a word", () => {
    expect(suggestions(index, "activ")).toEqual([])
    expect(suggestions(index, "qqqq")).toEqual([])
  })

  it("allows only one change in a short word", () => {
    expect(suggestions(index, "cdx")).toEqual([])
  })
})

describe("forms", () => {
  const forms: FormSummary[] = [
    { product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] },
    { product: "Banner", code: "SWAWIDGX", title: "Gadget Rules", apis: ["BannerWidgetAPIs/widget-requests"] },
    { product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueWidgetAPIs/widget-owners"] },
  ]
  const withForms = buildSearchIndex(apis, { apis: searchApis, tables, forms })
  const codes = (q: string, o: SearchOptions = on) => search(withForms, q, o).forms.map((h) => h.item.form.code)

  it("finds a form by its code or its title, the code typed whole first", () => {
    expect(codes("swawidg")).toEqual(["SWAWIDG", "SWAWIDGX"])
    expect(codes("maintenance")).toEqual(["SWAWIDG"])
    expect(codes("widget intake")).toEqual(["WDG001"])
  })

  it("leaves out forms only hidden families use, counting them as hidden", () => {
    const r = search(withForms, "wdg", { ...on, hidden: new Set(["ColleagueWidgetAPIs"]) })
    expect(r.forms).toEqual([])
    expect(r.hidden).toBeGreaterThan(0)
  })

  it("learns forms' words for Did you mean", () => {
    expect(suggestions(withForms, "maintenanse")).toEqual(["maintenance"])
  })

  it("counts forms among the results, and copes with a search file that has none", () => {
    expect(resultCount(search(withForms, "maintenance", on))).toBe(1)
    expect(search(index, "maintenance", on).forms).toEqual([])
  })
})

