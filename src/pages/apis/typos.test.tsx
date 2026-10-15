// @vitest-environment jsdom
// Probable typos marked on the pages. Made-up APIs; the typo names are the catalog's own.
import { beforeEach, describe, expect, it } from "vitest"
import { fakeApi, fakeApis, page, renderAt, server, summary, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  server.apis = [...fakeApis, fakeApi("BannerWidgetAPIs", "widget-programs")]
  server.fields = {
    "BannerWidgetAPIs/widget-programs": {
      "widget-programs-1.0.0": {
        fields: [
          { name: "program", depth: 0, values: [{ kind: "lookup", text: "SMARPLE" }] },
          { name: "zone", depth: 0, values: [{ kind: "lookup", text: "V,TIMEZONE_NAMES" }] },
          { name: "list", depth: 0, values: [{ kind: "ref", text: "GTVFLST_CODE", places: [{ table: "GTVFLST", column: "GTVFLST_CODE" }] }] },
        ],
        other: [],
      },
    },
  }
  server.tables = [{ product: "Banner", name: "GTVFLST", apis: ["BannerWidgetAPIs/widget-programs"], cols: [[0]] }]
  server.tableDetails = {
    "Banner/GTVFLST": { product: "Banner", name: "GTVFLST", columns: [{ name: "GTVFLST_CODE", apis: ["BannerWidgetAPIs/widget-programs"] }],
      apis: [{ id: "BannerWidgetAPIs/widget-programs", fields: [{ path: "list", column: "GTVFLST_CODE" }] }],
      alsoIn: [],
    },
  }
})

const badges = () =>
  [...page().querySelectorAll("main [title]")]
    .filter((b) => b.textContent?.startsWith("probably "))
    .map((b) => ({ text: b.textContent, href: b.closest("a")?.getAttribute("href") ?? null, note: b.getAttribute("title") }))

describe("probable typos", () => {
  it("marks them in an API's fields, beside the value as written and the table, linking to the name meant", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-programs")
    expect(badges()).toEqual([
      {
        text: "probably SMAPRLE",
        href: "/forms/Banner/SMAPRLE",
        note: "Not a table or form in a Banner database checked on 12 Oct 2026. The form SMAPRLE sits on the table SMRPRLE.",
      },
      {
        text: "probably V$TIMEZONE_NAMES",
        href: null,
        note: "Probably Oracle's built-in list of time zone names, V$TIMEZONE_NAMES, with a comma for the $. Assumed, not checked against a database.",
      },
      { text: "probably GTVLFST", href: "/tables/Banner/GTVLFST", note: "Not a table or form in a Banner database checked on 12 Oct 2026." },
    ])
    // The catalog's name is kept as it is.
    expect(page().textContent).toContain("Lookup: SMARPLE")
  })

  it("marks them on the tables list", async () => {
    await renderAt("/tables")
    expect(badges().map((b) => b.text)).toEqual(["probably GTVLFST"])
  })

  it("marks them on the table's page", async () => {
    await renderAt("/tables/Banner/GTVFLST")
    expect(badges().map((b) => [b.text, b.href])).toContainEqual(["probably GTVLFST", "/tables/Banner/GTVLFST"])
  })
})
