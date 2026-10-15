// Checks that every component in src/components/ui/ is neobrutalism.com's version (Base UI set).
// The shadcn installer can silently swap in plain shadcn files.
// Files we've changed on purpose are listed in docs/toolkit-changes.md and reported as such.
//
// Run: node scripts/check-components.mjs        (needs internet; development only)
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const uiDir = path.join(root, "src", "components", "ui")
const changesDoc = path.join(root, "docs", "toolkit-changes.md")
const registry = (name) => `https://neobrutalism.com/r/base/${name}.json`

// The installer rewrites files in small, harmless ways as it installs them: it drops
// the "use client" line (not needed outside Next.js), turns `cn-font-heading` into `font-heading`, drops
// other `cn-…` placeholder classes our style doesn't define, and reflows lines. Undo those before comparing,
// so only real differences (e.g. a plain shadcn file swapped in) are reported.
const normalise = (text) =>
  text
    .replace(/^\s*["']use client["'];?/, "")
    .replace(/cn-font-heading/g, "font-heading")
    .replace(/\bcn-[a-z][\w-]*/g, "")
    .replace(/\s*className=["']\s*["']/g, "")
    .replace(/\s+/g, "")
    .replace(/,(?=[)\]}])/g, "")
const changedOnPurpose = fs.existsSync(changesDoc)
  ? new Set([...fs.readFileSync(changesDoc, "utf8").matchAll(/`src\/components\/ui\/([\w-]+\.tsx)`/g)].map((m) => m[1]))
  : new Set()

const files = fs.readdirSync(uiDir).filter((f) => f.endsWith(".tsx")).sort()
let problems = 0

for (const file of files) {
  const name = file.replace(/\.tsx$/, "")
  const local = normalise(fs.readFileSync(path.join(uiDir, file), "utf8"))
  let status
  try {
    const res = await fetch(registry(name))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const item = await res.json()
    const entry = item.files.find((f) => (f.target ?? f.path).endsWith(`ui/${file}`) || f.path === file)
    if (!entry) status = "NOT IN REGISTRY ENTRY"
    else if (normalise(entry.content) === local) status = "ok"
    else status = changedOnPurpose.has(file) ? "changed on purpose (docs/toolkit-changes.md)" : "DIFFERS"
  } catch (err) {
    status = `NOT ON NEOBRUTALISM.COM (${err.message})`
  }
  if (status !== "ok" && !status.startsWith("changed on purpose")) problems++
  const mark = status === "ok" ? "  " : status.startsWith("changed on purpose") ? "~ " : "! "
  console.log(`${mark}${file.padEnd(22)} ${status}`)
}

console.log(`\n${files.length} files checked, ${problems} problem(s).`)
process.exitCode = problems ? 1 : 0
