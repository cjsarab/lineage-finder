// @vitest-environment jsdom
// Comparing two versions of an API. Made-up APIs only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import type { Api, Field, MethodParameters, Value } from "@/lib/server"
import { button, choose, click, fakeApi, fakeApis, follow, page, renderAt, server, settle, summary, text, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const ref = (t: string): Value => ({ kind: "ref", text: t })
const field = (name: string, depth: number, values?: Value[], list?: true): Field => ({ name, depth, ...(values ? { values } : {}), ...(list ? { list } : {}) })
const p = (name: string, where: string, required = false, values?: Value[]) => ({ name, in: where, required, description: null, ...(values ? { values } : {}) })

/** Three versions: 1.0.0 (beta) and 2.0.0 alike bar a required parameter; 2.1.0 changes most things. */
function widgetOrders(): Api {
  const api = fakeApi("BannerWidgetAPIs", "widget-orders", { versions: ["1.0.0", "2.0.0", "2.1.0"], baseTables: ["SWBORDR"] })
  Object.assign(api.versions[0].details!, { beta: true, releaseStatus: "beta" })
  api.versions[2].baseTables = ["SWBORDH", "SWBORDR"]
  return api
}

const v1: MethodParameters[] = [{ path: "/api/widget-orders", method: "GET", parameters: [p("termCode", "query"), p("userId", "query", true), p("accept", "header")] }]
const v2: MethodParameters[] = [{ path: "/api/widget-orders", method: "GET", parameters: [p("termCode", "query", true), p("userId", "query", true), p("accept", "header")] }]
const v21: MethodParameters[] = [
  { path: "/api/widget-orders", method: "GET", parameters: [p("termCode", "query", true), p("user", "query", true), p("Accept", "header"), p("X-Request-Id", "header")] },
  { path: "/api/widget-orders", method: "POST", parameters: [p("dryRun", "query")] },
]
const spaced = "A record in GORGUID where GORGUID_LDM_NAME='widget-orders' and   GORGUID_DOMAIN_KEY = SWBORDR_CODE"
const f1 = [field("id", 0, [ref(spaced)]), field("code", 0, [ref("SWBORDR_CODE")]), field("phone", 0, [ref("SWRTELE_PHONE")]), field("contact", 0)]
const f21 = [
  field("id", 0, [ref(spaced.replace("and   ", "and "))]),
  field("code", 0, [ref("SWBORDR_ORDER_CODE")]),
  field("contact", 0),
  field("phone", 1, [ref("SWRTELE_PHONE")]),
  field("notes", 0, undefined, true),
]

/** Two versions far apart: 12 query parameters dropped and 12 fields added, to fold. */
function widgetBulk(): Api {
  return fakeApi("BannerWidgetAPIs", "widget-bulk", { versions: ["1.0.0", "2.0.0"] })
}
const twelve = Array.from({ length: 12 }, (_, i) => `filter${i + 1}`)

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.apis = [...fakeApis, widgetOrders(), widgetBulk()]
  server.parameters = {
    "BannerWidgetAPIs/widget-orders": { "widget-orders-1.0.0": v1, "widget-orders-2.0.0": v2, "widget-orders-2.1.0": v21 },
    "BannerWidgetAPIs/widget-bulk": { "widget-bulk-1.0.0": [{ path: "/api/widget-bulk", method: "GET", parameters: twelve.map((n) => p(n, "query")) }] },
  }
  server.fields = {
    "BannerWidgetAPIs/widget-orders": {
      "widget-orders-1.0.0": { fields: f1, other: [] },
      "widget-orders-2.0.0": { fields: f1, other: [] },
      "widget-orders-2.1.0": { fields: f21, other: [{ schema: "OrderLegacy", fields: [field("legacyCode", 0, [ref("SWBORDR_OLD_CODE")])] }] },
    },
    "BannerWidgetAPIs/widget-bulk": {
      "widget-bulk-1.0.0": { fields: [], other: [] },
      "widget-bulk-2.0.0": { fields: twelve.map((n) => field(n, 0)), other: [] },
    },
  }
})

