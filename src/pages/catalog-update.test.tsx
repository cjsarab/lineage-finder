// @vitest-environment jsdom
// Updating the catalog: the "has changed" notice, the summary with what changed, and a
// changed version's page. Made-up APIs only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { DISMISSED_KEY } from "@/lib/catalog-update"
import { HIDDEN_KEY } from "@/lib/families"
import type { Changes, MethodParameters } from "@/lib/server"
import { DEFAULT, button, choose, click, fakeApis, follow, nextPoll, renderAt, server, settle, summary, text, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const lastRead = { builtAt: "2026-10-12T09:49:00.000Z", catalog: DEFAULT }
const p = (name: string, required = false) => ({ name, in: "query", required, description: null })

function compared(o: Partial<Extract<Changes, { outcome: "compared" }>> = {}): Changes {
  return {
    outcome: "compared",
    lastRead,
    families: { added: [], removed: [] },
    apis: { added: [], removed: [] },
    versions: { added: [], removed: [] },
    changed: [],
    ...o,
  }
}

beforeEach(() => {
  server.status.index = { state: "ready", summary }
})

describe("the 'has changed' notice", () => {
  const changed = (fingerprint = "aaaa") => (server.status.catalogCheck = { state: "changed", fingerprint })

  it("shows on the landing page when the catalog has changed", async () => {
    changed()
    await renderAt("/")
    expect(text()).toContain("Your catalog has changed since it was last read")
  })

  it("doesn't show when the catalog is the same, or the app can't tell", async () => {
    server.status.catalogCheck = { state: "same", fingerprint: "aaaa" }
    await renderAt("/")
    expect(text()).not.toContain("has changed since")
  })

  it("asks again while the server is still checking", async () => {
    server.status.catalogCheck = { state: "checking" }
    await renderAt("/")
    expect(text()).not.toContain("has changed since")
    changed()
    await nextPoll()
    expect(text()).toContain("Your catalog has changed since it was last read")
  })

  it("Not now hides it, and remembers this change", async () => {
    changed("aaaa")
    await renderAt("/")
    await click("Not now")
    expect(text()).not.toContain("has changed since")
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("aaaa")
  })

  it("stays hidden for the change Not now was pressed for", async () => {
    localStorage.setItem(DISMISSED_KEY, "aaaa")
    changed("aaaa")
    await renderAt("/")
    expect(text()).not.toContain("has changed since")
  })

  it("comes back when the catalog changes again", async () => {
    localStorage.setItem(DISMISSED_KEY, "aaaa")
    changed("bbbb")
    await renderAt("/")
    expect(text()).toContain("has changed since")
  })

  it("Re-index now starts a re-index of the remembered folder", async () => {
    changed()
    await renderAt("/")
    await click("Re-index now")
    expect(server.started).toEqual([DEFAULT])
    expect(button("Re-indexing 0%")).not.toBeNull()
    expect(text()).not.toContain("has changed since") // not while it re-reads
  })

  it("Settings says so too, even after Not now, until a re-index", async () => {
    changed()
    await renderAt("/")
    await click("Not now")
    await click("Settings")
    expect(text()).toContain("Your catalog has changed since it was last read.")
  })
})

describe("the summary of the last read", () => {
  it("is at /summary, with the headline and each list", async () => {
    server.changes = compared({
      families: { added: [{ name: "GizmoAPIs", apis: ["gizmos"] }], removed: [{ name: "OldAPIs", apis: ["olds"] }] },
      apis: { added: [{ family: "BannerWidgetAPIs", name: "widget-new" }], removed: [{ family: "BannerWidgetAPIs", name: "widget-gone" }] },
      versions: { added: [{ family: "BannerWidgetAPIs", name: "widget-requests", version: "2.1.0" }], removed: [] },
      changed: [{ family: "BannerWidgetAPIs", name: "widget-codes", version: "1.0.0", folder: "widget-codes-1.0.0", counts: { details: 1, parameters: 2, headers: false, fields: 74, lineage: 12 } }],
    })
    await renderAt("/summary")
    expect(text()).toContain("Your catalog has been re-read")
    expect(text()).toContain("Changes since your last read (12 Oct 2026, 10:49)")
    expect(text()).toContain("1 family added, 1 gone · 1 API added, 1 gone · 1 new version · 1 version changed")
    expect(text()).toContain("New family: GizmoAPIs")
    expect(text()).toContain("No longer in your catalog: OldAPIs")
    expect(text()).toContain("74 fields, 2 query parameters, lineage changed on 12, 1 detail")
    // A new version links to Compare versions, with the version before it.
    expect(document.querySelector('a[href="/apis/BannerWidgetAPIs/widget-requests/compare?from=1.0.0&to=2.1.0"]')?.textContent).toBe("Compare with 1.0.0")
    // A gone API isn't a link.
    expect([...document.querySelectorAll("a")].some((a) => a.textContent === "widget-gone")).toBe(false)
  })

  it("folds a list longer than 10", async () => {
    const added = Array.from({ length: 12 }, (_, i) => ({ family: "BannerWidgetAPIs", name: `widget-${i}` }))
    server.changes = compared({ apis: { added, removed: [] } })
    await renderAt("/summary")
    expect(text()).not.toContain("widget-11")
    await click("Show 12 rows")
    expect(text()).toContain("widget-11")
  })

  it("leaves hidden families out, with a count and Show", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SprocketAPIs"]))
    server.changes = compared({ apis: { added: [{ family: "SprocketAPIs", name: "sprocket-new" }], removed: [] } })
    await renderAt("/summary")
    expect(text()).toContain("None in the families shown.")
    expect(text()).toContain("And 1 change in hidden families.")
    await click("Show")
    expect(text()).toContain("sprocket-new")
    expect(localStorage.getItem(HIDDEN_KEY)).toBe(JSON.stringify(["SprocketAPIs"])) // Settings unchanged
  })

  it("says so when nothing changed", async () => {
    server.changes = compared()
    await renderAt("/summary")
    expect(text()).toContain("None: everything is as it was.")
  })

  it("says it's a different catalog, without changes", async () => {
    server.changes = { outcome: "different-catalog", lastRead }
    await renderAt("/summary")
    expect(text()).toContain("This is a different catalog from your last read, so changes aren't shown.")
  })

  it("says changes can't be shown after an app update changed the index", async () => {
    server.changes = { outcome: "not-comparable" }
    await renderAt("/summary")
    expect(text()).toContain("Changes can't be shown this time")
  })

  it("has no changes section after a first read", async () => {
    await renderAt("/summary")
    expect(text()).toContain("Your catalog is ready")
    expect(text()).not.toContain("Changes since")
  })

  it("is reached from the landing page", async () => {
    server.changes = compared({ versions: { added: [{ family: "BannerWidgetAPIs", name: "widget-requests", version: "2.1.0" }], removed: [] } })
    await renderAt("/")
    expect(text()).toContain("Since the read before: 1 new version. See the summary")
    await follow("See the summary")
    expect(window.location.pathname).toBe("/summary")
  })

  it("is reached from the toast when a re-index finishes", async () => {
    server.status.run = { catalog: DEFAULT, stage: "comparing", done: 19, total: 19, readingSeconds: 30 }
    await renderAt("/apis")
    server.status = { ...server.status, run: null, last: { outcome: "done", summary } }
    await nextPoll()
    await settle()
    expect(text()).toContain("Re-index finished")
    expect(window.location.pathname).toBe("/apis") // you keep browsing
    await click("See the summary")
    expect(window.location.pathname).toBe("/summary")
  })
})

