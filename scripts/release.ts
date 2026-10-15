// Makes a release zip: the built page, the server and indexer, and only the packages the running app uses, so a
// machine that blocks the build tools can run the app with Node alone.
//
// Run: npm run release      (then publish with gh, see the README)
//      npm run release -- --allow-uncommitted   (a trial zip from uncommitted work: never publish it)
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { buildPage } from "../server/build.ts"
import { CATALOG_ZIPS_FOLDER } from "../server/settings.ts"
import { ELLUCIAN_DOWNLOAD_PAGE } from "../src/lib/first-run-text.ts"
import { thirdPartyNotices } from "./notices.ts"

/** The packages the running app imports (server/ and indexer/); everything else is build or test tooling. */
export const RUNTIME_PACKAGES = ["fflate", "js-yaml", "open", "sirv", "yaml"]

/**
 * The packages built into the page: those src/ imports, the fonts and Tailwind's CSS (src/theme.css). Not shipped as
 * packages, but their code is in dist/, so they're in the notices. A test checks the list against src/'s imports.
 */
export const PAGE_PACKAGES = [
  "@base-ui/react",
  "@fontsource/archivo-black",
  "@fontsource/atkinson-hyperlegible-mono",
  "@fontsource/atkinson-hyperlegible-next",
  "class-variance-authority",
  "clsx",
  "cmdk",
  "lucide-react",
  "react",
  "react-dom",
  "react-router",
  "sonner",
  "tailwind-merge",
  "tailwindcss",
]

/** Every shipped package's licence, made by `npm run notices` (scripts/notices.ts). */
export const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt"

/** What the zip holds at its top: unzipped into an empty folder, it's ready to run. */
export const TOP_LEVEL = ["dist", "server", "indexer", "node_modules", "package.json", "HOW-TO-RUN.txt", "LICENSE", NOTICES_FILE, CATALOG_ZIPS_FOLDER]

/** The README in the empty catalog-zips folder the release ships with. */
export const CATALOG_ZIPS_README = `${CATALOG_ZIPS_FOLDER}/README.txt`
export const catalogZipsReadme = () =>
  "Put the five zips you download from Ellucian here, as they are (no need to unzip them).\n" +
  "When Ellucian publish a new catalog, delete the old zips and put the new ones in.\n"

export type LockPackages = Record<string, { version?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; dev?: boolean }>

/**
 * The `node_modules/...` folders (as package-lock.json names them) of `roots` and every package they need, found as
 * Node finds them: inside the needing package's own node_modules first, then each folder above it.
 */
export function runtimePackageDirs(lock: LockPackages, roots: readonly string[]): string[] {
  const found = new Set<string>()
  const resolve = (name: string, from: string): string => {
    let base = from
    for (;;) {
      const key = `${base ? `${base}/` : ""}node_modules/${name}`
      if (lock[key]) return key
      if (!base) throw new Error(`package-lock.json has no ${name} (needed by ${from || "the app"}): run npm ci, then try again.`)
      const cut = base.lastIndexOf("node_modules/")
      base = cut <= 0 ? "" : base.slice(0, cut - 1)
    }
  }
  const visit = (key: string) => {
    if (found.has(key)) return
    found.add(key)
    const p = lock[key]
    for (const dep of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) {
      try {
        visit(resolve(dep, key))
      } catch (e) {
        if (!p.optionalDependencies?.[dep]) throw e // an optional one not installed here is fine
      }
    }
  }
  for (const name of roots) visit(resolve(name, ""))
  return [...found].sort()
}

/** Whether a file of the project (path from the repo's root, with "/") goes into the zip. */
export function shipped(rel: string): boolean {
  if (rel.startsWith("dist/")) return true
  if (!rel.startsWith("server/") && !rel.startsWith("indexer/")) return false
  if (/\.test\.tsx?$/.test(rel)) return false
  if (rel.startsWith("indexer/test-catalog/") || rel.startsWith("indexer/test-support/")) return false
  return true
}

/**
 * Reasons the staged release must not be zipped, from its file list (paths with "/"). Never ship Ellucian's catalog,
 * anything from data/, or a native (.node) file a locked-down machine might block; and the page must be there.
 */
export function problemsIn(files: readonly string[]): string[] {
  const problems: string[] = []
  for (const f of files) {
    if (/\.node$/i.test(f)) problems.push(`native file (could be blocked): ${f}`)
    if (/\.(ya?ml|pdf)$/i.test(f)) problems.push(`catalog-shaped file: ${f}`)
    if (f.split("/").some((part) => part === "APICatalog" || /APIs$/.test(part))) problems.push(`catalog folder: ${f}`)
    if (/\.zip$/i.test(f)) problems.push(`zip file (could be the catalog): ${f}`)
    if (f.startsWith(`${CATALOG_ZIPS_FOLDER}/`) && f !== CATALOG_ZIPS_README) problems.push(`in the catalog folder: ${f}`)
    if (f.startsWith("data/")) problems.push(`index or settings data: ${f}`)
  }
  if (!files.includes("dist/index.html")) problems.push("the built page (dist/index.html) is missing")
  for (const top of TOP_LEVEL) if (!files.some((f) => f === top || f.startsWith(`${top}/`))) problems.push(`${top} is missing`)
  return problems
}

interface PackageJson {
  name: string
  version: string
  description?: string
  license?: string
  type?: string
  engines?: Record<string, string>
  dependencies: Record<string, string>
}

/** The release's package.json: just enough for `npm start`, and the packages it ships with. */
export function releasePackageJson(pkg: PackageJson): object {
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    private: true,
    type: pkg.type,
    engines: pkg.engines,
    scripts: { start: "node server/start.js" },
    dependencies: Object.fromEntries(RUNTIME_PACKAGES.map((name) => [name, pkg.dependencies[name]])),
  }
}

