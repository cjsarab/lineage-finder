// @vitest-environment jsdom
// One API's page. Made-up APIs only.
import { act } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import { PAGE_SIZE_KEY } from "@/lib/page-size"
import type { Api } from "@/lib/server"
import { click, fakeApi, fakeApis, follow, page, renderAt, server, settle, summary, text, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

/** Three versions: an older beta, a deprecated one, and the newest, with every detail filled in on the newest. */
function widgetOrders(): Api {
  const api = fakeApi("BannerWidgetAPIs", "widget-orders", { versions: ["1.0.0", "2.0.0", "2.1.0"] })
  const [v1, v2, v3] = api.versions.map((v) => v.details!)
  Object.assign(v1, { beta: true, releaseStatus: "beta", description: "The first try." })
  Object.assign(v2, { deprecatedOn: "2025-03-01", sunsetOn: "2026-03-01", description: "The second." })
  Object.assign(v3, {
    title: "Widget Orders",
    description: "<p>Orders for widgets.</p><ul><li>Needs a term.</li></ul><script>alert(1)</script>",
    specVersion: "2.0.9",
    versionDiffers: true,
    apiType: "bus-poc",
    sourceSystem: "banner",
    audience: "all",
    sourceTitle: "Widget Orders",
    sourceName: "SWAWORD",
    mediaTypes: ["application/vnd.hedtech.integration.v2+json"],
    methods: [
      { path: "/api/widget-orders/{id}", method: "DELETE", summary: "Deletes an order.", permissions: ["ORDERS_DELETE"] },
      { path: "/api/widget-orders", method: "POST", summary: "Creates an order.", permissions: ["ORDERS_WRITE", "('A' OR 'B') AND 'C'"] },
      { path: "/api/widget-orders", method: "GET", summary: "Lists orders.", permissions: [] },
    ],
  })
  return api
}

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.apis = [...fakeApis, widgetOrders()]
  server.parameters = {
    "BannerWidgetAPIs/widget-orders": {
      "widget-orders-2.1.0": [
        {
          path: "/api/widget-orders",
          method: "GET",
          parameters: [
            { name: "termCode", in: "query", required: true, description: "The **term** to look in." },
            { name: "limit", in: "query", required: false, description: null },
            { name: "Accept", in: "header", required: false, description: null },
            { name: "X-SDE-Expand", in: "header", required: false, description: null },
          ],
        },
        { path: "/api/widget-orders", method: "POST", parameters: [{ name: "Content-Type", in: "header", required: false, description: null }] },
        { path: "/api/widget-orders/{id}", method: "DELETE", parameters: [{ name: "id", in: "path", required: true, description: "The order." }] },
      ],
    },
  }
})

const ORDERS = "/apis/BannerWidgetAPIs/widget-orders"
const search = () => new URLSearchParams(window.location.search)
const pressed = () => [...document.querySelectorAll('[data-slot="toggle-group-item"][aria-pressed="true"]')].map((b) => b.textContent)
const methodRows = () => [...page().querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent).join(" | "))
const detail = (label: string) => [...page().querySelectorAll("dt")].find((d) => d.textContent === label)?.nextElementSibling ?? null

describe("the heading", () => {
  it("shows the name, the title when it differs, the family as a link to the list and the product", async () => {
    await renderAt(ORDERS)
    expect(page().querySelector("h1")?.textContent).toBe("widget-orders")
    expect(text()).not.toContain("Widget Orders · ") // the title equals the name, bar capitals and hyphens
    expect(text()).toContain("BannerWidgetAPIs · Banner")
    expect(page().querySelector('a[href="/apis?family=BannerWidgetAPIs"]')).not.toBeNull()
  })

  it("shows a title that says something else", async () => {
    server.apis.at(-1)!.versions[2].details!.title = "Orders of widgets"
    await renderAt(ORDERS)
    expect(text()).toContain("Orders of widgets")
  })

  it("links the same name in another family, saying when that family is hidden", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-requests")
    expect(text()).toContain("Also in ColleagueWidgetAPIs")
    expect(text()).not.toContain("(hidden in Settings)")
    await follow("ColleagueWidgetAPIs", "/apis/ColleagueWidgetAPIs/widget-requests")
    expect(window.location.pathname).toBe("/apis/ColleagueWidgetAPIs/widget-requests")
    expect(text()).toContain("Also in BannerWidgetAPIs")
  })

  it("says when the other family is hidden in Settings", async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["ColleagueWidgetAPIs"]))
    await renderAt("/apis/BannerWidgetAPIs/widget-requests")
    expect(text()).toContain("Also in ColleagueWidgetAPIs (hidden in Settings)")
  })
})

