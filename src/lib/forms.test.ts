// Forms in the browser. Made-up forms only.
import { describe, expect, it } from "vitest"
import { formPath, shownFormApis, toListForms } from "@/lib/forms"
import type { FormDetail, FormSummary } from "@/lib/server"
import { applyTableFilters } from "@/lib/tables"

const FORMS: FormSummary[] = [
  { product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerBusAPIs/widget-requests", "BannerErpAPIs/widget-summary"] },
  { product: "Banner", code: "SWVWTYP", title: "Widget Type Validation", apis: ["BannerBusAPIs/widget-types"], table: true },
  { product: "Banner", code: "ZWIWINQ", title: null, apis: ["BannerErpAPIs/widget-summary"] },
  { product: "Colleague", code: "WDG001", title: "Widget Intake (WDGI)", apis: ["ColleagueBusAPIs/intake"] },
]

describe("toListForms", () => {
  it("counts the APIs shown, takes the module from the first letter (Banner only) and leaves out forms only hidden families use", () => {
    expect(toListForms(FORMS, ["BannerErpAPIs"])).toEqual([
      expect.objectContaining({ product: "Banner", name: "SWAWIDG", title: "Widget Maintenance", module: "S", apis: 1, table: false }),
      expect.objectContaining({ product: "Banner", name: "SWVWTYP", module: "S", apis: 1, table: true }),
      expect.objectContaining({ product: "Colleague", name: "WDG001", module: null, apis: 1 }),
    ])
  })

  it("lets the name box find a form by its code or its title", () => {
    const list = toListForms(FORMS, [])
    const names = (name: string) => applyTableFilters(list, "Banner", { product: null, modules: [], name, page: 1 }).map((f) => f.name)
    expect(names("swvw")).toEqual(["SWVWTYP"])
    expect(names("type validation")).toEqual(["SWVWTYP"])
    expect(names("widget")).toEqual(["SWAWIDG", "SWVWTYP"])
  })
})

describe("shownFormApis", () => {
  it("leaves out hidden families' APIs", () => {
    const form: FormDetail = { ...FORMS[0], titles: [], apis: [{ id: "BannerBusAPIs/widget-requests", versions: ["1.0.0"], baseTables: [] }, { id: "BannerErpAPIs/widget-summary", versions: ["1.0.0"], baseTables: [], source: "SWAWIDG" }] }
    expect(shownFormApis(form, ["BannerErpAPIs"]).map((a) => a.id)).toEqual(["BannerBusAPIs/widget-requests"])
  })
})

describe("formPath", () => {
  it("is the form's own address", () => {
    expect(formPath("Colleague", "WDG038")).toBe("/forms/Colleague/WDG038")
  })
})
