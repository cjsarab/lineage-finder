// @vitest-environment jsdom
// The landing page. Made-up APIs, tables and forms only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import { FAVOURITES_KEY, RECENT_KEY, type Favourite, type Recent } from "@/lib/favourites"
import type { Changes, FormSummary, TableSummary } from "@/lib/server"
import { DATA, DEFAULT, button, click, follow, page, renderAt, server, summary, text, typeInto, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const TABLES: TableSummary[] = [
  { product: "Banner", name: "GWBWIDG", apis: ["BannerWidgetAPIs/widgets"], cols: [[0]] },
  { product: "Banner", name: "SWBWIDG", apis: ["BannerGadgetAPIs/gadgets", "BannerWidgetAPIs/widgets"], cols: [[0], [0, 1], [1]] },
  { product: "Colleague", name: "WIDGETS", apis: ["ColleagueWidgetAPIs/widget-requests"], cols: [[0]] },
]

const FORMS: FormSummary[] = [
  { product: "Banner", code: "SWAWIDG", title: "Widget Maintenance", apis: ["BannerWidgetAPIs/widget-requests"] },
  { product: "Banner", code: "SWVWTYP", title: "Widget Type Validation", apis: ["BannerGadgetAPIs/gadgets"], table: true },
]

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.tables = TABLES
  server.forms = FORMS
})

const api = (name: string, version = "1.0.0", family = "BannerWidgetAPIs"): Favourite => ({ kind: "api", family, name, version, newest: version })
const saveFavourites = (list: Favourite[]) => localStorage.setItem(FAVOURITES_KEY, JSON.stringify(list))
const saveRecent = (list: Recent[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(list))
/** A card's text, by its title. */
const card = (title: string) =>
  [...page().querySelectorAll('[data-slot="card"]')].find((c) => c.querySelector("h2")?.textContent === title)?.textContent ?? ""
const href = (label: string) => [...page().querySelectorAll("a")].find((a) => a.textContent?.trim() === label)?.getAttribute("href")

describe("what the app is", () => {
  it("says what it does, with the legal note, and leaves the folders to Settings", async () => {
    await renderAt("/")
    expect(page().querySelector("h1")?.textContent).toBe("The tables behind Ellucian's APIs")
    expect(text()).toContain("This app reads the API catalog you downloaded from Ellucian")
    expect(text()).toContain("Nothing leaves your computer.")
    expect(text()).toContain("Unofficial: not affiliated with or endorsed by Ellucian.")
    // The paths stay in Settings.
    expect(page().textContent).not.toContain(DATA)
    expect(page().textContent).not.toContain(DEFAULT)
  })
})

describe("search", () => {
  const search = () => page().querySelector<HTMLInputElement>('input[aria-label="Search the catalog"]')!

  it("opens the Search page with the words", async () => {
    await renderAt("/")
    await typeInto("Search the catalog", " widget code ")
    await click("Search")
    expect(window.location.pathname + window.location.search).toBe("/search?q=widget+code")
  })

  it("opens Search as it is with an empty box", async () => {
    await renderAt("/")
    await act(async () => search().form!.requestSubmit())
    expect(window.location.pathname + window.location.search).toBe("/search")
  })

  it("doesn't take the keyboard's focus when the page opens", async () => {
    await renderAt("/")
    expect(document.activeElement).not.toBe(search())
  })
})

describe("the ways in", () => {
  it("counts APIs, tables and forms, with the top 3 of each breakdown linked to its list", async () => {
    await renderAt("/")
    expect(card("APIs")).toContain("16")
    expect(card("APIs")).toContain("19 versions")
    expect(card("APIs")).toContain("By productBanner 13Other products 2Colleague 1")
    // The one-family products by folder name only.
    expect(card("APIs")).not.toContain("Sprocket Suite")
    expect(card("APIs")).toContain("By familyBannerWidgetAPIs 12SprocketAPIs 2BannerGadgetAPIs 1and 1 more")
    expect(card("APIs")).toContain("By domainStudent 6Finance 3Foundation 3and 3 more")
    expect(href("Browse all 16 APIs")).toBe("/apis")
    expect(href("BannerGadgetAPIs 1")).toBe("/apis?family=BannerGadgetAPIs")
    expect(href("Banner 13")).toBe("/apis?family=BannerWidgetAPIs&family=BannerGadgetAPIs")

    expect(card("Tables")).toContain("5 columns")
    expect(card("Tables")).toContain("By productBanner 2Colleague 1")
    expect(card("Tables")).toContain("Banner, by moduleGeneral (G) 1Student (S) 1")
    expect(href("Student (S) 1")).toBe("/tables?product=Banner&module=S")
    // No total on the tables and forms links: their lists show one product at a time.
    expect(href("Browse all tables")).toBe("/tables")

    expect(card("Forms")).toContain("1 also a table")
    expect(card("Forms")).toContain("Banner, by moduleStudent (S) 2")
    expect(href("Browse all forms")).toBe("/forms")
    // No "Banner" in the cards' words: other products have APIs, tables and forms too.
    expect(card("Forms")).toContain("The pages (forms) the APIs work through")
  })

  it("opens a list already filtered from a badge", async () => {
    await renderAt("/")
    await follow("Student (S) 1")
    expect(window.location.pathname + window.location.search).toBe("/tables?product=Banner&module=S")
    expect(text()).toContain("SWBWIDG")
    expect(text()).not.toContain("GWBWIDG")
  })

  it("leaves hidden families out of the counts", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerWidgetAPIs"]))
    await renderAt("/")
    expect(href("Browse all 4 APIs")).toBe("/apis")
    expect(card("Tables")).toContain("By productBanner 1Colleague 1")
    expect(card("Forms")).toContain("By productBanner 1")
  })

  it("says so when a list can't be loaded, with Try again", async () => {
    server.failing = ["/api/tables"]
    await renderAt("/")
    expect(card("Tables")).toContain("Couldn't load the tables.")
    expect(card("APIs")).toContain("Browse all 16 APIs")
    server.failing = []
    await click("Try again")
    expect(card("Tables")).toContain("By productBanner 2Colleague 1")
  })
})

