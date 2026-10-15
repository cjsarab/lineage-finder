import { describe, expect, it } from "vitest"
import { fakeApi, fakeApis, summary } from "@/test-support/fake-app"
import {
  NOT_STATED,
  applyFilters,
  domainsOf,
  optionCounts,
  pageNumbers,
  pageRows,
  readFilters,
  tidyDomains,
  toListApis,
  writeFilters,
  type Filters,
} from "./api-list"

const list = toListApis(fakeApis, summary.families)
const none: Filters = { families: [], domains: [], statuses: [], lineage: [], name: "", page: 1 }
const names = (apis: { id: string }[]) => apis.map((a) => a.id)

describe("the rows", () => {
  it("puts families in the Settings order, then A–Z by name", () => {
    expect([...new Set(list.map((a) => a.family))]).toEqual(["BannerWidgetAPIs", "BannerGadgetAPIs", "ColleagueWidgetAPIs", "SprocketAPIs"])
    const banner = list.filter((a) => a.family === "BannerWidgetAPIs").map((a) => a.name)
    expect(banner).toEqual([...banner].sort())
  })

  it("takes the version, status and labels from the newest version", () => {
    const totals = list.find((a) => a.id === "BannerWidgetAPIs/widget-totals")!
    expect(totals).toMatchObject({ version: "3.0.0", versions: 3, status: "beta", deprecated: false, domain: "Finance" })
    expect(list.find((a) => a.name === "widget-summaries")).toMatchObject({ status: "released", deprecated: true })
    expect(list.find((a) => a.name === "widgets")).toMatchObject({ status: "not-stated", domain: NOT_STATED })
  })

  it("tidies domains: one spelling each; codes and gaps are 'Not stated'", () => {
    const tidy = tidyDomains(["Student", "Student", "student", "PDRXXXX", null, "Finance"])
    expect(tidy("student")).toBe("Student")
    expect(tidy("PDRXXXX")).toBe(NOT_STATED)
    expect(tidy(null)).toBe(NOT_STATED)
    expect(domainsOf(list)).toEqual(["Finance", "Financial Aid", "Foundation", "Human Resources", "Student", NOT_STATED])
  })
})

describe("filters", () => {
  it("means either within a filter, and both across filters", () => {
    expect(applyFilters(list, { ...none, domains: ["Finance", "Financial Aid"] })).toHaveLength(4)
    expect(names(applyFilters(list, { ...none, domains: ["Finance"], statuses: ["beta"] }))).toEqual(["BannerWidgetAPIs/widget-totals"])
    expect(names(applyFilters(list, { ...none, statuses: ["deprecated"] }))).toEqual(["BannerWidgetAPIs/widget-summaries"])
  })

  it("matches names as search does: capitals, separators, every word in any order, or run together", () => {
    const requests = ["BannerWidgetAPIs/widget-request-holds", "BannerWidgetAPIs/widget-requests", "ColleagueWidgetAPIs/widget-requests"]
    expect(names(applyFilters(list, { ...none, name: "Widget Req" }))).toEqual(requests)
    expect(names(applyFilters(list, { ...none, name: "req widget" }))).toEqual(requests)
    expect(names(applyFilters(list, { ...none, name: "widgetreq" }))).toEqual(requests)
    expect(names(applyFilters(list, { ...none, name: "request_holds" }))).toEqual(["BannerWidgetAPIs/widget-request-holds"])
  })

  it("counts each option with the other filters as they are", () => {
    const counts = optionCounts(list, { ...none, domains: ["Finance"] })
    expect(counts.domain.get("Student")).toBe(6) // ticking Student too would add these
    expect(counts.status.get("beta")).toBe(1)
    expect(counts.status.get("deprecated")).toBe(1)
    expect(counts.family.get("BannerWidgetAPIs")).toBe(3)
    expect(counts.family.get("SprocketAPIs")).toBeUndefined()
  })

  it("lives in the address", () => {
    const f: Filters = { families: ["A", "B"], domains: ["Financial Aid"], statuses: ["beta"], lineage: ["none"], name: "widget", page: 3 }
    expect(readFilters(new URLSearchParams(writeFilters(f).toString()))).toEqual(f)
    expect(writeFilters(none).toString()).toBe("")
    expect(readFilters(new URLSearchParams("page=-2")).page).toBe(1)
  })
})

describe("pages", () => {
  const many = toListApis(
    Array.from({ length: 250 }, (_, i) => fakeApi(i < 150 ? "BannerWidgetAPIs" : "SprocketAPIs", `api-${String(i).padStart(3, "0")}`)),
    summary.families,
  )

  it("shows a page's worth, with a heading where each family starts", () => {
    const first = pageRows(many, 1, 100)
    expect(first.filter((r) => r.kind === "api")).toHaveLength(100)
    expect(first[0]).toEqual({ kind: "heading", family: "BannerWidgetAPIs", count: 150, continued: false })
  })

  it("repeats the heading at the top of a page that starts part-way through a family", () => {
    const second = pageRows(many, 2, 100)
    expect(second[0]).toEqual({ kind: "heading", family: "BannerWidgetAPIs", count: 150, continued: true })
    expect(second.find((r) => r.kind === "heading" && r.family === "SprocketAPIs")).toMatchObject({ continued: false, count: 100 })
    expect(pageRows(many, 3, 100).filter((r) => r.kind === "api")).toHaveLength(50)
  })

  it("offers the first, last and neighbouring pages", () => {
    expect(pageNumbers(1, 1)).toEqual([1])
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3])
    expect(pageNumbers(5, 37)).toEqual([1, "gap", 4, 5, 6, "gap", 37])
    expect(pageNumbers(3, 37)).toEqual([1, 2, 3, 4, "gap", 37])
  })
})
