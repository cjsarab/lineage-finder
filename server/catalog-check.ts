// "Your catalog has changed since it was last read": at start-up, and after each re-index, the catalog folder is
// compared with the list of files saved with the index. Start-up only: the app doesn't watch the folder, which
// wasn't thought essential.
import { catalogChanged, fingerprint, listCatalogFiles } from "../indexer/catalog-files.ts"
import { readCatalogFiles, readIndexInfo } from "../indexer/run-index.ts"
import type { CatalogCheck } from "./api-types.ts"

export interface CatalogChecker {
  current(): CatalogCheck
  /** Checks again in the background (about 0.1 s); `current` says "checking" meanwhile. */
  refresh(): Promise<void>
}

export function createCatalogCheck(dataDir: string): CatalogChecker {
  let state: CatalogCheck = { state: "unknown" }
  let latest = 0
  return {
    current: () => state,
    async refresh() {
      const mine = ++latest
      state = { state: "checking" }
      const next = await check(dataDir)
      if (mine === latest) state = next
    },
  }
}

// "unknown" when the app can't tell: no index, an index made by an older version (no list), a folder that's gone, or zips
// that can't be read as a catalog (the folder check says why, when the user reads it again).
async function check(dataDir: string): Promise<CatalogCheck> {
  const index = readIndexInfo(dataDir)
  const saved = readCatalogFiles(dataDir)
  if (index.state !== "ready" || !saved) return { state: "unknown" }
  try {
    const now = listCatalogFiles(index.info.catalog)
    return { state: catalogChanged(saved, now) ? "changed" : "same", fingerprint: fingerprint(now) }
  } catch {
    return { state: "unknown" }
  }
}
