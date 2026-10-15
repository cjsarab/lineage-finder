// Reading Ellucian's zips, on the made-up catalog zipped as the tests run.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { zipSync } from "fflate"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CatalogZipError, findCatalog, listZip, unpackTexts, zipsIn } from "./catalog-zips.ts"
import { FIVE_ZIP_SHAPE, writeZip, zipCatalog } from "./test-support/zip-catalog.ts"

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-zips-"))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const problemOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof CatalogZipError) return { problem: e.problem, message: e.message }
    throw e
  }
  throw new Error("no problem found")
}

describe("listZip", () => {
  it("lists every file with its unpacked size and the checksum the zip stores", () => {
    const text = "openapi: 3.0.0\ninfo:\n  title: widgets\n"
    writeZip(path.join(dir, "a.zip"), { "WidgetAPIs/widgets-1.0.0/widgets.yaml": text, "WidgetAPIs/widgets-1.0.0/README.pdf": "x" })
    expect(listZip(path.join(dir, "a.zip"))).toEqual([
      { name: "WidgetAPIs/widgets-1.0.0/widgets.yaml", size: text.length, crc: zlib.crc32(text) },
      { name: "WidgetAPIs/widgets-1.0.0/README.pdf", size: 1, crc: zlib.crc32("x") },
    ])
  })

  it("lists folders the zip names, ending in /", () => {
    // fflate writes an empty object as a folder, adding the "/" itself.
    fs.writeFileSync(path.join(dir, "a.zip"), zipSync({ WidgetAPIs: {}, "WidgetAPIs/widgets-1.0.0": {}, "WidgetAPIs/widgets-1.0.0/widgets.yaml": new Uint8Array([1]) }))
    expect(listZip(path.join(dir, "a.zip")).map((i) => i.name)).toEqual(["WidgetAPIs/", "WidgetAPIs/widgets-1.0.0/", "WidgetAPIs/widgets-1.0.0/widgets.yaml"])
  })

  it("refuses a file that isn't a zip, or a zip cut short (half-downloaded)", () => {
    fs.writeFileSync(path.join(dir, "not.zip"), "hello")
    expect(() => listZip(path.join(dir, "not.zip"))).toThrow()
    writeZip(path.join(dir, "a.zip"), { "WidgetAPIs/widgets-1.0.0/widgets.yaml": "openapi: 3.0.0\n" })
    const bytes = fs.readFileSync(path.join(dir, "a.zip"))
    fs.writeFileSync(path.join(dir, "cut.zip"), bytes.subarray(0, bytes.length - 30))
    expect(() => listZip(path.join(dir, "cut.zip"))).toThrow()
  })
})

