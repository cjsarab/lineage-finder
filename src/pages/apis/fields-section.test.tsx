// @vitest-environment jsdom
// The "Fields and lineage" section. Made-up APIs and lineage only.
import { act } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { HIDDEN_KEY } from "@/lib/families"
import type { Field, Value } from "@/lib/server"
import { button, choose, click, page, renderAt, server, settle, summary, text, typeInto, useFakeApp } from "@/test-support/fake-app"

useFakeApp()

const ref = (text: string, extra: Partial<Value> = {}): Value => ({ kind: "ref", text, ...extra })
const placed = (text: string, table: string, column: string, probable = false) =>
  ref(text, { places: [{ table, column, ...(probable ? { probable: true as const } : {}) }] })

const FIELDS: Field[] = [
  { name: "id", depth: 0, values: [placed("GORGUID_GUID(LDM_NAME='widgets')", "GORGUID", "GORGUID_GUID")] },
  { name: "owner", depth: 0 },
  { name: "title", depth: 1, values: [placed("swbwidgTitle", "SWBWIDG", "SWBWIDG_TITLE", true)] },
  { name: "preference", depth: 1, values: [ref("unsupported", { note: "unsupported" })] },
  {
    name: "fullName",
    depth: 1,
    values: [ref("derived", { note: "derived" }), { kind: "derived", text: "Joins the first and last names." }, { kind: "lookup", text: "SWVNAME" }],
  },
  { name: "sizes", depth: 0, list: true },
  { name: "size", depth: 1, values: [placed("SWRSIZE_SIZE(SWRSIZE)", "SWRSIZE", "SWRSIZE_SIZE")] },
  { name: "status", depth: 0 },
]

const WIDGETS = "/apis/BannerWidgetAPIs/widget-requests"

beforeEach(() => {
  server.status.index = { state: "ready", summary }
  const api = server.apis.find((a) => a.id === "BannerWidgetAPIs/widget-requests")!
  api.versions[1].lineage = { fields: 6, withLineage: 4, unsupported: 1 }
  server.fields = {
    "BannerWidgetAPIs/widget-requests": {
      "widget-requests-2.1.0": {
        fields: FIELDS,
        other: [{ schema: "OldWidget", fields: [{ name: "legacy", depth: 0, values: [placed("SWBOLDW_LEGACY", "SWBOLDW", "SWBOLDW_LEGACY")] }] }],
      },
    },
  }
})

/** The rows shown, cells joined with " | ". */
const rows = () =>
  [...page().querySelectorAll("section tbody")]
    .find((b) => b.closest("section")?.querySelector("h2")?.textContent === "Fields and lineage")!
    .querySelectorAll(":scope > tr")
const rowTexts = () => [...rows()].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent).join(" | "))

