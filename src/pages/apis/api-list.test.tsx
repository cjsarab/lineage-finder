// @vitest-environment jsdom
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import { PAGE_SIZE_KEY } from "@/lib/page-size"
import { button, click, fakeApi, fakeApis, follow, nextPoll, page, renderAt, server, settle, summary, text, typeInto, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

beforeEach(() => {
  server.status.index = { state: "ready", summary }
})

/** The API rows shown, as family/name. */
const rows = () => [...page().querySelectorAll<HTMLAnchorElement>('main ul a[href^="/apis/"]')].map((a) => decodeURIComponent(a.getAttribute("href")!.slice(6)))
const headings = () => [...page().querySelectorAll("main ul h2")].map((h) => h.textContent)
const search = () => new URLSearchParams(window.location.search)

/** Ticks the filter option whose label starts with `label` (labels end with the option's count). */
async function tick(label: string) {
  const l = [...document.querySelectorAll("aside label")].find((x) => x.firstElementChild?.textContent === label)
  const box = l?.getAttribute("for") ? document.getElementById(l.getAttribute("for")!) : null
  if (!box) throw new Error(`No "${label}" option. Page says: ${text()}`)
  await act(async () => box.click())
  await settle()
}
/** Follows the page link with this label (the pages are links, so Back and bookmarks work). */
async function goTo(label: string) {
  const a = document.querySelector<HTMLAnchorElement>(`a[aria-label="${label}"]`)
  if (!a) throw new Error(`No "${label}" link`)
  await act(async () => a.click())
  await settle()
}
const optionCount = (label: string) =>
  [...document.querySelectorAll("aside label")].find((x) => x.firstElementChild?.textContent === label)?.lastElementChild?.textContent

describe("the API list", () => {
  it("opens from the header and lists every API, grouped by family", async () => {
    await renderAt("/")
    await follow("APIs", "/apis")
    expect(window.location.pathname).toBe("/apis")
    expect(text()).toContain("16 APIs")
    expect(rows()).toHaveLength(16)
    expect(headings()).toEqual([
      "BannerWidgetAPIs · Banner",
      "BannerGadgetAPIs · Banner",
      "ColleagueWidgetAPIs · Colleague",
      "SprocketAPIs · Other products",
    ])
    // The same name in two families appears under both.
    expect(rows().filter((r) => r.endsWith("/widget-requests"))).toEqual(["BannerWidgetAPIs/widget-requests", "ColleagueWidgetAPIs/widget-requests"])
  })

  it("shows each API's labels, domain, newest version and number of versions", async () => {
    await renderAt("/apis")
    const row = (id: string) => page().querySelector(`a[href="/apis/${id}"]`)?.textContent
    expect(row("BannerWidgetAPIs/widget-totals")).toBe("widget-totalsbetaFinance·v3.0.0·3 versions")
    expect(row("BannerWidgetAPIs/widget-summaries")).toContain("deprecated")
    expect(row("BannerWidgetAPIs/widget-codes")).toContain("Student") // "student" in the catalog
  })

  it("filters by domain and status: either within a filter, both across them, with counts", async () => {
    await renderAt("/apis")
    expect(optionCount("Finance")).toBe("3")
    await tick("Finance")
    expect(rows()).toEqual(["BannerWidgetAPIs/widget-fees", "BannerWidgetAPIs/widget-summaries", "BannerWidgetAPIs/widget-totals"])
    expect(optionCount("Beta")).toBe("1")
    expect(optionCount("Student")).toBe("6") // what ticking Student as well would give

    await tick("Financial Aid")
    expect(rows()).toHaveLength(4)
    await tick("Beta")
    expect(rows()).toEqual(["BannerWidgetAPIs/widget-totals"])
    expect(search().getAll("domain")).toEqual(["Finance", "Financial Aid"])
    expect(search().getAll("status")).toEqual(["beta"])

    await click("Clear filters")
    expect(rows()).toHaveLength(16)
    expect(window.location.search).toBe("")
  })

  it("filters by lineage on the newest version, and says plainly when none is published", async () => {
    await renderAt("/apis")
    expect([optionCount("Full"), optionCount("Partial"), optionCount("None published")]).toEqual(["13", "1", "2"])
    const row = (id: string) => page().querySelector(`a[href="/apis/${id}"]`)?.textContent
    expect(row("BannerWidgetAPIs/widget-summaries")).toContain("no lineage published")
    expect(row("BannerWidgetAPIs/widget-fees")).not.toContain("no lineage published")
    await tick("None published")
    expect(rows()).toEqual(["BannerWidgetAPIs/widget-summaries", "SprocketAPIs/sprockets"])
    expect(search().getAll("lineage")).toEqual(["none"])
    await tick("Partial")
    expect(rows()).toHaveLength(3)
  })

  it("filters by family, a whole product at once", async () => {
    await renderAt("/apis")
    await tick("Banner")
    expect(rows()).toHaveLength(13)
    expect(search().getAll("family")).toEqual(["BannerWidgetAPIs", "BannerGadgetAPIs"])
  })

  it("narrows by name as you type, ignoring capitals and hyphens", async () => {
    await renderAt("/apis")
    await typeInto("Filter by API name", "Widget Req")
    expect(rows()).toEqual(["BannerWidgetAPIs/widget-request-holds", "BannerWidgetAPIs/widget-requests", "ColleagueWidgetAPIs/widget-requests"])
    expect(search().get("name")).toBe("Widget Req")
  })

  it("says so when nothing matches", async () => {
    await renderAt("/apis?name=nothing-like-this")
    expect(text()).toContain("No APIs match these filters.")
    await click("Clear filters")
    expect(rows()).toHaveLength(16)
  })

  it("opens a filtered list from its address, and says how many filters are set on the narrow-window button", async () => {
    await renderAt("/apis?domain=Foundation&status=released")
    expect(rows()).toEqual(["BannerWidgetAPIs/widget-people", "SprocketAPIs/sprocket-gears", "SprocketAPIs/sprockets"])
    expect(button("Filters (2)")).not.toBeNull()
  })
})

describe("families hidden in Settings", () => {
  it("leaves them out of the list and the filters, and says how many", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["ColleagueWidgetAPIs", "SprocketAPIs"]))
    await renderAt("/apis")
    expect(rows()).toHaveLength(13)
    expect(text()).toContain("2 families hidden in Settings")
    expect(document.querySelector("aside")?.textContent).not.toContain("Colleague")
    await click("2 families hidden in Settings")
    // Settings opens at Families shown, with its list of families already open.
    expect(text()).toContain("Families shown")
    expect(button("Done")).not.toBeNull()
    expect(text()).toContain("Colleague (1 family)")
  })

  it("says when a bookmarked list asks for a hidden family, and can show it", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    await renderAt("/apis?family=SprocketAPIs")
    expect(text()).toContain("This list asks for a family that is hidden in Settings: SprocketAPIs.")
    await click("Show it")
    expect(rows()).toEqual(["SprocketAPIs/sprocket-gears", "SprocketAPIs/sprockets"])
  })

  it("says when every family is hidden", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(summary.families.map((f) => f.name)))
    await renderAt("/apis")
    expect(text()).toContain("Every family is hidden in Settings.")
    await click("Show all")
    expect(rows()).toHaveLength(16)
  })
})