describe("Your catalog", () => {
  const compared = (o: Partial<Extract<Changes, { outcome: "compared" }>> = {}): Changes => ({
    outcome: "compared",
    lastRead: { builtAt: "2026-10-07T09:49:00.000Z", catalog: DEFAULT },
    families: { added: [], removed: [] },
    apis: { added: [], removed: [] },
    versions: { added: [], removed: [] },
    changed: [],
    ...o,
  })

  it("says what was read and when, with the summary of the last read one click away", async () => {
    await renderAt("/")
    expect(card("Your catalog")).toContain("16 APIs (19 versions) in 4 families, read 8 Oct 2026")
    expect(card("Your catalog")).not.toContain("hidden in Settings")
    await follow("See the summary of the last read")
    expect(window.location.pathname).toBe("/summary")
  })

  it("gives what changed since the read before, leaving hidden families out", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    server.changes = compared({
      versions: { added: [{ family: "BannerWidgetAPIs", name: "widget-requests", version: "2.1.0" }], removed: [] },
      apis: { added: [{ family: "SprocketAPIs", name: "sprocket-new" }], removed: [] },
    })
    await renderAt("/")
    expect(card("Your catalog")).toContain("Showing 3 of 4 families (1 hidden in Settings).")
    expect(card("Your catalog")).toContain("Since the read before: 1 new version. See the summary")
  })

  it("counts changes only in hidden families", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    server.changes = compared({ apis: { added: [{ family: "SprocketAPIs", name: "sprocket-new" }], removed: [] } })
    await renderAt("/")
    expect(card("Your catalog")).toContain("Since the read before: 1 change in hidden families. See the summary")
  })

  it("says when nothing changed", async () => {
    server.changes = compared()
    await renderAt("/")
    expect(card("Your catalog")).toContain("No changes since the read before. See the summary")
  })

  it("says when the catalog was a different one", async () => {
    server.changes = { outcome: "different-catalog", lastRead: { builtAt: "2026-10-07T09:49:00.000Z", catalog: "D:\\Old" } }
    await renderAt("/")
    expect(card("Your catalog")).toContain("A different catalog from the read before. See the summary")
  })

  it("with every family hidden, says so with Show all, and leaves out the ways in", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(summary.families.map((f) => f.name)))
    await renderAt("/")
    expect(card("Your catalog")).toContain("Every family is hidden in Settings.")
    expect(card("APIs")).toBe("")
    await click("Show all")
    expect(card("APIs")).toContain("Browse all 16 APIs")
  })

  it("has the 'has changed' notice above the cards", async () => {
    server.status.catalogCheck = { state: "changed", fingerprint: "aaaa" }
    await renderAt("/")
    const notice = [...page().querySelectorAll('[data-slot="alert"]')].find((a) => a.textContent?.includes("has changed since"))
    expect(notice).toBeDefined()
    expect(notice!.compareDocumentPosition(page().querySelector('[data-slot="card"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("Favourites and Recently viewed", () => {
  it("say so when empty, as the panel does", async () => {
    await renderAt("/")
    expect(card("Favourites")).toContain("Nothing here yet. Use")
    expect(card("Favourites")).toContain("on an API, table, column or form page.")
    expect(card("Recently viewed")).toContain("Nothing yet.")
  })

  it("show up to 5 favourites in the panel's order, with what each is, and the rest in the panel", async () => {
    saveFavourites([
      { kind: "table", product: "Banner", name: "SWBWIDG" },
      api("widget-totals", "3.0.0"),
      api("widget-codes"),
      api("widget-fees"),
      api("gadgets", "1.0.0", "BannerGadgetAPIs"),
      api("widget-grants"),
      api("widget-staff"),
    ])
    await renderAt("/")
    const rows = [...page().querySelectorAll('[data-slot="card"] li')].slice(0, 5).map((li) => li.textContent)
    // APIs A–Z first; the table is the sixth, so it's in the panel only.
    expect(rows).toEqual([
      "gadgets1.0.0BannerGadgetAPIsAPI",
      "widget-codes1.0.0BannerWidgetAPIsAPI",
      "widget-fees1.0.0BannerWidgetAPIsAPI",
      "widget-grants1.0.0BannerWidgetAPIsAPI",
      "widget-staff1.0.0BannerWidgetAPIsAPI",
    ])
    expect(href("widget-codes")).toBe("/apis/BannerWidgetAPIs/widget-codes")
    // No star or Remove here: those stay in the panel.
    expect(page().querySelector('[data-slot="card"] [aria-pressed]')).toBeNull()
    await click("and 2 more in Favourites")
    expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain("SWBWIDG")
  })

  it("say what's gone or hidden, as the panel does, without Remove", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    saveFavourites([api("widget-vanished"), api("sprockets", "1.0.0", "SprocketAPIs")])
    await renderAt("/")
    expect(card("Favourites")).toContain("No longer in your catalog")
    expect(card("Favourites")).toContain("Hidden in Settings")
    expect(button("Remove")).toBeNull()
    await click("Open Settings")
    expect(text()).toContain("Families shown")
  })

  it("show the 5 viewed most recently, leaving out what's gone, and the rest in the panel", async () => {
    saveRecent([
      ...["widget-codes", "widget-fees", "widget-vanished", "widget-grants", "widget-staff", "widget-people", "widget-terms"].map(
        (name): Recent => ({ kind: "api", family: "BannerWidgetAPIs", name, version: "1.0.0" }),
      ),
      { kind: "table", product: "Banner", name: "SWBWIDG", column: null },
    ])
    await renderAt("/")
    const rows = [...page().querySelectorAll('[data-slot="card"] li')].map((li) => li.textContent)
    expect(rows).toEqual([
      "widget-codes1.0.0API",
      "widget-fees1.0.0API",
      "widget-grants1.0.0API",
      "widget-staff1.0.0API",
      "widget-people1.0.0API",
    ])
    await click("and 2 more in the Favourites panel")
    expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain("widget-terms")
  })
})
