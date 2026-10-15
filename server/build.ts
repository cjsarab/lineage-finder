import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/** Files and folders whose changes mean the web page must be rebuilt. */
const PAGE_SOURCES = ["src", "index.html", "vite.config.ts", "package.json", "package-lock.json"]

/**
 * A release zip has the built page but not its source, and the build tools may be blocked
 * where it runs, so with no `src` there is nothing to build: the page is used as it is.
 */
export const canBuild = (root: string) => fs.existsSync(path.join(root, "src"))

export const hasBuiltPage = (distDir: string) => fs.existsSync(path.join(distDir, "index.html"))

/** True if the built page in `distDir` is missing or older than any of its sources under `root`; false in a release. */
export function needsBuild(root: string, distDir: string): boolean {
  if (!canBuild(root)) return false
  const built = mtime(path.join(distDir, "index.html"))
  if (built === null) return true
  return PAGE_SOURCES.some((source) => newestMtime(path.join(root, source)) > built)
}

/** Builds the web page with Vite, showing its output. Throws if the build fails. */
export function buildPage(root: string): void {
  const vite = path.join(root, "node_modules", "vite", "bin", "vite.js")
  const result = spawnSync(process.execPath, [vite, "build"], { cwd: root, stdio: "inherit" })
  if (result.status !== 0) throw new Error("Building the web page failed (see the messages above).")
}

function mtime(file: string): number | null {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return null
  }
}

/** Newest modification time of a file, or of any file inside a folder. 0 if it doesn't exist. */
function newestMtime(target: string): number {
  let stat: fs.Stats
  try {
    stat = fs.statSync(target)
  } catch {
    return 0
  }
  if (!stat.isDirectory()) return stat.mtimeMs
  let newest = stat.mtimeMs
  for (const entry of fs.readdirSync(target)) {
    newest = Math.max(newest, newestMtime(path.join(target, entry)))
  }
  return newest
}