describe("versions", () => {
  it("has a button for each, labelled, with the newest chosen", async () => {
    await renderAt(ORDERS)
    expect([...document.querySelectorAll('[data-slot="toggle-group-item"]')].map((b) => b.textContent)).toEqual([
      "1.0.0 beta",
      "2.0.0 deprecated",
      "2.1.0",
    ])
    expect(pressed()).toEqual(["2.1.0"])
    expect(text()).not.toContain("older version")
  })

  it("shows the chosen version, puts it in the address and leaves Back for the list", async () => {
    await renderAt("/apis")
    await follow("widget-orders")
    await click("2.0.0 deprecated")
    expect(search().get("version")).toBe("2.0.0")
    expect(pressed()).toEqual(["2.0.0 deprecated"])
    expect(text()).toContain("The second.")
    expect(text()).toContain("Version 2.0.0 is deprecated (since 2025-03-01) and sunsets on 2026-03-01.")
    expect(text()).toContain("The newest is 2.1.0.")
    expect(page().querySelector("h1")?.parentElement?.textContent).toContain("deprecated")

    await follow("2.1.0")
    expect(search().get("version")).toBeNull()
    expect(text()).toContain("Orders for widgets.")

    await click("Back to the list")
    await settle()
    expect(window.location.pathname).toBe("/apis")
  })

  it("opens a version from its address, saying it's older and beta", async () => {
    await renderAt(`${ORDERS}?version=1.0.0`)
    expect(pressed()).toEqual(["1.0.0 beta"])
    expect(text()).toContain("You're looking at an older version.")
    expect(text()).toContain("This is a beta version.")
    expect(detail("Status")?.textContent).toBe("Beta")
  })

  it("says when the address asks for a version the API doesn't have, and shows the newest", async () => {
    await renderAt(`${ORDERS}?version=9.9.9`)
    expect(text()).toContain("This API has no version 9.9.9. Showing the newest.")
    expect(pressed()).toEqual(["2.1.0"])
  })

  it("shows a single version without buttons", async () => {
    await renderAt("/apis/BannerGadgetAPIs/gadgets")
    expect(document.querySelector('[data-slot="toggle-group"]')).toBeNull()
    expect(text()).toContain("Version1.0.0")
  })

  it("says when a version's spec couldn't be read", async () => {
    const api = server.apis.at(-1)!
    api.versions[0] = { ...api.versions[0], read: "unreadable", problem: "empty file", details: null }
    await renderAt(`${ORDERS}?version=1.0.0`)
    expect(text()).toContain("This version's spec couldn't be read.")
    expect(text()).toContain("empty file")
  })
})

describe("About and Details", () => {
  it("formats the description, showing any other tag as text", async () => {
    await renderAt(ORDERS)
    expect(page().querySelector("li")?.textContent).toBe("Needs a term.")
    expect(page().querySelector("script")).toBeNull()
    expect(text()).toContain("<script>alert(1)</script>")
  })

  it("says when there's no description", async () => {
    await renderAt("/apis/BannerGadgetAPIs/gadgets")
    expect(text()).toContain("No description in the catalog.")
  })

  it("shows only the rows that have a value, and never source system or audience", async () => {
    await renderAt(ORDERS)
    const labels = [...page().querySelectorAll("dt")].map((d) => d.textContent)
    expect(labels.slice(0, 7)).toEqual(["Version", "Domain", "Type", "Status", "Banner page", "Media type", "In your catalog"])
    expect(detail("Version")?.textContent).toBe("2.1.0 (spec says 2.0.9)")
    expect(detail("Status")?.textContent).toBe("Released")
    expect(detail("Banner page")?.textContent).toBe("Widget Orders (SWAWORD)")
    expect(detail("Media type")?.textContent).toBe("application/vnd.hedtech.integration.v2+json")
    expect(detail("In your catalog")?.textContent).toBe("BannerWidgetAPIs/widget-orders-2.1.0/widget-orders.yaml, in production_API_catalog_A_B.zip")
    expect(text()).not.toContain("Audience")
    expect(text()).not.toContain("Source system")
  })

  it("leaves out rows with nothing in them", async () => {
    await renderAt("/apis/BannerGadgetAPIs/gadgets")
    expect([...page().querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["Version", "Domain", "Status", "In your catalog"])
  })

  it("copies a media type when you click it, and says so", async () => {
    const copied: string[] = []
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } })
    await renderAt(ORDERS)
    await click("Copy application/vnd.hedtech.integration.v2+json")
    expect(copied).toEqual(["application/vnd.hedtech.integration.v2+json"])
    expect(text()).toContain("Copied")
  })

  it("says when the browser won't copy", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.reject(new Error("denied")) } })
    await renderAt(ORDERS)
    await click("Copy application/vnd.hedtech.integration.v2+json")
    expect(text()).toContain("Couldn't copy")
  })

  it("links the domain to the list filtered to it, tidied as the list tidies it", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-codes") // "student" in small letters
    expect(detail("Domain")?.querySelector("a")?.getAttribute("href")).toBe("/apis?domain=Student")
    await follow("student")
    expect(window.location.pathname).toBe("/apis")
    expect(search().getAll("domain")).toEqual(["Student"])
  })

  it("doesn't link a domain the list can't filter on", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-forms") // a form code: listed under Not stated
    expect(detail("Domain")?.querySelector("a")).toBeNull()
  })

})

