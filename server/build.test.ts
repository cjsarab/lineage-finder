import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { canBuild, hasBuiltPage, needsBuild } from "./build.ts"

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-build-"))
  fs.mkdirSync(path.join(root, "src", "pages"), { recursive: true })
  fs.writeFileSync(path.join(root, "src", "pages", "home.tsx"), "")
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function touch(file: string, secondsAgo: number) {
  const full = path.join(root, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  if (!fs.existsSync(full)) fs.writeFileSync(full, "")
  const when = new Date(Date.now() - secondsAgo * 1000)
  fs.utimesSync(full, when, when)
}

describe("needsBuild", () => {
  it("is true when there is no built page", () => {
    expect(needsBuild(root, path.join(root, "dist"))).toBe(true)
  })

  it("is false when the built page is newer than every source", () => {
    touch("src/pages/home.tsx", 60)
    touch("src/pages", 60)
    touch("src", 60)
    touch("dist/index.html", 0)
    expect(needsBuild(root, path.join(root, "dist"))).toBe(false)
  })

  it("is true when a source file deep in src changed after the build", () => {
    touch("src/pages", 60)
    touch("src", 60)
    touch("dist/index.html", 30)
    touch("src/pages/home.tsx", 0)
    expect(needsBuild(root, path.join(root, "dist"))).toBe(true)
  })

  it("is true when package.json changed after the build (e.g. after an update)", () => {
    touch("src/pages/home.tsx", 60)
    touch("src/pages", 60)
    touch("src", 60)
    touch("dist/index.html", 30)
    touch("package.json", 0)
    expect(needsBuild(root, path.join(root, "dist"))).toBe(true)
  })

  // A release zip: the built page without its source, where the build tools may be blocked.
  it("is false in a release, with no src, even when package.json looks newer than the page", () => {
    fs.rmSync(path.join(root, "src"), { recursive: true })
    touch("dist/index.html", 30)
    touch("package.json", 0)
    expect(canBuild(root)).toBe(false)
    expect(needsBuild(root, path.join(root, "dist"))).toBe(false)
  })

  it("is false in a release with no built page either (start says the page is missing instead)", () => {
    fs.rmSync(path.join(root, "src"), { recursive: true })
    expect(needsBuild(root, path.join(root, "dist"))).toBe(false)
    expect(hasBuiltPage(path.join(root, "dist"))).toBe(false)
  })
})