describe("findCatalog", () => {
  it("finds families at the top of a zip, one folder down and two folders down, in name order", () => {
    zipCatalog(dir)
    const found = findCatalog(dir)
    expect(found.zips).toEqual(Object.keys(FIVE_ZIP_SHAPE))
    expect(found.others).toEqual([])
    expect(found.families.map((f) => [f.family, f.zip, f.dir])).toEqual([
      ["BannerBusAPIs", "production_API_catalog_A_B.zip", "BannerBusAPIs/"],
      ["BannerErpAPIs", "production_API_catalog_A_B.zip", "BannerErpAPIs/"],
      ["BannerWidgetAPIs", "production_API_catalog_W.zip", "production_API_catalog_W/production_API_catalog_W/BannerWidgetAPIs/"],
      ["ColleagueBusAPIs", "production_API_catalog_C.zip", "production_API_catalog_C/ColleagueBusAPIs/"],
      ["ColleagueWidgetAPIs", "production_API_catalog_C.zip", "production_API_catalog_C/ColleagueWidgetAPIs/"],
    ])
  })

  it("finds the same families whether they're in one zip or split across several", () => {
    zipCatalog(dir, { "all.zip": { families: ["BannerBusAPIs", "BannerErpAPIs", "BannerWidgetAPIs", "ColleagueBusAPIs", "ColleagueWidgetAPIs"], under: "x" } })
    expect(findCatalog(dir).families.map((f) => f.family)).toEqual(["BannerBusAPIs", "BannerErpAPIs", "BannerWidgetAPIs", "ColleagueBusAPIs", "ColleagueWidgetAPIs"])
  })

  it("names a family's files from the family's folder", () => {
    zipCatalog(dir)
    const widgets = findCatalog(dir).families.find((f) => f.family === "BannerWidgetAPIs")!
    expect(widgets.items.map((i) => i.name)).toContain("hinges-1.0.0/springs-1.0.0/springs.yaml")
  })

  it("doesn't take an API's folder for a family, even with another API folder inside it", () => {
    zipCatalog(dir)
    expect(findCatalog(dir).families.map((f) => f.family)).not.toContain("hinges-1.0.0")
  })

  it("leaves alone, and counts, zips with no families in them; and looks only at zips directly in the folder", () => {
    zipCatalog(dir)
    writeZip(path.join(dir, "holiday-photos.zip"), { "beach/photo-1.0.0/notes.txt": "sun" })
    writeZip(path.join(dir, "settings.zip"), { "config/app.yaml": "a: 1" })
    fs.mkdirSync(path.join(dir, "old"))
    writeZip(path.join(dir, "old", "production_API_catalog_A_B.zip"), { "BannerBusAPIs/x-1.0.0/x.yaml": "openapi: 3.0.0" })
    fs.writeFileSync(path.join(dir, "notes.txt"), "not a zip")
    const found = findCatalog(dir)
    expect(found.families).toHaveLength(5)
    expect(found.others).toEqual(["holiday-photos.zip", "settings.zip"])
    expect(zipsIn(dir)).toHaveLength(5)
  })

  it("skips macOS's __MACOSX copies, whose ._ files look like specs", () => {
    writeZip(path.join(dir, "a.zip"), {
      "WidgetAPIs/widgets-1.0.0/widgets.yaml": "openapi: 3.0.0",
      "__MACOSX/WidgetAPIs/widgets-1.0.0/._widgets.yaml": "junk",
    })
    expect(findCatalog(dir).families.map((f) => [f.family, f.items.length])).toEqual([["WidgetAPIs", 1]])
  })

  it("stops on a family in two zips, naming both (an old and a new download side by side)", () => {
    zipCatalog(dir)
    fs.copyFileSync(path.join(dir, "production_API_catalog_A_B.zip"), path.join(dir, "production_API_catalog_A_B (1).zip"))
    expect(problemOf(() => findCatalog(dir))).toEqual({
      problem: { kind: "two-zips", family: "BannerBusAPIs", zips: ["production_API_catalog_A_B (1).zip", "production_API_catalog_A_B.zip"] },
      message: "BannerBusAPIs is in two zips: production_API_catalog_A_B (1).zip and production_API_catalog_A_B.zip. Keep only the newest download.",
    })
  })

  it("stops on a zip that can't be opened, naming it", () => {
    zipCatalog(dir)
    fs.writeFileSync(path.join(dir, "production_API_catalog_D.zip"), "half a download")
    expect(problemOf(() => findCatalog(dir))).toEqual({
      problem: { kind: "damaged", zip: "production_API_catalog_D.zip" },
      message: "production_API_catalog_D.zip can't be opened. Download it again.",
    })
  })

  it("finds nothing in an empty folder", () => {
    expect(findCatalog(dir)).toEqual({ zips: [], others: [], families: [] })
  })
})

describe("unpackTexts", () => {
  it("unpacks just the files asked for, as text", () => {
    writeZip(path.join(dir, "a.zip"), { "W/a-1.0.0/a.yaml": "a: 1", "W/b-1.0.0/b.yaml": "b: £2" })
    expect([...unpackTexts(path.join(dir, "a.zip"), ["W/b-1.0.0/b.yaml"])]).toEqual([["W/b-1.0.0/b.yaml", "b: £2"]])
  })

  it("refuses a file whose contents don't match the checksum the zip stores", () => {
    // Stored without packing, so the damage can't make the unpacking itself fail: only the checksum shows it.
    const file = path.join(dir, "production_API_catalog_A_B.zip")
    fs.writeFileSync(file, zipSync({ "W/a-1.0.0/a.yaml": new TextEncoder().encode("openapi: 3.0.0") }, { level: 0 }))
    const bytes = fs.readFileSync(file)
    bytes[30 + "W/a-1.0.0/a.yaml".length + 2] ^= 0xff
    fs.writeFileSync(file, bytes)
    expect(problemOf(() => unpackTexts(file, ["W/a-1.0.0/a.yaml"]))).toMatchObject({ problem: { kind: "damaged", zip: "production_API_catalog_A_B.zip" } })
  })
})