describe("methods, parameters and headers", () => {
  it("lists the methods by path, then GET, POST, PUT, PATCH, DELETE, with their permissions", async () => {
    await renderAt(ORDERS)
    expect(text()).toContain("Methods (3)")
    expect(methodRows()).toEqual([
      "GET | /api/widget-orders | Lists orders. | ",
      "POST | /api/widget-orders | Creates an order. | ORDERS_WRITE('A' OR 'B') AND 'C'",
      "DELETE | /api/widget-orders/{id} | Deletes an order. | ORDERS_DELETE",
    ])
  })

  it("shows the query and path parameters under their method, and the headers in one line", async () => {
    await renderAt(ORDERS)
    const groups = [...page().querySelectorAll("h3")].map((h) => h.textContent)
    expect(groups).toEqual(["GET /api/widget-orders", "DELETE /api/widget-orders/{id}"])
    expect(text()).toContain("termCoderequiredThe term to look in.")
    expect(page().querySelector("dd strong")?.textContent).toBe("term")
    expect(text()).toContain("limitNo description.")
    expect(text()).toContain("idin the pathrequiredThe order.")
    expect(text()).toContain("Headers: Accept, X-SDE-Expand (GET) · Content-Type (POST)")
  })

  it("splits a very long list into pages, with the list's controls above it", async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ name: `field${i + 1}`, in: "query", required: false, description: null }))
    server.parameters["BannerWidgetAPIs/widget-orders"]["widget-orders-2.1.0"][0].parameters = many
    await renderAt(ORDERS)
    expect(text()).toContain("1–20 of 120 parameters")
    expect(text()).toContain("field20No description.")
    expect(text()).not.toContain("field21")
    const next = document.querySelector<HTMLAnchorElement>('a[aria-label="Next page"]')!
    await act(async () => next.click())
    await settle()
    expect(text()).toContain("21–40 of 120 parameters")
    expect(text()).toContain("field21")
    expect(text()).not.toContain("field20No")
  })

  it("uses the page size chosen on the list", async () => {
    localStorage.setItem(PAGE_SIZE_KEY, "50")
    server.parameters["BannerWidgetAPIs/widget-orders"]["widget-orders-2.1.0"][0].parameters = Array.from({ length: 51 }, (_, i) => ({
      name: `field${i + 1}`,
      in: "query",
      required: false,
      description: null,
    }))
    await renderAt(ORDERS)
    expect(text()).toContain("1–50 of 51 parameters")
  })

  it("says when a version has no parameters", async () => {
    await renderAt(`${ORDERS}?version=2.0.0`)
    expect(text()).toContain("No query parameters in the catalog for this version.")
    expect(text()).not.toContain("Headers:")
  })

  it("says when the parameters can't be loaded, while the rest of the page stays", async () => {
    const fakeFetch = globalThis.fetch
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.endsWith("/parameters") ? Promise.reject(new Error("connection refused")) : fakeFetch(url, init),
    )
    await renderAt(ORDERS)
    expect(text()).toContain("Couldn't load the parameters.")
    expect(text()).toContain("Methods (3)")
    expect([...page().querySelectorAll("a")].some((a) => a.textContent?.trim() === "All APIs")).toBe(true)
  })
})