describe("the fields and their lineage", () => {
  it("sums up the version, and shows the top level with parents folded", async () => {
    await renderAt(WIDGETS)
    expect(text()).toContain("Lineage on 4 of 6 fields")
    expect(rowTexts()).toEqual([
      "id | GORGUID | GORGUID_GUID | GORGUID_GUID(LDM_NAME='widgets')",
      "owner |  |  | 3 fields, 2 with lineage",
      "sizes (list) |  |  | 1 field, 1 with lineage",
      "status | nothing published | ",
    ])
  })

  it("opens a parent, says unsupported, derived and lookups in words, and marks probable", async () => {
    await renderAt(WIDGETS)
    await click("Open owner")
    expect(rowTexts().slice(2, 5)).toEqual([
      "title | SWBWIDG | SWBWIDG_TITLEprobable | swbwidgTitle",
      "preference | Ellucian says not supported | unsupported",
      "fullName | Derived | derivedDerived logic: Joins the first and last names.Lookup: SWVNAME",
    ])
    await click("Close owner")
    expect(rows()).toHaveLength(4)
  })

  it("opens and closes everything", async () => {
    await renderAt(WIDGETS)
    await click("Open all")
    expect(rows()).toHaveLength(8)
    await click("Close all")
    expect(rows()).toHaveLength(4)
  })

  it("filters by field name or lineage, opening the parents of what matches", async () => {
    await renderAt(WIDGETS)
    await typeInto("Filter by field or lineage", "swrsize")
    expect(rowTexts().map((r) => r.split(" | ")[0])).toEqual(["sizes (list)", "size"])
    await typeInto("Filter by field or lineage", "nothing like it")
    expect(text()).toContain("No fields match.")
  })

  it("shows only fields with lineage when asked", async () => {
    await renderAt(WIDGETS)
    await choose("Only fields with lineage")
    await click("Open all")
    expect(rowTexts().map((r) => r.split(" | ")[0])).toEqual([
      "id",
      "owner",
      "title",
      "fullName",
      "sizes (list)",
      "size",
    ])
  })

  it("keeps names whole on a wide window, letting only long ones wrap at _, . or a capital", async () => {
    const long = "aVeryLongFieldNameThatGoesOnAndOn" // 33 characters
    const table = "SWBWIDGET_EXTENDED_DETAIL_HISTORY" // 33 characters
    server.fields["BannerWidgetAPIs/widget-requests"]["widget-requests-2.1.0"].fields = [
      { name: "code", depth: 0, values: [placed("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")] },
      { name: long, depth: 0, values: [placed(`${table}_X`, table, `${table}_X`)] },
    ]
    await renderAt(WIDGETS)
    const [short, longRow] = [...rows()].map((r) => [...r.querySelectorAll("td")])
    for (const cell of short.slice(0, 3)) {
      const name = cell.querySelector(".font-names")!
      expect(name.className).toContain("md:whitespace-nowrap")
      expect(name.className).not.toMatch(/(^| )break-all/)
      expect(name.querySelector("wbr")).toBeNull()
    }
    const names = longRow.slice(0, 3).map((c) => c.querySelector(".font-names")!)
    expect(names.map((n) => n.textContent)).toEqual([long, table, `${table}_X`])
    expect(names[0].innerHTML).toBe("a<wbr>Very<wbr>Long<wbr>Field<wbr>Name<wbr>That<wbr>Goes<wbr>On<wbr>And<wbr>On")
    expect(names[1].innerHTML).toBe("SWBWIDGET_<wbr>EXTENDED_<wbr>DETAIL_<wbr>HISTORY")
    for (const n of names) expect(n.className).toContain("md:w-[32ch]")
  })

  it("keeps schemas no method uses folded at the end", async () => {
    await renderAt(WIDGETS)
    expect(text()).toContain("Other schemas in the spec, not used by any method (1)")
    expect(text()).not.toContain("SWBOLDW_LEGACY")
    await click("Other schemas in the spec, not used by any method (1)")
    expect(text()).toContain("OldWidget")
    expect(text()).toContain("SWBOLDW_LEGACY")
  })

  it("splits a long top level into pages of the chosen size", async () => {
    server.fields["BannerWidgetAPIs/widget-requests"]["widget-requests-2.1.0"].fields = Array.from({ length: 45 }, (_, i) => ({ name: `field${i + 1}`, depth: 0 }))
    await renderAt(WIDGETS)
    expect(text()).toContain("1–20 of 45 top-level fields")
    expect(rows()).toHaveLength(20)
    const next = [...document.querySelectorAll<HTMLAnchorElement>('a[aria-label="Next page"]')].at(-1)!
    await act(async () => next.click())
    await settle()
    expect(text()).toContain("21–40 of 45 top-level fields")
  })

  it("says when a version has no lineage, or no fields", async () => {
    await renderAt("/apis/BannerWidgetAPIs/widget-summaries")
    expect(text()).toContain("No lineage published for this version.")
  })

  it("says when the fields can't be loaded", async () => {
    server.fields = {}
    await renderAt("/apis/BannerGadgetAPIs/gadgets")
    expect(text()).toContain("Lineage on 4 of 4 fields")
    expect(button("Open all")).toBeNull()
  })
})

