import path from "node:path"
import { fileURLToPath } from "node:url"
import open from "open"
import { createApi } from "./api.ts"
import { buildPage, canBuild, hasBuiltPage, needsBuild } from "./build.ts"
import { DEFAULT_PORT, createAppServer, listen } from "./server.ts"
import { CATALOG_ZIPS_FOLDER } from "./settings.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distDir = path.join(root, "dist")
const dataDir = path.join(root, "data")
const defaultCatalog = path.join(root, CATALOG_ZIPS_FOLDER)
const shouldOpen = !process.argv.includes("--no-open")

if (needsBuild(root, distDir)) {
  console.log("Preparing the web page (only needed after an update)...")
  buildPage(root)
} else if (!canBuild(root) && !hasBuiltPage(distDir)) {
  console.error(
    "The web page is missing from this folder (there should be a dist folder beside server).\n" +
      "Unzip the release again, into an empty folder, and run npm start there.",
  )
  process.exit(1)
}

const api = createApi({ dataDir, defaultCatalog })
const server = createAppServer(distDir, api.handle)
const port = await listen(server)
const url = `http://localhost:${port}`
if (port !== DEFAULT_PORT) {
  console.log(`\nPort ${DEFAULT_PORT} is busy (is Lineage Finder already open in another window?), so using ${port}.`)
}
console.log(`\nLineage Finder is running at ${url}\nPress Ctrl+C to stop.\n`)

if (shouldOpen) {
  open(url).catch(() => console.log(`Couldn't open the browser by itself. Open ${url} yourself.`))
}

process.on("SIGINT", () => {
  // Any reading in progress stops; the previous index (if any) is untouched.
  api.stop()
  console.log("Stopped.")
  server.close()
  process.exit(0)
})
