// Makes THIRD-PARTY-NOTICES.txt: every package Lineage Finder ships with (built into the page, or in the release's
// node_modules), each with its own licence file word for word, then the toolkit's components. The release makes it
// afresh for each zip; the copy in the repo is kept the same by a test.
//
// Run: npm run notices      (after any change to the packages, then commit the file)
import fs from "node:fs"
import path from "node:path"
import { NOTICES_FILE, PAGE_PACKAGES, RUNTIME_PACKAGES, runtimePackageDirs, type LockPackages } from "./release.ts"

const mit = (copyright: string) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

/**
 * MIT packages that ship without a licence file: the copyright line from their own repository's licence (checked
 * 15 Oct 2026). A new package without one stops the notices until it's added here.
 */
export const NO_LICENCE_FILE: Record<string, string> = {
  "@polka/url": "Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (https://lukeed.com)",
  "react-remove-scroll-bar": "Copyright (c) 2025 Anton Korzunov <thekashey@gmail.com>",
  sirv: "Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (https://lukeed.com)",
}

const LICENCE_FILE = /^licen[cs]e(\.(md|txt))?$/i
const RULE = "=".repeat(80)
const tidy = (text: string) => text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim() + "\n"

interface Entry {
  name: string
  version: string
  licence: string
  text: string
}

/** One package's entry, from its folder (`node_modules/...`, as package-lock.json names it) under `root`. */
function entryFor(root: string, dir: string): Entry {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8"))
  const licence = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "unknown")
  const file = fs.readdirSync(path.join(root, dir)).find((f) => LICENCE_FILE.test(f))
  if (file) return { name: pkg.name, version: pkg.version, licence, text: tidy(fs.readFileSync(path.join(root, dir, file), "utf8")) }
  const copyright = NO_LICENCE_FILE[pkg.name]
  if (licence === "MIT" && copyright) return { name: pkg.name, version: pkg.version, licence, text: mit(copyright) }
  throw new Error(
    `${pkg.name} ${pkg.version} (${licence}) has no licence file: find its copyright line in its repository and add it to NO_LICENCE_FILE in scripts/notices.ts.`,
  )
}

/** The notices for these package folders: each name and version once, A–Z, then the toolkit's components. */
export function noticesFor(root: string, dirs: readonly string[]): string {
  const entries = new Map<string, Entry>()
  for (const dir of dirs) {
    const e = entryFor(root, dir)
    entries.set(`${e.name}@${e.version}`, e)
  }
  const sorted = [...entries.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1))
  const width = Math.max(...sorted.map((e) => `${e.name} ${e.version}`.length))
  return [
    "Lineage Finder: third-party notices",
    "",
    "Lineage Finder (MIT, see LICENSE) includes the software and fonts below, each under its own licence. Some are",
    "built into the web page (dist), the rest are in node_modules. Made by `npm run notices`: not edited by hand.",
    "",
    `The packages (${sorted.length}):`,
    ...sorted.map((e) => `  ${`${e.name} ${e.version}`.padEnd(width)}  ${e.licence}`),
    "  The toolkit's components (neobrutalism.com and shadcn/ui)  MIT",
    "",
    ...sorted.flatMap((e) => [RULE, `${e.name} ${e.version}`, `Licence: ${e.licence}`, RULE, "", e.text]),
    RULE,
    "The toolkit's components (src/components/ui, built into the web page)",
    RULE,
    "",
    "The app's buttons, boxes and other components were copied from neobrutalism.com and changed for the app.",
    "neobrutalism.com builds on shadcn/ui. Both are MIT; the component files the site serves carry no notice of",
    "their own, so these are the licences in their repositories.",
    "",
    "neobrutalism.com (https://github.com/neobrutalism/neobrutalism):",
    "",
    mit("Copyright (c) 2024 Arif Hossain"),
    "shadcn/ui (https://github.com/shadcn-ui/ui):",
    "",
    mit("Copyright (c) 2023 shadcn"),
  ].join("\n")
}

/** The notices for everything Lineage Finder ships with: the page's packages and the release's, with what they need. */
export function thirdPartyNotices(root: string, lock: LockPackages): string {
  const dirs = new Set([...runtimePackageDirs(lock, PAGE_PACKAGES), ...runtimePackageDirs(lock, RUNTIME_PACKAGES)])
  return noticesFor(root, [...dirs])
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, "..")
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")) as { packages: LockPackages }
  fs.writeFileSync(path.join(root, NOTICES_FILE), thirdPartyNotices(root, lock.packages))
  console.log(`Wrote ${NOTICES_FILE}.`)
}
