import fs from "node:fs"
import { afterAll, describe, expect, it } from "vitest"
import { findCatalog } from "./catalog-zips.ts"
import { compareVersions, listCatalog, padVersion, productOf, splitFolder } from "./folders.ts"
import { zippedTestCatalog } from "./test-support/zip-catalog.ts"

// The made-up catalog, zipped in Ellucian's shape (families at three depths in three zips).
const zips = zippedTestCatalog()
afterAll(() => fs.rmSync(zips, { recursive: true, force: true }))

describe("splitFolder", () => {
  it("splits the name from the version after the last -", () => {
    expect(splitFolder("gadget-codes-1.0.0")).toEqual({ name: "gadget-codes", version: "1.0.0", separator: "-" })
  })

  it("also accepts . before the version", () => {
    expect(splitFolder("gizmos.2.0.0")).toEqual({ name: "gizmos", version: "2.0.0", separator: "." })
  })

  it("gives no version when the folder name has none", () => {
    expect(splitFolder("widgets")).toEqual({ name: "widgets", version: null, separator: null })
  })
})

describe("padVersion", () => {
  it("pads to three parts", () => {
    expect(padVersion("6.0")).toBe("6.0.0")
    expect(padVersion("6")).toBe("6.0.0")
    expect(padVersion("1.2.3")).toBe("1.2.3")
  })
})

describe("compareVersions", () => {
  it("compares number by number, not alphabetically", () => {
    expect(["1.10.0", "2.0.0", "1.2.0", "1.9.1"].sort(compareVersions)).toEqual(["1.2.0", "1.9.1", "1.10.0", "2.0.0"])
  })

  it("treats a missing part as 0", () => {
    expect(compareVersions("6.0", "6.0.0")).toBe(0)
  })
})

describe("productOf", () => {
  it("is Colleague for families starting Colleague, Banner for everything else", () => {
    expect(productOf("ColleagueGizmoAPIs")).toBe("colleague")
    expect(productOf("BannerBusAPIs")).toBe("banner")
    expect(productOf("ApplyWidgetAPIs")).toBe("banner")
  })
})

describe("listCatalog", () => {
  const entries = listCatalog(findCatalog(zips))
  const find = (folder: string) => entries.find((e) => e.folder === folder)

  it("finds every API folder in every family, ignoring stray files", () => {
    expect(entries.map((e) => `${e.family}/${e.folder}`)).toEqual([
      "BannerBusAPIs/widget-requests-1.0.0",
      "BannerBusAPIs/widget-types-1.0.0",
      "BannerErpAPIs/widget-summary-1.0.0",
      "BannerWidgetAPIs/blanks-1.0.0",
      "BannerWidgetAPIs/broken-1.0.0",
      "BannerWidgetAPIs/cogs-1.0.0",
      "BannerWidgetAPIs/flanges-1.0.0",
      "BannerWidgetAPIs/gizmos.2.0.0",
      "BannerWidgetAPIs/hinges-1.0.0",
      "BannerWidgetAPIs/springs-1.0.0",
      "BannerWidgetAPIs/levers-1.0.0",
      "BannerWidgetAPIs/levers-1.1.0",
      "BannerWidgetAPIs/oddments",
      "BannerWidgetAPIs/pulleys-1.0.0",
      "BannerWidgetAPIs/ratchets-1.0.0",
      "BannerWidgetAPIs/sprockets-1.0.0",
      "BannerWidgetAPIs/widgets-1.10.0",
      "BannerWidgetAPIs/widgets-1.2.0",
      "BannerWidgetAPIs/widgets-2.0.0",
      "ColleagueBusAPIs/intake-1.0.0",
      "ColleagueWidgetAPIs/widgets-1.0.0",
    ])
  })

  it("flags an API folder misplaced inside another", () => {
    expect(find("springs-1.0.0")).toMatchObject({ name: "springs", version: "1.0.0", nestedIn: "hinges-1.0.0" })
    expect(find("hinges-1.0.0")?.nestedIn).toBeNull()
  })

  it("picks the YAML file (.yaml or .yml) and ignores JSON and text files", () => {
    expect(find("widgets-2.0.0")?.specFile).toBe("widgets.yaml")
    expect(find("widgets-1.2.0")?.specFile).toBe("widgets.yaml")
    expect(find("cogs-1.0.0")?.specFile).toBe("cogs.yml")
  })

  it("gives each folder its relative path inside the catalog, without the zip's own folders", () => {
    expect(find("springs-1.0.0")?.relDir).toBe("BannerWidgetAPIs/hinges-1.0.0/springs-1.0.0")
  })

  it("gives each folder its zip, and its spec's path inside the zip to unpack it", () => {
    expect(find("springs-1.0.0")).toMatchObject({
      zip: "production_API_catalog_W.zip",
      specInZip: "production_API_catalog_W/production_API_catalog_W/BannerWidgetAPIs/hinges-1.0.0/springs-1.0.0/springs.yaml",
    })
    expect(find("widget-types-1.0.0")).toMatchObject({ zip: "production_API_catalog_A_B.zip", specInZip: "BannerBusAPIs/widget-types-1.0.0/widget-types.yaml" })
  })
})
