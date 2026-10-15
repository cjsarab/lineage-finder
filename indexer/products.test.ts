import { describe, expect, it } from "vitest"
import { productOfFamily } from "./products.ts"

describe("productOfFamily", () => {
  it("groups the families by product", () => {
    const groups: Record<string, string[]> = {}
    for (const family of [
      "ApplyWidgetAPIs", "ApplyGizmoAPIs",
      "BannerBusAPIs", "BannerGizmoAPIs", "BannerErpAPIs", "BannerCogAPIs",
      "CRMFlangeAPIs", "CRMSprocketAPIs",
      "ColleagueBusAPIs", "ColleagueGizmoAPIs", "ColleagueCogAPIs", "ColleagueWebGizmoAPIs", "ColleagueWebCogAPIs",
      "DegreeWorksAPIs", "EllDocumentMgmtAPIs", "ExperienceAPIs", "MaestroAPIs", "PersonManagerAPIs",
      "PowerCampusWidgetAPIs", "PowerCampusGizmoAPIs",
    ]) {
      const { group } = productOfFamily(family)
      ;(groups[group] ??= []).push(family)
    }
    expect(Object.fromEntries(Object.entries(groups).map(([g, f]) => [g, f.length]))).toEqual({
      Apply: 2,
      Banner: 4,
      CRM: 2,
      Colleague: 5,
      "Other products": 5,
      PowerCampus: 2,
    })
  })

  it("names the one-family products", () => {
    expect(productOfFamily("MaestroAPIs")).toEqual({ group: "Other products", product: "Intelligent Processes" })
    expect(productOfFamily("DegreeWorksAPIs").product).toBe("Degree Works")
    expect(productOfFamily("BannerErpAPIs")).toEqual({ group: "Banner", product: "Banner" })
  })

  it("places a family new to the catalog by its name", () => {
    expect(productOfFamily("BannerNewThingAPIs").group).toBe("Banner")
    expect(productOfFamily("WidgetCloudAPIs")).toEqual({ group: "Other products", product: "WidgetCloudAPIs" })
  })
})
