// For tests only (not shipped, see scripts/release.ts): zips the made-up test catalog (indexer/test-catalog/) as the
// tests run, into the shapes Ellucian's zips come in. The test catalog
// itself stays plain folders, so it's easy to read and edit.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { zipSync, type Zippable } from "fflate"

export const testCatalog = path.join(import.meta.dirname, "..", "test-catalog")

/** One zip: the families in it, under `under` (folders inside the zip above the families, e.g. "part_D/part_D"). */
export interface ZipShape {
  families: string[]
  under?: string
}

/**
 * The usual shape for tests: the test catalog's five families split across three zips, at the top of one zip, one
 * folder down in another and two folders down in the third, as in Ellucian's five.
 */
export const FIVE_ZIP_SHAPE: Record<string, ZipShape> = {
  "production_API_catalog_A_B.zip": { families: ["BannerBusAPIs", "BannerErpAPIs"] },
  "production_API_catalog_C.zip": { families: ["ColleagueBusAPIs", "ColleagueWidgetAPIs"], under: "production_API_catalog_C" },
  "production_API_catalog_W.zip": { families: ["BannerWidgetAPIs"], under: "production_API_catalog_W/production_API_catalog_W" },
}

/** Zips `from` (default: the test catalog) into `folder`, one zip per entry of `shape`. Returns `folder`. */
export function zipCatalog(folder: string, shape: Record<string, ZipShape> = FIVE_ZIP_SHAPE, from = testCatalog): string {
  fs.mkdirSync(folder, { recursive: true })
  for (const [zip, { families, under }] of Object.entries(shape)) {
    const files: Record<string, Uint8Array> = {}
    for (const family of families) {
      for (const rel of filesUnder(path.join(from, family))) {
        files[[under, family, rel].filter(Boolean).join("/")] = fs.readFileSync(path.join(from, family, ...rel.split("/")))
      }
    }
    writeZip(path.join(folder, zip), files)
  }
  return folder
}

/** A temporary folder holding the test catalog as zips, in `shape`. */
export function zippedTestCatalog(shape: Record<string, ZipShape> = FIVE_ZIP_SHAPE): string {
  return zipCatalog(fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-zips-")), shape)
}

/** Writes a zip with these files (paths with "/"; text or bytes). Dates fixed, so the same files give the same zip. */
export function writeZip(file: string, files: Record<string, Uint8Array | string>): void {
  const mtime = new Date("2026-04-01T12:00:00Z")
  const zippable: Zippable = {}
  for (const [name, content] of Object.entries(files)) {
    zippable[name] = [typeof content === "string" ? new TextEncoder().encode(content) : content, { mtime }]
  }
  fs.writeFileSync(file, zipSync(zippable))
}

function filesUnder(dir: string, prefix = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = prefix ? `${prefix}/${d.name}` : d.name
    return d.isDirectory() ? filesUnder(path.join(dir, d.name), rel) : [rel]
  })
}