const ORDERS = "/apis/BannerWidgetAPIs/widget-orders"
const COMPARE = `${ORDERS}/compare`
const search = () => new URLSearchParams(window.location.search)
const detail = (label: string) => [...page().querySelectorAll("dt")].find((d) => d.textContent === label)?.nextElementSibling?.textContent ?? null
/** The section whose heading starts with `title`. */
const section = (title: string) => [...page().querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent?.startsWith(title)) ?? null
const picker = (label: string) => page().querySelector(`[aria-label="${label}"] [data-slot="select-value"]`)?.textContent ?? null
/** The options of the list just opened (the simulated browser leaves earlier ones in the page). */
const openOptions = () => [...([...document.querySelectorAll('[role="listbox"]')].at(-1)?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
async function pick(label: string, option: string) {
  await click(label)
  const o = openOptions().find((x) => x.textContent?.startsWith(option))
  if (!o) throw new Error(`No "${option}" in ${label}: ${[...document.querySelectorAll('[role="option"]')].map((x) => x.textContent).join(", ")}`)
  await act(async () => o.click())
  await settle()
}
/** Whether the radio button labelled `label` is chosen (its label points at the toolkit's hidden radio input). */
const checked = (label: string) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label)
  return (l?.htmlFor ? document.getElementById(l.htmlFor) : null) instanceof HTMLInputElement ? (document.getElementById(l!.htmlFor) as HTMLInputElement).checked : null
}
const options = async (label: string) => {
  await click(label)
  return openOptions().map((o) => o.textContent)
}
/** Clicks the button labelled `label` inside the section headed `title`. */
async function clickIn(title: string, label: string) {
  const b = [...(section(title)?.querySelectorAll("button") ?? [])].find((x) => x.textContent?.trim() === label)
  if (!b) throw new Error(`No "${label}" button under ${title}`)
  await act(async () => b.click())
  await settle()
}

describe("the API page's button", () => {
  it("compares the version shown with the one before it", async () => {
    await renderAt(ORDERS)
    await click("Compare versions")
    expect(window.location.pathname).toBe(COMPARE)
    expect([search().get("from"), search().get("to")]).toEqual(["2.0.0", "2.1.0"])
  })

  it("compares the oldest with the one after it", async () => {
    await renderAt(`${ORDERS}?version=1.0.0`)
    await click("Compare versions")
    expect([search().get("from"), search().get("to")]).toEqual(["1.0.0", "2.0.0"])
  })

  it("isn't there for an API with one version", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-codes")
    expect(text()).toContain("widget-codes")
    expect(button("Compare versions")).toBeNull()
  })
})

describe("getting there and back", () => {
  it("goes back to the API page as you left it", async () => {
    await renderAt(`${ORDERS}?version=2.0.0`)
    await click("Compare versions")
    await click("Back to widget-orders")
    expect(window.location.pathname).toBe(ORDERS)
    expect(search().get("version")).toBe("2.0.0")
  })

  it("opened from its address, goes to the API page on the newer version", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.0.0`)
    await follow("Back to widget-orders")
    expect(window.location.pathname).toBe(ORDERS)
    expect(search().get("version")).toBe("2.0.0")
  })

  it("starts on the newest and the one before it when the address doesn't say", async () => {
    await renderAt(COMPARE)
    expect(page().querySelector("h1")?.textContent).toBe("Compare versions of widget-orders")
    expect([picker("From"), picker("To")]).toEqual(["2.0.0", "2.1.0"])
  })

  it("says when the address asks for a version the API doesn't have, and compares the newest pair", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=9.9.9`)
    expect(text()).toContain("This API has no version 9.9.9.")
    expect([picker("From"), picker("To")]).toEqual(["2.0.0", "2.1.0"])
  })

  it("only compares older with newer", async () => {
    await renderAt(`${COMPARE}?from=2.1.0&to=1.0.0`)
    expect(text()).toContain("Version 2.1.0 isn't older than 1.0.0.")
  })

  it("says so for an API that isn't in the catalog", async () => {
    await renderAt("/apis/BannerWidgetAPIs/nothing-here/compare")
    expect(text()).toContain("No API by that name in your catalog.")
  })

  it("says so for an API whose family is hidden in Settings", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerWidgetAPIs"]))
    await renderAt(COMPARE)
    expect(text()).toContain("is hidden in Settings")
  })
})