describe("a changed version's page", () => {
  const widgetCodes = fakeApis.find((a) => a.name === "widget-codes")!
  const then: MethodParameters[] = [{ path: "/api/widget-codes", method: "GET", parameters: [p("criteria")] }]
  const now: MethodParameters[] = [{ path: "/api/widget-codes", method: "GET", parameters: [p("filter")] }]

  beforeEach(() => {
    server.changes = compared({ changed: [{ family: "BannerWidgetAPIs", name: "widget-codes", version: "1.0.0", folder: "widget-codes-1.0.0", counts: { details: 0, parameters: 2, headers: false, fields: 0, lineage: 0 } }] })
    server.changesWas = { "BannerWidgetAPIs/widget-codes": { "widget-codes-1.0.0": { version: widgetCodes.versions[0], parameters: then, fields: null } } }
    server.parameters = { "BannerWidgetAPIs/widget-codes": { "widget-codes-1.0.0": now } }
  })

  it("opens from the summary and compares the last read with now", async () => {
    await renderAt("/summary")
    await follow("See what changed")
    expect(window.location.pathname + window.location.search).toBe("/apis/BannerWidgetAPIs/widget-codes/changes?version=1.0.0")
    expect(text()).toContain("What changed in widget-codes 1.0.0")
    expect(text()).toContain("Your last read (12 Oct 2026, 10:49) with now")
    expect(text()).toContain("criteria")
    expect(text()).toContain("filter")
    await act(async () => button("Back to the summary")!.click())
    await settle()
    expect(window.location.pathname).toBe("/summary")
  })

  it("names the sides Last read and Now, side by side", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-codes/changes?version=1.0.0")
    await choose("Side by side")
    const heads = [...document.querySelectorAll("th")].map((th) => th.textContent)
    expect(heads).toContain("Last read")
    expect(heads).toContain("Now")
  })

  it("says so for a version with no stored change", async () => {
    server.changesWas = {}
    await renderAt("/apis/BannerWidgetAPIs/widget-codes/changes?version=1.0.0")
    expect(text()).toContain("No changes to show for version 1.0.0 since your last read.")
  })
})