describe("links inside lookups and derived logic", () => {
  const lookup = (text: string, links: Value["links"]): Value => ({ kind: "lookup", text, links })
  beforeEach(() => {
    server.fields = {
      "BannerWidgetAPIs/widget-requests": {
        "widget-requests-2.1.0": {
          fields: [
            { name: "term", depth: 0, values: [placed("SWBWIDG_TERM", "SWBWIDG", "SWBWIDG_TERM"), lookup("sxvterm", [{ at: 0, length: 7, table: "SXVTERM" }])] },
            {
              name: "college",
              depth: 0,
              values: [
                lookup("saturn,swvcoll, swvdept", [
                  { at: 7, length: 7, table: "SWVCOLL" },
                  { at: 16, length: 7, table: "SWVDEPT" },
                ]),
              ],
            },
            { name: "page", depth: 0, values: [lookup("SWAWIDG", [{ at: 0, length: 7, form: "SWAWIDG" }])] },
            { name: "gadget", depth: 0, values: [lookup("gadgets", [{ at: 0, length: 7, api: "BannerGadgetAPIs/gadgets" }])] },
            {
              name: "total",
              depth: 0,
              values: [
                ref("derived", { note: "derived" }),
                {
                  kind: "derived",
                  text: "Adds SWBWIDG_CODE to SWRCOST_AMT for the display term.",
                  links: [
                    { at: 5, length: 12, table: "SWBWIDG", column: "SWBWIDG_CODE" },
                    { at: 21, length: 7, table: "SWRCOST" },
                  ],
                },
              ],
            },
          ],
          other: [],
        },
      },
    }
  })
  /** The links in the row of the field `name`, as text → address. */
  const linksIn = (name: string) => {
    const row = [...rows()].find((r) => r.querySelector("td")?.textContent === name)!
    return [...row.querySelectorAll("td:last-child a")].map((a) => `${a.textContent} → ${a.getAttribute("href")}`)
  }

  it("links a lookup's table, keeping the text as written and the Table and Column cells as they were", async () => {
    await renderAt(WIDGETS)
    expect(rowTexts()[0]).toBe("term | SWBWIDG | SWBWIDG_TERM | SWBWIDG_TERMLookup: sxvterm")
    expect(linksIn("term")).toEqual(["sxvterm → /tables/Banner/SXVTERM"])
    expect(linksIn("college")).toEqual(["swvcoll → /tables/Banner/SWVCOLL", "swvdept → /tables/Banner/SWVDEPT"])
    expect(rowTexts()[1]).toBe("college | Lookup | Lookup: saturn,swvcoll, swvdept")
  })

  it("links a lookup to a form or an API, saying when the API's family is hidden", async () => {
    await renderAt(WIDGETS)
    expect(linksIn("page")).toEqual(["SWAWIDG → /forms/Banner/SWAWIDG"])
    expect(linksIn("gadget")).toEqual(["gadgets → /apis/BannerGadgetAPIs/gadgets"])
    expect(rowTexts()[3]).not.toContain("hidden in Settings")
  })

  it('says "hidden in Settings" after an API whose family is hidden', async () => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["BannerGadgetAPIs"]))
    await renderAt(WIDGETS)
    expect(rowTexts()[3]).toBe("gadget | Lookup | Lookup: gadgets (hidden in Settings)")
  })

  it("links derived logic's tables and columns, and nothing else", async () => {
    await renderAt(WIDGETS)
    expect(linksIn("total")).toEqual(["SWBWIDG_CODE → /tables/Banner/SWBWIDG/SWBWIDG_CODE", "SWRCOST → /tables/Banner/SWRCOST"])
    expect(rowTexts()[4]).toContain("Derived logic: Adds SWBWIDG_CODE to SWRCOST_AMT for the display term.")
  })
})