describe("the version pickers", () => {
  it("offer every version but the newest as From, and only newer ones as To", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    expect(await options("From")).toEqual(["1.0.0 beta", "2.0.0"])
    expect(await options("To")).toEqual(["2.0.0", "2.1.0"])
  })

  it("put the choice in the address, moving To on when From catches it up", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.0.0`)
    await pick("From", "2.0.0")
    expect([search().get("from"), search().get("to")]).toEqual(["2.0.0", "2.1.0"])
    await pick("From", "1.0.0")
    expect([search().get("from"), search().get("to")]).toEqual(["1.0.0", "2.1.0"])
  })
})

describe("what changed", () => {
  it("lists the versions, the details that changed as now and was, and the counts", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    expect(detail("From version")).toBe("1.0.0")
    expect(detail("To version")).toBe("2.1.0")
    expect(detail("Base tables")).toBe("SWBORDH, SWBORDR (was SWBORDR)")
    expect(detail("Status")).toBe("Released (was Beta)")
    expect(detail("Query parameters")).toBe("2 added, 1 removed, 1 changed")
    expect(detail("Headers")).toBe("X-Request-Id added (GET)")
    expect(detail("Fields")).toBe("1 added, 1 moved")
    expect(detail("Lineage")).toBe("Changed on 1 field")
    expect(detail("Other schemas")).toBe("1 added")
  })

  it("says when nothing changed", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-totals/compare?from=1.0.0&to=2.0.0")
    expect(text()).toContain("None: the query parameters, headers, fields, lineage, base table, methods and status are the same.")
  })
})

describe("query parameters", () => {
  it("shows only the changes, marked, with the headers' changes on one line", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    const s = section("Query parameters")!.textContent
    expect(s).toContain("+ addeduser")
    expect(s).toContain("− removeduserId")
    expect(s).toContain("changedtermCode")
    expect(s).toContain("now required")
    expect(s).toContain("POST /api/widget-orders")
    expect(s).toContain("Headers: X-Request-Id added (GET)")
    expect(s).not.toContain("accept")
  })

  it("under Everything, shows unchanged ones too and a header written differently", async () => {
    await renderAt(`${COMPARE}?from=2.0.0&to=2.1.0`)
    expect(section("Query parameters")!.textContent).not.toContain("termCode")
    await choose("Everything")
    const s = section("Query parameters")!.textContent
    expect(s).toContain("termCode")
    expect(s).toContain("Headers in 2.1.0: Accept, X-Request-Id (GET)")
    expect(s).toContain("Accept written accept in 2.0.0")
  })
})

describe("fields and lineage", () => {
  it("marks changed lineage with what it was, moved fields with where they were, and ignores spacing", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    const rows = [...section("Fields and lineage")!.querySelectorAll("tbody tr")].map((r) => r.textContent)
    expect(rows.some((r) => r?.startsWith("code") && r.includes("lineage changed") && r.includes("SWBORDR_ORDER_CODE") && r.includes("was: SWBORDR_CODE"))).toBe(true)
    expect(rows.some((r) => r?.includes("phone") && r.includes("moved") && r.includes("was under the top level"))).toBe(true)
    expect(rows.some((r) => r?.includes("notes") && r.includes("+ added"))).toBe(true)
    expect(rows.some((r) => r?.startsWith("id"))).toBe(false)
  })

  it("compares the other schemas in a section of their own", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    const s = section("Other schemas in the spec")!.textContent
    expect(s).toContain("OrderLegacy")
    expect(s).toContain("legacyCode")
  })

  it("leaves the other schemas out when neither version has any", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.0.0`)
    expect(section("Fields and lineage")).not.toBeNull()
    expect(section("Other schemas in the spec")).toBeNull()
  })
})

describe("show and layout", () => {
  it("side by side puts each version in a column", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    await choose("Side by side")
    await choose("Everything")
    const heads = [...section("Fields and lineage")!.querySelectorAll("th")].map((h) => h.textContent)
    expect(heads).toEqual(["Field", "1.0.0", "2.1.0"])
    expect(section("Fields and lineage")!.textContent).toContain("not in 1.0.0")
    // What changed sits under the field's name, not in either version's column.
    const code = [...section("Fields and lineage")!.querySelectorAll("tbody tr")].find((r) => r.querySelector("td")?.textContent?.startsWith("code"))!
    expect([...code.querySelectorAll("td")].map((c) => c.textContent?.includes("lineage changed"))).toEqual([true, false, false])
  })

  it("remembers the layout, but starts Show on Only changes each time", async () => {
    await renderAt(`${ORDERS}?version=2.1.0`)
    await click("Compare versions")
    expect([checked("One list"), checked("Only changes")]).toEqual([true, true])
    await choose("Side by side")
    await choose("Everything")
    await click("Back to widget-orders")
    await click("Compare versions")
    expect([checked("Side by side"), checked("Only changes")]).toEqual([true, true])
  })
})

describe("folding", () => {
  it("folds a list of more than 10 rows behind one Show button, which then hides it again", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-bulk/compare")
    const params = () => section("Query parameters")!.textContent ?? ""
    expect(params()).toContain("Show 12 rows")
    expect(params()).not.toContain("filter1")
    await clickIn("Query parameters", "Show 12 rows")
    expect(params()).toContain("filter12")
    await clickIn("Query parameters", "Hide 12 rows")
    expect(params()).not.toContain("filter1")
    expect(section("Fields and lineage")!.textContent).toContain("Show 12 rows")
  })

  it("leaves a list of 10 rows or fewer open", async () => {
    await renderAt(`${COMPARE}?from=1.0.0&to=2.1.0`)
    expect(section("Query parameters")!.textContent).not.toContain("Show ")
    expect(section("Query parameters")!.textContent).toContain("Hide ")
  })
})
