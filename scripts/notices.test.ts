import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { noticesFor, thirdPartyNotices } from "./notices.ts"
import { NOTICES_FILE, PAGE_PACKAGES, RUNTIME_PACKAGES, runtimePackageDirs } from "./release.ts"

const root = path.resolve(import.meta.dirname, "..")
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")).packages

describe("the notices in the repo", () => {
  it("are up to date with the packages (if not: npm run notices, then commit the file)", () => {
    const inRepo = fs.readFileSync(path.join(root, NOTICES_FILE), "utf8").replace(/\r\n/g, "\n")
    expect(inRepo === thirdPartyNotices(root, lock), `${NOTICES_FILE} is out of date: run npm run notices`).toBe(true)
  })

  it("name every package the page and the release ship with, and the toolkit", () => {
    const text = thirdPartyNotices(root, lock)
    for (const dir of [...runtimePackageDirs(lock, PAGE_PACKAGES), ...runtimePackageDirs(lock, RUNTIME_PACKAGES)]) {
      const { name, version } = JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8"))
      expect(text).toContain(`\n${name} ${version}\nLicence: `)
    }
    expect(text).toContain("Copyright (c) 2024 Arif Hossain")
    expect(text).toContain("Copyright (c) 2023 shadcn")
  })
})

describe("noticesFor", () => {
  const fake = (packages: Record<string, { pkg: object; files?: Record<string, string> }>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-notices-"))
    for (const [name, { pkg, files = {} }] of Object.entries(packages)) {
      fs.mkdirSync(path.join(dir, "node_modules", name), { recursive: true })
      fs.writeFileSync(path.join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, ...pkg }))
      for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, "node_modules", name, f), text)
    }
    return dir
  }

  it("copies each licence file word for word, A–Z, each name and version once", () => {
    const dir = fake({
      widgets: { pkg: { version: "2.0.0", license: "ISC" }, files: { "LICENSE.md": "ISC License\r\n\r\nCopyright (c) Widget Makers  \r\n" } },
      cogs: { pkg: { version: "1.0.0", license: "MIT" }, files: { license: "MIT License\n\nCopyright (c) Cog Co\n" } },
    })
    const text = noticesFor(dir, ["node_modules/widgets", "node_modules/cogs", "node_modules/widgets"])
    expect(text).toContain("The packages (2):\n  cogs 1.0.0     MIT\n  widgets 2.0.0  ISC\n")
    expect(text).toContain("cogs 1.0.0\nLicence: MIT\n" + "=".repeat(80) + "\n\nMIT License\n\nCopyright (c) Cog Co\n")
    expect(text).toContain("\nISC License\n\nCopyright (c) Widget Makers\n")
    expect(text.indexOf("\ncogs 1.0.0\n")).toBeLessThan(text.indexOf("\nwidgets 2.0.0\n"))
  })

  it("shows the version, so a changed package changes the notices", () => {
    const dir = fake({ cogs: { pkg: { version: "1.0.1", license: "MIT" }, files: { LICENSE: "MIT License\n" } } })
    expect(noticesFor(dir, ["node_modules/cogs"])).toContain("\ncogs 1.0.1\n")
  })

  it("writes the MIT text for a listed package without a licence file, and stops at one that isn't listed", () => {
    const dir = fake({ sirv: { pkg: { version: "3.0.2", license: "MIT" } }, sprockets: { pkg: { version: "1.0.0", license: "MIT" } } })
    expect(noticesFor(dir, ["node_modules/sirv"])).toContain("MIT License\n\nCopyright (c) Luke Edwards")
    expect(() => noticesFor(dir, ["node_modules/sprockets"])).toThrow(/sprockets 1\.0\.0 \(MIT\) has no licence file: .*NO_LICENCE_FILE/)
  })
})

describe("PAGE_PACKAGES", () => {
  const filesUnder = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesUnder(path.join(dir, d.name)) : [path.join(dir, d.name)]))
  const packageOf = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0])

  it("is every package the page imports, and no more", () => {
    const used = new Set<string>()
    for (const file of filesUnder(path.join(root, "src"))) {
      if (/\.test\.tsx?$/.test(file) || file.includes(`${path.sep}test-support${path.sep}`)) continue
      const text = fs.readFileSync(file, "utf8")
      const specs = /\.css$/.test(file)
        ? [...text.matchAll(/@import\s+["']([^"']+)["']/g)]
        : /\.tsx?$/.test(file)
          ? [
              ...text.matchAll(/^\s*(?:import|export)\s[^"'`;]*?\bfrom\s*["']([^"']+)["']/gm), // import … from "x"
              ...text.matchAll(/^\s*import\s*["']([^"']+)["']/gm), // import "x"
              ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g), // import("x")
            ]
          : []
      for (const [, spec] of specs) if (!/^(\.|@\/|node:)/.test(spec)) used.add(packageOf(spec))
    }
    expect([...used].sort()).toEqual([...PAGE_PACKAGES].sort())
  })
})
