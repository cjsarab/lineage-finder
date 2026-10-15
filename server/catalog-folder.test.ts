import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { testCatalog, writeZip, zipCatalog } from "../indexer/test-support/zip-catalog.ts"
import { checkFolder, tidyPath } from "./catalog-folder.ts"

describe("tidyPath", () => {
  it('removes the quotes "Copy as path" adds, and spaces', () => {
    expect(tidyPath('  "C:\\Users\\me\\APICatalog"  ')).toBe("C:\\Users\\me\\APICatalog")
  })

  it("removes trailing slashes, but not the one in a bare drive", () => {
    expect(tidyPath("C:\\Users\\me\\APICatalog\\")).toBe("C:\\Users\\me\\APICatalog")
    expect(tidyPath("/home/me/APICatalog//")).toBe("/home/me/APICatalog")
    expect(tidyPath("C:\\")).toBe("C:\\")
  })

  it("leaves a quote that's part of a name alone", () => {
    expect(tidyPath('C:\\odd"name')).toBe('C:\\odd"name')
  })
})

// A folder of Ellucian's zips, made from the made-up catalog.
describe("checkFolder", () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-check-"))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it("accepts a folder of catalog zips, counting families and zips", () => {
    zipCatalog(dir)
    expect(checkFolder(dir)).toEqual({ kind: "ok", path: dir, families: 5, zips: 3, others: 0 })
  })

  it("accepts it pasted with quotes and a trailing slash", () => {
    zipCatalog(dir)
    expect(checkFolder(`"${dir}${path.sep}"`)).toMatchObject({ kind: "ok", path: dir })
  })

  it("counts other zips beside the catalog's, e.g. in Downloads", () => {
    zipCatalog(dir)
    writeZip(path.join(dir, "holiday-photos.zip"), { "beach.txt": "sun" })
    writeZip(path.join(dir, "invoices.zip"), { "2026/march.txt": "£" })
    expect(checkFolder(dir)).toEqual({ kind: "ok", path: dir, families: 5, zips: 3, others: 2 })
  })

  it("names a family in two zips", () => {
    zipCatalog(dir)
    fs.copyFileSync(path.join(dir, "production_API_catalog_C.zip"), path.join(dir, "production_API_catalog_C (1).zip"))
    expect(checkFolder(dir)).toEqual({
      kind: "two-zips",
      path: dir,
      family: "ColleagueBusAPIs",
      zips: ["production_API_catalog_C (1).zip", "production_API_catalog_C.zip"],
    })
  })

  it("names a zip that can't be opened", () => {
    zipCatalog(dir)
    fs.writeFileSync(path.join(dir, "production_API_catalog_D.zip"), "half a download")
    expect(checkFolder(dir)).toEqual({ kind: "damaged", path: dir, zip: "production_API_catalog_D.zip" })
  })

  it("spots a catalog that was unzipped, at the top or up to three folders down (as Explorer's Extract all leaves it)", () => {
    fs.cpSync(testCatalog, path.join(dir, "APICatalog"), { recursive: true })
    expect(checkFolder(path.join(dir, "APICatalog"))).toEqual({ kind: "unzipped", path: path.join(dir, "APICatalog") })
    expect(checkFolder(path.join(dir, "APICatalog", "BannerWidgetAPIs"))).toMatchObject({ kind: "unzipped" })
    const deep = path.join(dir, "Downloads", "production_API_catalog_D", "production_API_catalog_D")
    fs.cpSync(path.join(testCatalog, "BannerBusAPIs"), path.join(deep, "BannerBusAPIs"), { recursive: true })
    expect(checkFolder(path.join(dir, "Downloads"))).toEqual({ kind: "unzipped", path: path.join(dir, "Downloads") })
  })

  it("says a folder is empty when it has no zips and no unzipped catalog", () => {
    fs.mkdirSync(path.join(dir, "Photos", "2026"), { recursive: true })
    fs.writeFileSync(path.join(dir, "Photos", "2026", "notes.txt"), "")
    expect(checkFolder(dir)).toEqual({ kind: "empty", path: dir, others: 0 })
  })

  it("says how many zips there are when none hold a catalog", () => {
    writeZip(path.join(dir, "holiday-photos.zip"), { "beach.txt": "sun" })
    expect(checkFolder(dir)).toEqual({ kind: "empty", path: dir, others: 1 })
  })

  it("doesn't look inside node_modules or dot folders for an unzipped catalog", () => {
    for (const hidden of ["node_modules", ".git"]) fs.mkdirSync(path.join(dir, hidden, "WidgetAPIs"), { recursive: true })
    expect(checkFolder(dir)).toMatchObject({ kind: "empty" })
  })

  it("says when there's no such folder", () => {
    expect(checkFolder(path.join(dir, "nope"))).toMatchObject({ kind: "missing" })
  })

  it("says when it's a file, not a folder", () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "")
    expect(checkFolder(path.join(dir, "a.txt"))).toMatchObject({ kind: "not-a-folder" })
  })

  it("asks for the full path when given a partial one", () => {
    expect(checkFolder("catalog-zips")).toEqual({ kind: "not-full-path", path: "catalog-zips" })
    expect(checkFolder("")).toMatchObject({ kind: "not-full-path" })
  })
})
