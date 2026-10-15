// `npm run index`: build the index from your catalog. The app runs the indexer itself; this command stays for
// development.
//   npm run index                      index the folder chosen in the app (catalog-zips/ inside the app if none)
//   npm run index -- "D:\path"         index the catalog zips in another folder
//   npm run index -- --threads 4       use 4 reading threads (default: CPU threads minus one, at most 6)
//   npm run index -- --check           compare the current index with the survey's counts
//   npm run index -- --show widgets    print what the index holds for an API
import fs from "node:fs"
import path from "node:path"
import { rememberedCatalog } from "../server/api.ts"
import { CATALOG_ZIPS_FOLDER } from "../server/settings.ts"
import { parseArgs } from "./cli-args.ts"
import { compareWithSurvey, formatCheck, formatShow, formatSummary } from "./report.ts"
import { defaultThreads, readIndex, runIndex } from "./run-index.ts"

const appRoot = path.join(import.meta.dirname, "..")
const dataDir = path.join(appRoot, "data")

function currentIndex() {
  const index = readIndex(dataDir)
  if (!index) {
    console.error("There's no index yet (or it's from an older version of the app). Run `npm run index` first.")
    process.exit(1)
  }
  return index
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if ("error" in args) {
    console.error(args.error)
    process.exit(1)
  }

  if (args.mode === "check") {
    const diffs = compareWithSurvey(currentIndex().info.counts)
    console.log(formatCheck(diffs))
    process.exit(diffs.length ? 1 : 0)
  }

  if (args.mode === "show") {
    console.log(formatShow(currentIndex().apis, args.name))
    return
  }

  const catalog = path.resolve(args.catalog ?? rememberedCatalog(dataDir, path.join(appRoot, CATALOG_ZIPS_FOLDER)))
  if (!fs.existsSync(catalog) || !fs.statSync(catalog).isDirectory()) {
    console.error(`Can't find a folder at ${catalog} (it should hold the zips you downloaded from Ellucian)`)
    process.exit(1)
  }

  const controller = new AbortController()
  process.on("SIGINT", () => controller.abort())

  const threads = args.threads ?? defaultThreads()
  console.log(`Reading your catalog at ${catalog} (${threads} threads)`)
  let lastShown = 0
  try {
    const info = await runIndex({
      catalog,
      dataDir,
      threads,
      signal: controller.signal,
      onProgress: (done, total) => {
        if (done === total || Date.now() - lastShown > 250) {
          lastShown = Date.now()
          process.stdout.write(`\r  ${done.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} spec files read`)
        }
      },
    })
    const indexDir = path.join(dataDir, "index")
    const bytes = fs.readdirSync(indexDir).reduce((sum, f) => sum + fs.statSync(path.join(indexDir, f)).size, 0)
    console.log("\n\n" + formatSummary(info, bytes) + `\nIt's in ${indexDir}`)
  } catch (e) {
    console.error("\n\n" + (e as Error).message)
    process.exit(1)
  }
}

await main()