describe("pages", () => {
  beforeEach(() => {
    server.apis = Array.from({ length: 250 }, (_, i) => fakeApi(i < 150 ? "BannerWidgetAPIs" : "SprocketAPIs", `api-${String(i).padStart(3, "0")}`))
  })

  it("shows 20 to a page to begin with, and says where you are", async () => {
    await renderAt("/apis")
    expect(rows()).toHaveLength(20)
    expect(text()).toContain("1–20 of 250 APIs")
    await goTo("Go to next page")
    expect(search().get("page")).toBe("2")
    expect(text()).toContain("21–40 of 250 APIs")
    expect(headings()[0]).toBe("BannerWidgetAPIs · Banner, continued")
    await goTo("Page 13")
    expect(rows()).toHaveLength(10)
  })

  it("can turn the page from the top of the list, without scrolling to the bottom", async () => {
    await renderAt("/apis")
    expect(document.querySelector('nav[aria-label="Turn the page"]')?.textContent).toBe("1 of 13")
    await goTo("Next page")
    expect(text()).toContain("21–40 of 250 APIs")
    expect(document.querySelector('nav[aria-label="Turn the page"]')?.textContent).toBe("2 of 13")
    await goTo("Previous page")
    expect(text()).toContain("1–20 of 250 APIs")
  })

  it("shows 20, 50 or 100 to a page, remembered in this browser, keeping your place", async () => {
    await renderAt("/apis?page=3") // APIs 41–60
    await click("APIs per page")
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === "50")!.click())
    await settle()
    expect(localStorage.getItem(PAGE_SIZE_KEY)).toBe("50")
    expect(text()).toContain("1–50 of 250 APIs") // API 41 is on page 1 of 50
    expect(search().get("page")).toBeNull()
  })

  it("starts at the remembered page size", async () => {
    localStorage.setItem(PAGE_SIZE_KEY, "100")
    await renderAt("/apis?page=2")
    expect(rows()).toHaveLength(100)
    expect(text()).toContain("101–200 of 250 APIs")
  })

  it("goes back to page 1 when a filter changes", async () => {
    await renderAt("/apis?page=2")
    // Run together: as in search, "api-1" would be the two words "api" and "1".
    await typeInto("Filter by API name", "api1")
    expect(search().get("page")).toBeNull()
    expect(text()).toContain("1–20 of 100 APIs") // api-100 … api-199
  })
})

