// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { DATA, DEFAULT, button, click, nextPoll, page, renderAt, server, summary, text, type, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

describe("first run", () => {
  it("sends any address to the first-run screen while there's no index", async () => {
    await renderAt("/somewhere")
    expect(window.location.pathname).toBe("/setup")
    expect(text()).toContain("Welcome. First, where's your API catalog?")
  })

  it("finds the zips in the app's catalog-zips folder and reads them", async () => {
    await renderAt("/")
    expect(text()).toContain("In the app's catalog-zips folder")
    expect(text()).toContain(DEFAULT)
    expect(text()).toContain("Found 20 families in 5 zips")
    await click("Read my catalog")
    expect(server.started).toEqual([DEFAULT])
    expect(text()).toContain("Opening the zips")
  })

  it("links to Ellucian's download page, in a new tab", async () => {
    await renderAt("/")
    const link = [...page().querySelectorAll("a")].find((a) => a.textContent === "Download the zips from Ellucian")
    expect(link?.getAttribute("href")).toBe(
      "https://resources.elluciancloud.com/r/bundle/dev_res_ref_api_catalog/page/c_download_view_api_catalog.html",
    )
    expect(link?.getAttribute("target")).toBe("_blank")
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer")
    expect(text()).toContain("(you'll need your Ellucian login)")
  })

  it("says where to put the zips when the app's folder has none", async () => {
    server.checks = {}
    await renderAt("/")
    expect(text()).toContain(`Put the five zips you downloaded from Ellucian into ${DEFAULT}, as they are`)
    expect(button("Check again")).not.toBeNull()
  })

  it("says what's wrong with a pasted folder and doesn't read it, then reads a good one", async () => {
    server.checks["D:\\Old\\APICatalog"] = { kind: "unzipped", path: "D:\\Old\\APICatalog" }
    server.checks["D:\\Downloads"] = { kind: "ok", path: "D:\\Downloads", families: 20, zips: 5, others: 2 }
    await renderAt("/")
    await type("D:\\Old\\APICatalog")
    await click("Read my catalog")
    expect(text()).toContain("This looks like a catalog that was unzipped")
    expect(server.started).toEqual([])
    await type("D:\\Downloads")
    await click("Read my catalog")
    expect(server.started).toEqual(["D:\\Downloads"])
  })

  it("shows progress and the time left, then the summary, then the landing page", async () => {
    server.status.run = { catalog: DEFAULT, stage: "reading", done: 1000, total: 4000, readingSeconds: 10 }
    await renderAt("/")
    expect(text()).toContain("Reading spec files")
    expect(text()).toContain("1,000 of 4,000")
    expect(text()).toContain("About 30 seconds left")

    server.status = { ...server.status, run: null, index: { state: "ready", summary }, last: { outcome: "done", summary } }
    await nextPoll()
    expect(text()).toContain("Your catalog is ready")
    expect(text()).toContain("16 APIs (19 versions) in 4 families, read in 31 seconds.")
    expect(text()).toContain("BannerWidgetAPIs")
    expect(text()).toContain("ColleagueWidgetAPIs")
    // Grouped by product; under "Other products" by folder name only.
    expect([...page().querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Banner", "Colleague", "Other products"])
    expect(text()).toContain("SprocketAPIs")
    expect(text()).not.toContain("Sprocket Suite")
    expect(text()).toContain("1 file couldn't be read")
    expect(text()).toContain("Details: files that needed care (1)")
    expect(text()).toContain(DATA)

    await click("Start browsing")
    expect(window.location.pathname).toBe("/")
    expect(text()).toContain("The tables behind Ellucian's APIs")
  })

  it("stops when asked, after confirming", async () => {
    server.status.run = { catalog: DEFAULT, stage: "reading", done: 10, total: 4000, readingSeconds: 1 }
    await renderAt("/")
    await click("Stop")
    expect(text()).toContain("Stop reading?")
    expect(server.stopped).toBe(0)
    await click("Stop") // the one in the "Stop reading?" box
    expect(server.stopped).toBe(1)
    expect(text()).toContain("Reading stopped. Nothing was changed")
  })

  it("says plainly when reading failed, and lets you try again", async () => {
    server.status.run = { catalog: DEFAULT, stage: "reading", done: 10, total: 4000, readingSeconds: 1 }
    await renderAt("/")
    server.status = { ...server.status, run: null, last: { outcome: "failed", message: "The folder vanished" } }
    await nextPoll()
    expect(text()).toContain("Reading didn't finish")
    expect(text()).toContain("The folder vanished")
    await click("Try again")
    expect(text()).toContain("where's your API catalog?")
  })

  it("explains when an older index needs re-reading, with the last folder filled in", async () => {
    server.status.index = { state: "outdated" }
    server.status.catalog.chosen = "D:\\Catalogs\\APICatalog"
    await renderAt("/")
    expect(text()).toContain("Lineage Finder has been updated and needs to re-read your catalog")
    expect(page().querySelector<HTMLInputElement>('input[aria-label="Catalog folder"]')?.value).toBe("D:\\Catalogs\\APICatalog")
  })

  it("says so when the app can't be reached", async () => {
    server.down = true
    await renderAt("/")
    expect(text()).toContain("Can't reach Lineage Finder")
  })
})

describe("with an index", () => {
  beforeEach(() => {
    server.status.index = { state: "ready", summary }
  })

  it("has the header with the app's name alone", async () => {
    await renderAt("/")
    expect(page().querySelector("header")?.textContent).toContain("Lineage Finder")
    // No logo for now: the name alone.
    expect(page().querySelector("header")?.textContent).not.toContain("🍄")
  })

  it("leaves the first-run screen for the landing page", async () => {
    await renderAt("/setup")
    expect(window.location.pathname).toBe("/")
  })

  it("shows 'page not found' for an unknown address", async () => {
    await renderAt("/no-such-page")
    expect(text()).toContain("Page not found")
  })

  it("switches to dark mode from the header button", async () => {
    await renderAt("/")
    await click("Switch to dark mode")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(button("Switch to light mode")).not.toBeNull()
  })
})
