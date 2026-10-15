import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { catalogChanged, fingerprint, listCatalogFiles } from "./catalog-files.ts"
import { writeZip } from "./test-support/zip-catalog.ts"

// The specs inside the zips, with the checksums the zips store.
describe("the catalog's list of YAML files", () => {
  let dir: string
  const spec = "openapi: 3.0.0\n"
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-files-"))
    zip("production_API_catalog_A_B.zip", { "part/WidgetAPIs/widgets-1.0.0/widgets.yaml": spec, "part/WidgetAPIs/widgets-1.0.0/README.pdf": "not yaml" })
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  const zip = (name: string, files: Record<string, string>) => writeZip(path.join(dir, name), files)
  const list = () => listCatalogFiles(dir)

  it("lists only YAML files, by path in the catalog (without the zip's own folders), with their zip, size and checksum", () => {
    expect(list()).toEqual({ "WidgetAPIs/widgets-1.0.0/widgets.yaml": { zip: "production_API_catalog_A_B.zip", size: spec.length, crc: zlib.crc32(spec) } })
  })

  it("is unchanged when nothing changed, or only a file that isn't YAML", () => {
    const was = list()
    zip("production_API_catalog_A_B.zip", { "part/WidgetAPIs/widgets-1.0.0/widgets.yaml": spec, "part/WidgetAPIs/widgets-1.0.0/README.pdf": "a new readme" })
    expect(catalogChanged(was, list())).toBe(false)
  })

  it("is unchanged when the same zips are downloaded again or copied elsewhere: dates don't count", () => {
    const was = list()
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-files-"))
    try {
      fs.copyFileSync(path.join(dir, "production_API_catalog_A_B.zip"), path.join(copy, "production_API_catalog_A_B.zip"))
      fs.utimesSync(path.join(copy, "production_API_catalog_A_B.zip"), new Date("2027-01-01"), new Date("2027-01-01"))
      expect(catalogChanged(was, listCatalogFiles(copy))).toBe(false)
    } finally {
      fs.rmSync(copy, { recursive: true, force: true })
    }
  })

  it("is unchanged when Ellucian move a family to another zip", () => {
    const was = list()
    fs.rmSync(path.join(dir, "production_API_catalog_A_B.zip"))
    zip("production_API_catalog_V_W.zip", { "WidgetAPIs/widgets-1.0.0/widgets.yaml": spec })
    expect(catalogChanged(was, list())).toBe(false)
  })

  it("has changed when a YAML file is added or removed", () => {
    const was = list()
    zip("production_API_catalog_G.zip", { "GadgetAPIs/gadgets-1.0.0/gadgets.yml": spec })
    expect(catalogChanged(was, list())).toBe(true)
    fs.rmSync(path.join(dir, "production_API_catalog_G.zip"))
    expect(catalogChanged(was, list())).toBe(false)
    zip("production_API_catalog_A_B.zip", { "part/WidgetAPIs/widgets-2.0.0/widgets.yaml": spec })
    expect(catalogChanged(was, list())).toBe(true)
  })

  it("has changed when a file's contents differ, even at the same size", () => {
    const was = list()
    zip("production_API_catalog_A_B.zip", { "part/WidgetAPIs/widgets-1.0.0/widgets.yaml": "openapi: 3.0.1\n" })
    expect(catalogChanged(was, list())).toBe(true)
  })

  it("gives the same fingerprint for the same contents, and another when they change", () => {
    const a = fingerprint(list())
    expect(fingerprint(list())).toBe(a)
    zip("production_API_catalog_A_B.zip", { "part/WidgetAPIs/widgets-1.0.0/widgets.yaml": "openapi: 3.0.1\n" })
    expect(fingerprint(list())).not.toBe(a)
  })
})
