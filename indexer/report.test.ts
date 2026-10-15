import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { compareWithSurvey, formatCheck, formatShow, formatSummary, SURVEY_COUNTS } from "./report.ts"
import { readIndex, runIndex, type IndexFiles } from "./run-index.ts"
import { zippedTestCatalog } from "./test-support/zip-catalog.ts"

let index: IndexFiles

beforeAll(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-report-"))
  const catalog = zippedTestCatalog()
  await runIndex({ catalog, dataDir, threads: 1 })
  index = readIndex(dataDir)!
  return () => {
    fs.rmSync(dataDir, { recursive: true, force: true })
    fs.rmSync(catalog, { recursive: true, force: true })
  }
})

describe("formatSummary", () => {
  it("gives the totals and what needed care", () => {
    const text = formatSummary(index.info, 2_500_000)
    expect(text).toMatch(/21 spec files in 5 families/)
    expect(text).toMatch(/APIs\s+18/)
    expect(text).toMatch(/1 read by the second reader/)
    expect(text).toMatch(/1 version where the spec's number differs from its folder's/)
    expect(text).toMatch(/2\.5 MB/)
  })

  it("names each file that couldn't be read, with the reason", () => {
    const text = formatSummary(index.info, 1)
    expect(text).toMatch(/2 files couldn't be read/)
    expect(text).toContain("BannerWidgetAPIs/blanks-1.0.0/blanks.yaml: empty file")
    expect(text).not.toMatch(/Nothing was left out/)
  })

  it("says nothing was left out when every file was read", () => {
    const info = structuredClone(index.info)
    info.counts.unreadable = 0
    info.care.unreadable = []
    expect(formatSummary(info, 1)).toMatch(/Nothing was left out/)
  })
})

describe("compareWithSurvey", () => {
  it("finds no differences when the counts match the survey", () => {
    expect(compareWithSurvey({ ...index.info.counts, ...SURVEY_COUNTS })).toEqual([])
  })

  it("lists each count that differs", () => {
    const diffs = compareWithSurvey({ ...index.info.counts, ...SURVEY_COUNTS, secondReader: 17 })
    expect(diffs).toEqual([{ label: "read by the second reader", survey: 18, now: 17 }])
  })

  it("explains the result", () => {
    expect(formatCheck([])).toMatch(/All \d+ counts match the survey/)
    expect(formatCheck([{ label: "spec files", survey: 4378, now: 4379 }])).toMatch(/spec files: survey 4,378, now 4,379/)
  })
})

describe("formatShow", () => {
  it("prints every API with that name, in every family", () => {
    const text = formatShow(index.apis, "widgets")
    expect(text).toContain("BannerWidgetAPIs/widgets")
    expect(text).toContain("ColleagueWidgetAPIs/widgets")
  })

  it("prints each version's details and methods with permissions", () => {
    const text = formatShow(index.apis, "widgets")
    expect(text).toMatch(/1\.2\.0[\s\S]*1\.10\.0[\s\S]*2\.0\.0/)
    expect(text).toContain("SWAWIDG")
    expect(text).toMatch(/GET\s+\/api\/widgets\s+API_WIDGETS, API_WIDGETS_READ/)
  })

  it("marks beta, a version disagreement, a misplaced folder and an unreadable file", () => {
    expect(formatShow(index.apis, "sprockets")).toMatch(/beta/)
    expect(formatShow(index.apis, "levers")).toMatch(/1\.1\.0.*spec says 1\.0\.0/)
    expect(formatShow(index.apis, "springs")).toMatch(/inside hinges-1\.0\.0/)
    expect(formatShow(index.apis, "blanks")).toMatch(/couldn't be read: empty file/)
  })

  it("narrows to one family when given the full name", () => {
    const text = formatShow(index.apis, "ColleagueWidgetAPIs/widgets")
    expect(text).toMatch(/^ColleagueWidgetAPIs\/widgets {2}\(Colleague, 1 version\)/)
    expect(text).not.toContain("BannerWidgetAPIs/widgets")
  })

  it("keeps each detail on one line, even if the spec's text has line breaks", () => {
    const apis = structuredClone(index.apis)
    const v = apis.find((a) => a.id === "BannerWidgetAPIs/gizmos")!.versions[0]
    v.details!.title = "gizmos\nSecond line"
    expect(formatShow(apis, "gizmos")).toMatch(/Title\s+gizmos Second line\n/)
  })

  it("suggests close names when there's no exact match", () => {
    expect(formatShow(index.apis, "widget")).toMatch(/No API called "widget"\. Did you mean: widget-requests, widget-types, widget-summary, widgets/)
    expect(formatShow(index.apis, "zzz")).toMatch(/No API called "zzz"\.$/)
  })
})