export const zipName = (version: string) => `lineage-finder-${version}.zip`

export function howToRun(version: string): string {
  return `Lineage Finder ${version}
An unofficial, local-only browser for the API catalog that Ellucian lets its customers download.
Not affiliated with or endorsed by Ellucian. This zip holds no Ellucian material: you point the app at your own copy
of the catalog.

FIRST TIME
1. You need Node.js 24 or newer (https://nodejs.org). On a managed computer, ask your IT team to install it.
   Nothing else to install.
2. Unzip this file into a folder of its own.
3. Download the API catalog's five zip files from Ellucian's download page (you'll need your Ellucian login):
   ${ELLUCIAN_DOWNLOAD_PAGE}
   Put them, as they are, into the "catalog-zips" folder. No need to unzip them.
4. Open a terminal in that folder and run:   npm start
   (or:   node server/start.js)
   Your browser opens the app.
5. With "In the app's catalog-zips folder" chosen, press "Read my catalog". Building the index takes about
   40 seconds.
   Ctrl+C in the terminal stops the app.

WHEN ELLUCIAN PUBLISH A NEW CATALOG
Delete the old zips from "catalog-zips" and put the new ones in. The app notices and offers to re-read them.

MOVING TO A NEW RELEASE
1. Unzip the new release into a new folder.
2. Move the "data" folder from the old folder into the new one: it holds the index and where your catalog is.
   If your zips are in the old folder's "catalog-zips", move them into the new one's "catalog-zips" too.
   (Light/dark, the accent colour, Favourites and Recently viewed are kept by your browser, so they carry over.)
3. Run npm start in the new folder. If the app asks to read the catalog again, let it (about 40 seconds).
4. Delete the old folder when you're happy.

Settings > About shows which version you're running.
`
}

/** Every file under `dir`, as paths from `dir` with "/". */
function filesUnder(dir: string, prefix = ""): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = prefix ? `${prefix}/${d.name}` : d.name
    return d.isDirectory() ? filesUnder(path.join(dir, d.name), rel) : [rel]
  })
}

function copy(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function uncommitted(root: string): string {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
  return r.status === 0 ? r.stdout.trim() : "(couldn't ask git)"
}

function main() {
  const root = path.resolve(import.meta.dirname, "..")
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as PackageJson
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")) as { packages: LockPackages }
  const allowUncommitted = process.argv.includes("--allow-uncommitted")
  const out = path.join(root, "releases")
  const zip = path.join(out, zipName(pkg.version))

  const changes = uncommitted(root)
  if (changes && !allowUncommitted) {
    throw new Error(`Commit your changes first, so the release matches a commit:\n${changes}`)
  }
  if (fs.existsSync(zip)) throw new Error(`${path.relative(root, zip)} already exists: raise the version in package.json first.`)

  console.log("Checking (type checks and tests)...")
  const check = spawnSync("npm run check", { cwd: root, stdio: "inherit", shell: true })
  if (check.status !== 0) throw new Error("npm run check failed: fix it (or, if it's the test runner's known Windows hiccup, run again).")

  console.log("Building the web page...")
  buildPage(root)

  const stage = path.join(out, `staging-${pkg.version}`)
  fs.rmSync(stage, { recursive: true, force: true })
  for (const rel of [...filesUnder(path.join(root, "dist"), "dist"), ...filesUnder(path.join(root, "server"), "server"), ...filesUnder(path.join(root, "indexer"), "indexer")]) {
    if (shipped(rel)) copy(path.join(root, rel), path.join(stage, rel))
  }
  for (const dir of runtimePackageDirs(lock.packages, RUNTIME_PACKAGES)) {
    for (const rel of filesUnder(path.join(root, dir))) {
      if (rel.startsWith("node_modules/")) continue // a nested package: it has its own entry, if it's needed
      copy(path.join(root, dir, rel), path.join(stage, dir, rel))
    }
  }
  fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(releasePackageJson(pkg), null, 2) + "\n")
  fs.writeFileSync(path.join(stage, "HOW-TO-RUN.txt"), howToRun(pkg.version).replace(/\n/g, "\r\n"))
  fs.writeFileSync(path.join(stage, "LICENSE"), fs.readFileSync(path.join(root, "LICENSE"), "utf8").replace(/\r?\n/g, "\r\n"))
  // Made afresh from what ships (the copy in the repo is kept the same by a test).
  fs.writeFileSync(path.join(stage, NOTICES_FILE), thirdPartyNotices(root, lock.packages).replace(/\n/g, "\r\n"))
  fs.mkdirSync(path.join(stage, CATALOG_ZIPS_FOLDER))
  fs.writeFileSync(path.join(stage, CATALOG_ZIPS_README), catalogZipsReadme().replace(/\n/g, "\r\n"))

  const problems = problemsIn(filesUnder(stage))
  if (problems.length) throw new Error(`Not zipping: ${problems.length} problem(s):\n${problems.slice(0, 20).join("\n")}`)

  // Windows' own tar (not Git's) writes proper zip files, with "/" in the names.
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
  const made = spawnSync(tar, ["-a", "-c", "-f", zip, "-C", stage, ...TOP_LEVEL], { stdio: "inherit" })
  if (made.status !== 0) throw new Error("Making the zip failed (see the messages above).")
  fs.rmSync(stage, { recursive: true, force: true })

  const size = (fs.statSync(zip).size / 1024 / 1024).toFixed(1)
  console.log(`\nMade ${path.relative(root, zip)} (${size} MB).`)
  if (changes) console.log("Made from UNCOMMITTED work: a trial only, don't publish it.")
}

if (import.meta.main) {
  try {
    main()
  } catch (e) {
    console.error(`\n${(e as Error).message}`)
    process.exit(1)
  }
}