describe("the base table and query parameters' lineage", () => {
  const link = (name: string) => [...page().querySelectorAll<HTMLAnchorElement>("main a")].find((a) => a.textContent === name)?.getAttribute("href")

  it("shows the base tables in Details, one per line, and again above the fields, as links to their pages", async () => {
    server.apis = [...fakeApis, fakeApi("BannerWidgetAPIs", "widget-orders", { baseTables: ["SWBWORD", "SWRWDTL"] })]
    await renderAt(ORDERS)
    expect(detail("Base tables")?.textContent).toBe("SWBWORDSWRWDTL")
    expect(text()).toContain("Base tables: SWBWORD, SWRWDTL")
    expect(link("SWBWORD")).toBe("/tables/Banner/SWBWORD")
  })

  it("says 'Base table' for one", async () => {
    server.apis = [...fakeApis, fakeApi("BannerWidgetAPIs", "widget-orders", { baseTables: ["SWBWORD"] })]
    await renderAt(ORDERS)
    expect(detail("Base table")?.textContent).toBe("SWBWORD")
  })

  it("says nothing about a base table when the version names none", async () => {
    await renderAt("/apis/BannerGadgetAPIs/gadgets")
    expect(text()).not.toContain("Base table")
  })

  it("puts each parameter's table and column under its name, as links, marking probable and showing the rest as written", async () => {
    server.parameters["BannerWidgetAPIs/widget-orders"]["widget-orders-2.1.0"][0].parameters = [
      { name: "termCode", in: "query", required: true, description: null, values: [{ kind: "ref", text: "SWBWORD_TERM_CODE", places: [{ table: "SWBWORD", column: "SWBWORD_TERM_CODE" }] }] },
      { name: "ownerTitle", in: "query", required: false, description: null, values: [{ kind: "ref", text: "swbwordTitle", places: [{ table: "SWBWORD", column: "SWBWORD_TITLE", probable: true }] }] },
      { name: "typeFlag", in: "query", required: false, description: null, values: [{ kind: "ref", text: "TYPE_IND" }] },
      { name: "size", in: "query", required: false, description: null, values: [{ kind: "lookup", text: "SWVSIZE" }] },
      { name: "limit", in: "query", required: false, description: null },
    ]
    await renderAt(ORDERS)
    expect(text()).toContain("termCoderequiredSWBWORD·SWBWORD_TERM_CODENo description.")
    expect(text()).toContain("ownerTitleSWBWORD·SWBWORD_TITLEprobableNo description.")
    expect(text()).toContain("typeFlagTYPE_INDNo description.")
    expect(text()).toContain("sizeLookup: SWVSIZENo description.")
    expect(text()).toContain("limitNo description.")
    expect(link("SWBWORD_TERM_CODE")).toBe("/tables/Banner/SWBWORD/SWBWORD_TERM_CODE")
  })
})

describe("forms", () => {
  const link = (name: string) => [...page().querySelectorAll<HTMLAnchorElement>("main a")].find((a) => a.textContent === name)?.getAttribute("href")

  it("shows the Form row in place of 'Banner page', its code linked to the form's page", async () => {
    const api = widgetOrders()
    api.versions.forEach((v) => (v.forms = ["SWAWORD"]))
    server.apis = [...fakeApis, api]
    await renderAt(ORDERS)
    const labels = [...page().querySelectorAll("dt")].map((d) => d.textContent)
    expect(labels).toContain("Form")
    expect(labels).not.toContain("Banner page")
    expect(detail("Form")?.textContent).toBe("Widget Orders (SWAWORD)")
    expect(link("SWAWORD")).toBe("/forms/Banner/SWAWORD")
  })

  it("shows a Banner ERP API's source as written, with the forms and tables in it linked", async () => {
    server.status.index = {
      state: "ready",
      summary: { ...summary, families: [...summary.families, { name: "BannerErpAPIs", group: "Banner", product: "Banner", apis: 1, versions: 1 }] },
    }
    server.tables = [{ product: "Banner", name: "SWBWORD", apis: ["BannerErpAPIs/order-totals"], cols: [] }]
    server.apis = [...fakeApis, fakeApi("BannerErpAPIs", "order-totals", { forms: ["SWAWORD", "SWIWINQ"], sourceName: "SWAWORD, SWBWORD and SWIWINQ", sourceTitle: "Order totals" })]
    await renderAt("/apis/BannerErpAPIs/order-totals")
    expect(detail("Source")?.textContent).toBe("SWAWORD, SWBWORD and SWIWINQ")
    expect(link("SWAWORD")).toBe("/forms/Banner/SWAWORD")
    expect(link("SWIWINQ")).toBe("/forms/Banner/SWIWINQ")
    expect(link("SWBWORD")).toBe("/tables/Banner/SWBWORD")
  })

  it("labels key-block parameters 'key block', with a note, keeping the catalog's own 'required'", async () => {
    server.parameters["BannerWidgetAPIs/widget-orders"]["widget-orders-2.1.0"][0].parameters = [
      { name: "id", in: "query", required: false, description: null, formKey: true },
      { name: "termCode", in: "query", required: true, description: null, formKey: true },
      { name: "limit", in: "query", required: false, description: null },
    ]
    await renderAt(ORDERS)
    expect(text()).toContain("idkey blockNo description.")
    expect(text()).toContain("termCoderequiredkey blockNo description.")
    expect(text()).toContain("limitNo description.")
    const badge = [...page().querySelectorAll("[title]")].find((b) => b.textContent === "key block")
    expect(badge?.getAttribute("title")).toBe(
      "The form starts from its key block. Often needed even when the catalog says optional (an ID, a term, a CRN); some are optional filters.",
    )
  })
})
