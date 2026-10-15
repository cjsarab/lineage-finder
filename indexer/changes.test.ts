// "What changed" at the end of a re-index, on copies of the made-up catalog.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Compared } from "./changes.ts"
import { indexDir, readCatalogFiles, readChanges, readIndex, runIndex, type RunOptions } from "./run-index.ts"
import { testCatalog, zipCatalog, zippedTestCatalog } from "./test-support/zip-catalog.ts"

describe("what changed since the last read", () => {
  // The tests edit a plain copy of the made-up catalog; each read zips it afresh into the catalog folder.
  let work: string, copy: string, catalog: string, dataDir: string
  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-changes-"))
    copy = path.join(work, "copy")
    catalog = path.join(work, "catalog")
    dataDir = path.join(work, "data")
    fs.cpSync(testCatalog, copy, { recursive: true })
  })
  afterEach(() => fs.rmSync(work, { recursive: true, force: true }))

  const read = (options: Partial<RunOptions> = {}) => {
    fs.rmSync(catalog, { recursive: true, force: true })
    const families = fs.readdirSync(copy, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    zipCatalog(catalog, { "production_API_catalog.zip": { families, under: "production_API_catalog" } }, copy)
    return runIndex({ catalog, dataDir, threads: 1, ...options })
  }
  const at = (...parts: string[]) => path.join(copy, ...parts)
  const edit = (file: string, from: string, to: string) => {
    const text = fs.readFileSync(at(file), "utf8")
    if (!text.includes(from)) throw new Error(`not in ${file}: ${from}`)
    fs.writeFileSync(at(file), text.replace(from, to))
  }
  const compared = () => {
    const c = readChanges(dataDir)?.changes
    if (c?.outcome !== "compared") throw new Error(`not compared: ${c?.outcome}`)
    return c as Compared
  }

  it("has nothing to compare on a first read, and saves the catalog's file list", async () => {
    await read()
    expect(readChanges(dataDir)).toBeNull()
    expect(Object.keys(readCatalogFiles(dataDir) ?? {})).toContain("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml")
  })

  it("finds no changes when the same catalog is read again", async () => {
    await read()
    const first = readIndex(dataDir)!.info
    await read()
    expect(compared()).toEqual({
      outcome: "compared",
      lastRead: { builtAt: first.builtAt, catalog: first.catalog },
      families: { added: [], removed: [] },
      apis: { added: [], removed: [] },
      versions: { added: [], removed: [] },
      changed: [],
    })
    expect(readChanges(dataDir)?.was).toEqual({})
  })

  it("finds each kind of change, and nothing else", async () => {
    await read()
    fs.rmSync(at("ColleagueBusAPIs"), { recursive: true })
    fs.cpSync(at("ColleagueWidgetAPIs"), at("ExtraWidgetAPIs"), { recursive: true })
    fs.rmSync(at("BannerWidgetAPIs", "pulleys-1.0.0"), { recursive: true })
    fs.rmSync(at("BannerWidgetAPIs", "levers-1.1.0"), { recursive: true })
    fs.cpSync(at("BannerWidgetAPIs", "levers-1.0.0"), at("BannerWidgetAPIs", "levers-3.0.0"), { recursive: true })
    fs.cpSync(at("BannerWidgetAPIs", "cogs-1.0.0"), at("BannerWidgetAPIs", "spindles-1.0.0"), { recursive: true })
    edit("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml", "- name: criteria", "- name: filter")
    edit("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml", "x-release-status: ga", "x-release-status: beta")
    // A change only to a description isn't counted as a change: descriptions are left out on purpose.
    edit("BannerWidgetAPIs/sprockets-1.0.0/sprockets.yaml", "Also holds made-up lineage", "Also holds some made-up lineage")
    await read()

    const c = compared()
    expect(c.families).toEqual({ added: [{ name: "ExtraWidgetAPIs", apis: ["widgets"] }], removed: [{ name: "ColleagueBusAPIs", apis: ["intake"] }] })
    expect(c.apis).toEqual({ added: [{ family: "BannerWidgetAPIs", name: "spindles" }], removed: [{ family: "BannerWidgetAPIs", name: "pulleys" }] })
    expect(c.versions).toEqual({
      added: [{ family: "BannerWidgetAPIs", name: "levers", version: "3.0.0" }],
      removed: [{ family: "BannerWidgetAPIs", name: "levers", version: "1.1.0" }],
    })
    expect(c.changed).toEqual([
      {
        family: "BannerWidgetAPIs",
        name: "widgets",
        version: "1.2.0",
        folder: "widgets-1.2.0",
        counts: { details: 1, parameters: 2, headers: false, fields: 0, lineage: 0 },
      },
    ])
    // The changed version as it was, for its changes page.
    const was = readChanges(dataDir)?.was["BannerWidgetAPIs/widgets"]?.["widgets-1.2.0"]
    expect(was?.version.details?.releaseStatus).toBe("ga")
    expect(was?.parameters.flatMap((m) => m.parameters.map((p) => p.name))).toContain("criteria")
  })

  it("says it's a different catalog when another folder is read", async () => {
    await read()
    const other = zippedTestCatalog()
    try {
      await runIndex({ catalog: other, dataDir, threads: 1 })
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
    expect(readChanges(dataDir)?.changes).toMatchObject({ outcome: "different-catalog", lastRead: { catalog } })
  })

  it("can't compare with an index in an older format", async () => {
    await read()
    const infoFile = path.join(indexDir(dataDir), "index-info.json")
    fs.writeFileSync(infoFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(infoFile, "utf8")), format: 1 }))
    await read()
    expect(readChanges(dataDir)?.changes).toEqual({ outcome: "not-comparable" })
  })

  it("keeps the new index when comparing fails", async () => {
    await read()
    fs.writeFileSync(path.join(indexDir(dataDir), "fields.json"), "not json")
    await read()
    expect(readChanges(dataDir)?.changes).toMatchObject({ outcome: "failed" })
    expect(readIndex(dataDir)).not.toBeNull()
  })

  it("says it's comparing, between reading and writing, when there's a last read", async () => {
    await read()
    const stages: string[] = []
    await read({ onStage: (s) => stages.push(s) })
    expect(stages).toEqual(["finding", "reading", "comparing", "writing"])
  })
})

describe("the comparing rules", () => {
  it("have no Node-only imports, as the page uses them too", () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, "compare.ts"), "utf8")
    const imports = [...text.matchAll(/^import (type )?.* from "(.*)"/gm)]
    expect(imports.filter((m) => !m[1]).map((m) => m[2])).toEqual([])
  })
})
