// How the catalog is laid out: families, API-version folders and their spec files, found inside Ellucian's zips.
// The rules come from a survey of the whole catalog, rewritten here with tests.
import type { ZipCatalog } from "./catalog-zips.ts"

export type Product = "banner" | "colleague"

export interface FolderEntry {
  family: string
  folder: string
  /** Folder path inside the catalog, always with "/" (e.g. "BannerBusAPIs/gadget-codes-1.0.0"). */
  relDir: string
  name: string
  /** The version at the end of the folder name; null if the name has none. */
  version: string | null
  separator: "-" | "." | null
  /** The API folder this one was found inside by mistake, if any. */
  nestedIn: string | null
  /** The YAML spec (first alphabetically); null if the folder has none. */
  specFile: string | null
  /** Any further YAML files in the same folder, which are not read. */
  extraYaml: string[]
  /** The zip it's in, by file name (e.g. "production_API_catalog_A_B.zip"). */
  zip: string
  /** The spec's path inside the zip, to unpack it; null if the folder has no YAML file. */
  specInZip: string | null
}

// "gadget-codes-1.0.0" -> name "gadget-codes", version "1.0.0"; "gizmos.2.0.0" uses "."
export function splitFolder(folder: string): Pick<FolderEntry, "name" | "version" | "separator"> {
  const m = folder.match(/^(.*?)([-.])(\d+(?:\.\d+)*)$/)
  if (!m) return { name: folder, version: null, separator: null }
  return { name: m[1], version: m[3], separator: m[2] as "-" | "." }
}

export function padVersion(version: string): string {
  const parts = version.trim().split(".")
  while (parts.length < 3) parts.push("0")
  return parts.join(".")
}

// Number by number, so 1.10.0 comes after 1.9.0. A missing part counts as 0.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// Every family that isn't Colleague's is treated as Banner.
export function productOf(family: string): Product {
  return family.startsWith("Colleague") ? "colleague" : "banner"
}

export const isYaml = (file: string) => /\.ya?ml$/i.test(file)

/** Every API-version folder in the catalog's zips, including one misplaced inside another API's folder (flagged). */
export function listCatalog(catalog: ZipCatalog): FolderEntry[] {
  const out: FolderEntry[] = []
  for (const f of catalog.families) {
    // Folders two deep and YAML files three deep, from the family's folder. A zip may list a folder only through the
    // files in it, so every file's folders count too.
    const subfolders = new Map<string, Set<string>>()
    const yaml = new Map<string, Set<string>>()
    const add = (map: Map<string, Set<string>>, parts: string[]) => {
      const key = parts.slice(0, -1).join("/")
      ;(map.get(key) ?? map.set(key, new Set()).get(key)!).add(parts.at(-1)!)
    }
    for (const item of f.items) {
      const parts = item.name.split("/").filter(Boolean)
      const folders = item.name.endsWith("/") ? parts : parts.slice(0, -1)
      for (let depth = 1; depth <= Math.min(2, folders.length); depth++) add(subfolders, folders.slice(0, depth))
      if (!item.name.endsWith("/") && isYaml(item.name) && parts.length <= 3) add(yaml, parts)
    }
    const sorted = (set: Set<string> | undefined) => [...(set ?? [])].sort()
    const entry = (relParts: string[], nestedIn: string | null): FolderEntry => {
      const folder = relParts.at(-1)!
      const files = sorted(yaml.get(relParts.join("/")))
      const specFile = files[0] ?? null
      return {
        family: f.family,
        folder,
        relDir: [f.family, ...relParts].join("/"),
        ...splitFolder(folder),
        nestedIn,
        specFile,
        extraYaml: files.slice(1),
        zip: f.zip,
        specInZip: specFile ? `${f.dir}${relParts.join("/")}/${specFile}` : null,
      }
    }
    for (const folder of sorted(subfolders.get(""))) {
      out.push(entry([folder], null))
      for (const inner of sorted(subfolders.get(folder))) out.push(entry([folder, inner], folder))
    }
  }
  return out
}
