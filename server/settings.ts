// What the app remembers on this computer, in data/settings.json.
// Lives beside the index, so deleting data/ resets the app to a first run. Light/dark and the accent colour
// are remembered by the browser instead.
import fs from "node:fs"
import path from "node:path"

/** The app's own folder for Ellucian's zips, inside the app. */
export const CATALOG_ZIPS_FOLDER = "catalog-zips"

export interface Settings {
  /** The catalog folder the user chose; null means the default, catalog-zips inside the app. */
  catalog: string | null
}

const DEFAULTS: Settings = { catalog: null }
const file = (dataDir: string) => path.join(dataDir, "settings.json")

export function readSettings(dataDir: string): Settings {
  try {
    const saved = JSON.parse(fs.readFileSync(file(dataDir), "utf8")) as Partial<Settings>
    return { catalog: typeof saved.catalog === "string" ? saved.catalog : null }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(dataDir: string, settings: Settings): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(file(dataDir), JSON.stringify(settings, null, 2) + "\n")
}

/**
 * "Delete the index data": removes the index, the remembered folder, and any
 * half-written index an interrupted run left behind. Only the app's own files: anything else in the folder is
 * left alone, and the folder itself goes only if that leaves it empty.
 */
export function deleteAppData(dataDir: string): void {
  if (!fs.existsSync(dataDir)) return
  for (const name of fs.readdirSync(dataDir)) {
    if (name === "index" || name === "settings.json" || /^index\.(tmp|old)-/.test(name)) {
      fs.rmSync(path.join(dataDir, name), { recursive: true, force: true })
    }
  }
  if (fs.readdirSync(dataDir).length === 0) fs.rmdirSync(dataDir)
}

/** The folder to read: the one chosen, or the default. */
export function catalogFolder(settings: Settings, defaultCatalog: string): string {
  return settings.catalog ?? defaultCatalog
}
