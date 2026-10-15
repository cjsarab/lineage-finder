// "Is this a catalog?" check for the first-run screen. The catalog is Ellucian's zips as downloaded: the check reads
// the zips' lists of files, not their contents (well under a tenth of a second for all five).
import fs from "node:fs"
import path from "node:path"
import { CatalogZipError, findCatalog, type ZipCatalog } from "../indexer/catalog-zips.ts"

export type FolderCheck =
  | { kind: "ok"; path: string; families: number; zips: number; others: number }
  | { kind: "not-full-path"; path: string }
  | { kind: "missing"; path: string }
  | { kind: "not-a-folder"; path: string }
  /** No catalog zips, but a catalog that was unzipped (folders ending in APIs), e.g. last year's APICatalog. */
  | { kind: "unzipped"; path: string }
  /** Two zips hold the same family: likely an old and a new download side by side. */
  | { kind: "two-zips"; path: string; family: string; zips: [string, string] }
  /** A zip that can't be opened: damaged, or not fully downloaded. */
  | { kind: "damaged"; path: string; zip: string }
  /** No zips with a catalog in them; `others` is how many zips there are without one. */
  | { kind: "empty"; path: string; others: number }

/** Undoes what pasting tends to add: the quotes from "Copy as path", spaces, a trailing slash. */
export function tidyPath(raw: string): string {
  let p = raw.trim()
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1).trim()
  // Keep the slash in a bare drive or root ("C:\", "/"), where it's part of the name.
  while (p.length > 1 && /[\\/]$/.test(p) && !/^[A-Za-z]:[\\/]$/.test(p)) p = p.slice(0, -1)
  return p
}

export function checkFolder(raw: string): FolderCheck {
  const given = tidyPath(raw)
  if (!path.isAbsolute(given)) return { kind: "not-full-path", path: given }
  const dir = path.resolve(given)

  let stat: fs.Stats
  try {
    stat = fs.statSync(dir)
  } catch {
    return { kind: "missing", path: dir }
  }
  if (!stat.isDirectory()) return { kind: "not-a-folder", path: dir }

  let found: ZipCatalog
  try {
    found = findCatalog(dir)
  } catch (e) {
    if (!(e instanceof CatalogZipError)) return { kind: "empty", path: dir, others: 0 } // e.g. a folder we may not read
    const p = e.problem
    return p.kind === "damaged" ? { kind: "damaged", path: dir, zip: p.zip } : { kind: "two-zips", path: dir, family: p.family, zips: p.zips }
  }
  if (found.families.length > 0) {
    return { kind: "ok", path: dir, families: found.families.length, zips: found.zips.length, others: found.others.length }
  }
  if (found.others.length === 0 && holdsUnzippedCatalog(dir)) return { kind: "unzipped", path: dir }
  return { kind: "empty", path: dir, others: found.others.length }
}

// A folder ending in APIs (a family's name, e.g. BannerWidgetAPIs) here or up to three folders down: as deep as
// Explorer's "Extract all" puts them. Gives up after 2,000 folders, so a big
// folder such as a home folder stays quick.
function holdsUnzippedCatalog(dir: string): boolean {
  let looked = 0
  const look = (d: string, depth: number): boolean => {
    if (/APIs$/.test(path.basename(d))) return true
    if (depth === 3) return false
    for (const sub of subfolders(d)) {
      if (++looked > 2000) return false
      if (look(path.join(d, sub), depth + 1)) return true
    }
    return false
  }
  return look(dir, 0)
}

// Hidden folders and node_modules never hold a catalog.
const subfolders = (dir: string) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}
