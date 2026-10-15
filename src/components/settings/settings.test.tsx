// @vitest-environment jsdom
import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { ACCENT_KEY } from "@/lib/accents"
import { HIDDEN_KEY } from "@/lib/families"
import { THEME_KEY } from "@/lib/theme"
import { DATA, DEFAULT, button, choose, click, nextPoll, page, renderAt, server, settle, summary, text, type, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const html = document.documentElement
// The toolkit's radio buttons and tick boxes give the label's id to a hidden native input carrying the state.
const input = (label: string) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label)
  return (l?.htmlFor ? document.getElementById(l.htmlFor) : null) as HTMLInputElement | null
}
const checked = (label: string) => input(label)?.checked
const hidden = () => JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]")

describe("Settings with an index", () => {
  beforeEach(() => {
    server.status.index = { state: "ready", summary }
  })

  it("opens from the cog with every section, and closes", async () => {
    await renderAt("/")
    await click("Settings")
    for (const heading of ["Look", "Families shown", "Your catalog", "About"]) expect(text()).toContain(heading)
    expect(text()).toContain("Lineage Finder 0.1.0 · index v4")
    expect(text()).toContain("Unofficial: not affiliated with or endorsed by Ellucian.")
    expect(text()).toContain("Guide: HOW-TO-RUN.txt in the app folder")
    expect(text()).toContain("Licences: LICENSE and THIRD-PARTY-NOTICES.txt in the app folder")
    expect(text()).toContain(DATA)
    await click("Close")
    expect(text()).not.toContain("Families shown")
  })

  it("switches light and dark, back to following the computer, in step with the header button", async () => {
    await renderAt("/")
    await click("Settings")
    await choose("Dark")
    expect(html.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")
    expect(button("Switch to light mode")).not.toBeNull()

    await choose("Same as my computer")
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(html.classList.contains("dark")).toBe(false) // the pretend computer is set to light

    await click("Switch to dark mode") // the header button
    expect(checked("Dark")).toBe(true)
  })

  it("changes the accent and remembers it", async () => {
    await renderAt("/")
    await click("Settings")
    expect(checked("Amber")).toBe(true)
    await choose("Teal")
    expect(html.dataset.accent).toBe("teal")
    expect(localStorage.getItem(ACCENT_KEY)).toBe("teal")
    expect(checked("Teal")).toBe(true)
  })

  it("hides families by product, and the landing page says how many are shown", async () => {
    await renderAt("/")
    await click("Settings")
    expect(text()).toContain("4 of 4 shown")
    await click("Choose…")
    await click("Banner only")
    expect(hidden()).toEqual(["ColleagueWidgetAPIs", "SprocketAPIs"])
    expect(text()).toContain("2 of 4 shown")
    expect(text()).toContain("Showing 2 of 4 families (2 hidden in Settings).")

    // A whole product at once, and "some ticked" on the group when only part of it is shown.
    await choose("Banner (2 families)")
    expect(hidden()).toEqual(["BannerGadgetAPIs", "BannerWidgetAPIs", "ColleagueWidgetAPIs", "SprocketAPIs"])
    expect(text()).toContain("Every family is hidden in Settings.")
    await click("Show the Banner families")
    await choose("BannerWidgetAPIs12 APIs")
    expect(hidden()).toEqual(["BannerGadgetAPIs", "ColleagueWidgetAPIs", "SprocketAPIs"])
    expect(input("Banner (2 families)")?.indeterminate).toBe(true)

    await click("Show all")
    expect(hidden()).toEqual([])
  })

  it("lists the families under Other products by folder name only", async () => {
    await renderAt("/")
    await click("Settings")
    await click("Choose…")
    await click("Show the Other products families")
    expect(text()).toContain("Other products (1 family)")
    expect(text()).toContain("SprocketAPIs2 APIs")
    expect(text()).not.toContain("Sprocket Suite")
  })

  it("shows a family the browser hasn't seen before: it remembers what's hidden, not what's shown", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["ColleagueWidgetAPIs"]))
    await renderAt("/")
    expect(text()).toContain("Showing 3 of 4 families (1 hidden in Settings).")
  })

  it("re-indexes without leaving the page, shows progress in the header, and says when it's done", async () => {
    await renderAt("/")
    await click("Settings")
    await click("Re-index now")
    expect(server.started).toEqual([DEFAULT])
    expect(text()).toContain("Re-indexing")
    expect(text()).toContain("Opening the zips")
    expect(window.location.pathname).toBe("/")

    server.status = { ...server.status, run: { catalog: DEFAULT, stage: "reading", done: 2000, total: 4000, readingSeconds: 10 } }
    await nextPoll()
    await click("Close")
    expect(button("Re-indexing 50%")).not.toBeNull()
    expect(page().textContent).toContain("The tables behind Ellucian's APIs") // still browsing

    server.status = { ...server.status, run: null, last: { outcome: "done", summary } }
    await nextPoll()
    await settle() // the toast appears just after the status
    expect(text()).toContain("Re-index finished")
    expect(button("Re-indexing 50%")).toBeNull()
  })

  it("says so when a re-index is stopped", async () => {
    server.status.run = { catalog: DEFAULT, stage: "reading", done: 10, total: 4000, readingSeconds: 1 }
    await renderAt("/")
    await click("Re-indexing 0%")
    await click("Stop")
    await click("Stop") // in the "Stop reading?" box
    expect(server.stopped).toBe(1)
    await nextPoll()
    await settle()
    expect(text()).toContain("Re-index stopped")
  })

  it("changes folder inside the panel", async () => {
    server.checks["D:\\Catalogs\\Ellucian"] = { kind: "ok", path: "D:\\Catalogs\\Ellucian", families: 20, zips: 5, others: 0 }
    await renderAt("/")
    await click("Settings")
    await click("Change folder")
    await type("D:\\Catalogs\\Ellucian")
    await click("Read this folder")
    expect(server.started).toEqual(["D:\\Catalogs\\Ellucian"])
    expect(text()).toContain("Re-indexing")
  })

  it("deletes the index data after asking, then goes back to the first-run screen", async () => {
    await renderAt("/")
    await click("Settings")
    await click("Delete the index data")
    expect(text()).toContain("Delete the index data?")
    await click("Keep it")
    expect(server.deleted).toBe(0)
    await click("Delete the index data")
    await click("Delete")
    expect(server.deleted).toBe(1)
    await settle()
    expect(text()).toContain("Index data deleted")
    expect(window.location.pathname).toBe("/setup")
    expect(text()).toContain("Welcome. First, where's your API catalog?")
  })

  it("won't delete while a re-index is running", async () => {
    server.status.run = { catalog: DEFAULT, stage: "reading", done: 10, total: 4000, readingSeconds: 1 }
    await renderAt("/")
    await click("Settings")
    expect(button("Delete the index data")?.disabled).toBe(true)
    expect(text()).toContain("You can delete it once the re-index has finished or been stopped.")
  })
})

describe("Settings before the first index", () => {
  it("offers the look, and says the catalog parts come after the first read", async () => {
    await renderAt("/")
    await click("Settings")
    expect(text()).toContain("Look")
    expect(text()).toContain("No index yet: choose your catalog on the main screen.")
    expect(button("Re-index now")).toBeNull()
  })
})

describe("the early script in index.html", () => {
  const script = fs
    .readFileSync(path.join(import.meta.dirname, "..", "..", "..", "index.html"), "utf8")
    .match(/<script id="early-look">([\s\S]*?)<\/script>/)![1]
  const run = () => new Function(script)()

  it("applies the saved accent before the page draws", () => {
    localStorage.setItem(ACCENT_KEY, "teal")
    run()
    expect(html.dataset.accent).toBe("teal")
  })

  it("ignores anything that isn't a plain preset name", () => {
    localStorage.setItem(ACCENT_KEY, 'teal"] body { display: none } [x="')
    run()
    expect(html.dataset.accent).toBeUndefined()
  })
})