describe("an API's address", () => {
  it("opens the API's page, and Back returns to the list as it was", async () => {
    await renderAt("/apis?domain=Finance")
    await follow("widget-totals")
    expect(window.location.pathname).toBe("/apis/BannerWidgetAPIs/widget-totals")
    expect(text()).toContain("BannerWidgetAPIs · Banner")
    expect(text()).toContain("Fields and lineage")
    await click("Back to the list")
    await settle()
    expect(window.location.pathname).toBe("/apis")
    expect(search().getAll("domain")).toEqual(["Finance"])
    expect(rows()).toHaveLength(3)
  })

  it("says when there's no such API", async () => {
    await renderAt("/apis/BannerWidgetAPIs/no-such-api")
    expect(text()).toContain("No API by that name in your catalog.")
  })

  it("says when its family is hidden in Settings", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    await renderAt("/apis/SprocketAPIs/sprockets")
    expect(text()).toContain("This API's family (SprocketAPIs) is hidden in Settings.")
    await click("Show it")
    expect(text()).toContain("SprocketAPIs · Other products")
  })
})

describe("the landing page and re-indexing", () => {
  it("has a link into the list", async () => {
    await renderAt("/")
    await follow("Browse all 16 APIs")
    expect(window.location.pathname).toBe("/apis")
  })

  it("loads the new list when a re-index finishes", async () => {
    server.status.run = { catalog: summary.catalog, stage: "reading", done: 10, total: 4000, readingSeconds: 1 }
    await renderAt("/apis")
    expect(rows()).toHaveLength(16)

    server.apis = [...fakeApis, fakeApi("SprocketAPIs", "sprocket-chains")]
    server.status = { ...server.status, run: null, index: { state: "ready", summary: { ...summary, builtAt: "2026-10-09T09:00:00.000Z" } } }
    await nextPoll()
    await settle()
    expect(rows()).toContain("SprocketAPIs/sprocket-chains")
  })
})
