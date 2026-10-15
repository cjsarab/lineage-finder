// Forms. Made-up APIs and names only.
import { describe, expect, it } from "vitest"
import type { Details } from "./extract.ts"
import { buildForms, recogniseForms, type FormSource } from "./forms.ts"
import type { Tables } from "./tables.ts"

const details = (d: Partial<Details>): Details => ({
  title: null,
  description: null,
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
  ...d,
})

describe("recogniseForms: which forms each version works through", () => {
  it("takes a Business API's form from x-source-name, or else its description", () => {
    expect(
      recogniseForms([
        { family: "BannerBusAPIs", details: details({ sourceName: "SWAWIDG" }) },
        { family: "BannerBusAPIs", details: details({ description: "API for SWVWTYP administrative page, with more words." }) },
        { family: "BannerBusAPIs", details: details({ description: "Something else entirely." }) },
        { family: "BannerBusAPIs", details: null },
      ]),
    ).toEqual([["SWAWIDG"], ["SWVWTYP"], [], []])
  })

  it("keeps the names in an ERP value that are a Business API's form or have a form's third letter, and drops tables", () => {
    expect(
      recogniseForms([
        { family: "BannerBusAPIs", details: details({ sourceName: "SWVWTYP" }) },
        { family: "BannerErpAPIs", details: details({ sourceName: "SWVWTYP, SWBWIDG/SWIWINQ and swrwsum" }) },
        { family: "BannerErpAPIs", details: details({ sourceName: "SWBWIDG" }) },
      ]),
    ).toEqual([["SWVWTYP"], ["SWVWTYP", "SWIWINQ"], []])
  })

  it("takes a Colleague Business API's code as it is, and nothing from other families", () => {
    expect(
      recogniseForms([
        { family: "ColleagueBusAPIs", details: details({ sourceName: "WDG001" }) },
        { family: "ColleagueCogAPIs", details: details({ sourceName: "WIDGETS" }) },
        { family: "BannerWidgetAPIs", details: details({ sourceName: "SWAWIDG" }) },
        { family: "CRMFlangeAPIs", details: details({ sourceName: "elcn_widget" }) },
      ]),
    ).toEqual([["WDG001"], [], [], []])
  })
})

const version = (folder: string, forms: string[], d: Partial<Details> = {}, baseTables: string[] = []) => ({
  folder,
  version: folder.replace(/^.*-/, ""),
  details: details(d),
  forms,
  baseTables,
})

const tables: Tables = {
  list: [],
  tables: { "Banner/SWVWTYP": { product: "Banner", name: "SWVWTYP", columns: [], apis: [], alsoIn: [] } },
}

describe("buildForms: the forms list and each form's page", () => {
  const sources: FormSource[] = [
    {
      id: "BannerBusAPIs/widget-requests",
      family: "BannerBusAPIs",
      versions: [
        version("widget-requests-1.0.0", ["SWAWIDG"], { sourceTitle: "Widget Maintenance" }, ["SWBWIDG"]),
        version("widget-requests-2.0.0", ["SWAWIDG"], { sourceTitle: "Widget Maintenance" }, ["SWBWIDG", "SWRWREQ"]),
      ],
    },
    {
      id: "BannerBusAPIs/widget-holds",
      family: "BannerBusAPIs",
      versions: [version("widget-holds-1.0.0", ["SWAWIDG"], { sourceTitle: "Widget Maintenance Form" }, ["SWRHOLD"])],
    },
    {
      id: "BannerBusAPIs/widget-lists",
      family: "BannerBusAPIs",
      versions: [version("widget-lists-1.0.0", ["SWAWIDG"], { sourceTitle: "Widget Maintenance" }), version("widget-lists-2.0.0", [])],
    },
    {
      id: "BannerErpAPIs/widget-summary",
      family: "BannerErpAPIs",
      versions: [version("widget-summary-1.0.0", ["SWAWIDG", "SWIWINQ"], { sourceName: "SWAWIDG, SWBWIDG and SWIWINQ", sourceTitle: "Widget summary" })],
    },
    {
      id: "BannerBusAPIs/widget-types",
      family: "BannerBusAPIs",
      versions: [version("widget-types-1.0.0", ["SWVWTYP"], { sourceTitle: "Widget Type Validation" }, ["SWVWTYP"])],
    },
    {
      id: "ColleagueBusAPIs/intake",
      family: "ColleagueBusAPIs",
      versions: [version("intake-1.0.0", ["WDG001"], { sourceTitle: "Widget Intake (WDGI)" })],
    },
  ]
  const forms = buildForms(sources, tables)

  it("lists every form by product, then code A–Z, with its APIs and whether a table shares its name", () => {
    expect(forms.list).toEqual([
      {
        product: "Banner",
        code: "SWAWIDG",
        title: "Widget Maintenance",
        apis: ["BannerBusAPIs/widget-holds", "BannerBusAPIs/widget-lists", "BannerBusAPIs/widget-requests", "BannerErpAPIs/widget-summary"],
      },
      { product: "Banner", code: "SWIWINQ", title: null, apis: ["BannerErpAPIs/widget-summary"] },
      { product: "Banner", code: "SWVWTYP", title: "Widget Type Validation", apis: ["BannerBusAPIs/widget-types"], table: true },
      { product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueBusAPIs/intake"] },
    ])
  })

  it("gives each form's page its APIs with their versions and newest base tables, the ERP value as written", () => {
    expect(forms.forms["Banner/SWAWIDG"]).toEqual({
      product: "Banner",
      code: "SWAWIDG",
      title: "Widget Maintenance",
      titles: ["Widget Maintenance Form"],
      apis: [
        { id: "BannerBusAPIs/widget-holds", versions: ["1.0.0"], baseTables: ["SWRHOLD"] },
        { id: "BannerBusAPIs/widget-lists", versions: ["1.0.0"], baseTables: [], older: true },
        { id: "BannerBusAPIs/widget-requests", versions: ["1.0.0", "2.0.0"], baseTables: ["SWBWIDG", "SWRWREQ"] },
        { id: "BannerErpAPIs/widget-summary", versions: ["1.0.0"], baseTables: [], source: "SWAWIDG, SWBWIDG and SWIWINQ" },
      ],
    })
    expect(forms.forms["Banner/SWVWTYP"]).toMatchObject({ table: true, titles: [] })
  })

  it("breaks a tie between titles by the shorter, so a plain title beats its regional or '… Form' variants", () => {
    const tied = buildForms(
      [
        { id: "BannerBusAPIs/ca-terms", family: "BannerBusAPIs", versions: [version("ca-terms-1.0.0", ["SWVTERM"], { sourceTitle: "Term Validation (California)" })] },
        { id: "BannerBusAPIs/terms", family: "BannerBusAPIs", versions: [version("terms-1.0.0", ["SWVTERM"], { sourceTitle: "Term Validation" })] },
      ],
      tables,
    )
    expect(tied.forms["Banner/SWVTERM"]).toMatchObject({ title: "Term Validation", titles: ["Term Validation (California)"] })
  })

  it("takes titles only from Business APIs, not from an ERP API's mixed value", () => {
    expect(forms.forms["Banner/SWIWINQ"]).toMatchObject({ title: null, titles: [] })
  })
})
