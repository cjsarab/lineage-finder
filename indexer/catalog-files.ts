// The catalog's YAML files as they were when read, saved with the index, so the app can tell at start-up that the
// catalog has changed since. The files are those inside the zips, each with the checksum its zip stores: it's the
// contents that count,
// so downloading the same catalog again or copying the zips elsewhere isn't a change, and a real update always is.
import crypto from "node:crypto"
import { isYaml } from "./folders.ts"
import { findCatalog, type ZipCatalog } from "./catalog-zips.ts"

export const CATALOG_FILES = "catalog-files.json"

export interface CatalogFile {
  /** The zip it's in. Kept for reference: moving a file to another zip isn't a change. */
  zip: string
  size: number
  /** Its CRC-32 checksum, from the zip's list of files. */
  crc: number
}

/** By path within the catalog ("Family/folder/spec.yaml"). */
export type CatalogFiles = Record<string, CatalogFile>

/** Every YAML file in the catalog's families, from the zips' lists of files (not their contents). */
export function catalogFilesOf(catalog: ZipCatalog): CatalogFiles {
  const files = catalog.families.flatMap((f) =>
    f.items.filter((i) => !i.name.endsWith("/") && isYaml(i.name)).map((i) => [`${f.family}/${i.name}`, { zip: f.zip, size: i.size, crc: i.crc }] as const),
  )
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(files)
}

/** The YAML files in the zips in `folder` now. Throws a CatalogZipError if the zips can't be read as a catalog. */
export const listCatalogFiles = (folder: string): CatalogFiles => catalogFilesOf(findCatalog(folder))

const sameFile = (was: CatalogFile, now: CatalogFile) => was.size === now.size && was.crc === now.crc

/** True when a YAML file was added or removed, or its contents differ. */
export function catalogChanged(was: CatalogFiles, now: CatalogFiles): boolean {
  const before = Object.keys(was), after = Object.keys(now)
  if (before.length !== after.length) return true
  return after.some((k) => !Object.hasOwn(was, k) || !sameFile(was[k], now[k]))
}

/** A short name for what's in the folder now, so "Not now" can be remembered until the catalog changes again. */
export function fingerprint(files: CatalogFiles): string {
  const contents = Object.entries(files).map(([k, f]) => `${k}:${f.size}:${f.crc}`)
  return crypto.createHash("sha1").update(contents.join("\n")).digest("hex").slice(0, 16)
}
