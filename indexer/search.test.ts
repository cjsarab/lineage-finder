import { describe, expect, it } from "vitest"
import { buildSearch, type DescribedField, type SearchSource } from "./search.ts"
import { buildTables } from "./tables.ts"

const ref = (text: string, table: string, column: string) => ({ kind: "ref" as const, text, places: [{ table, column }] })

const version = (fields: DescribedField[], other: { schema: string; fields: DescribedField[] }[] = []) => ({ fields, other })

const widgets: SearchSource = {
  id: "BannerWidgetAPIs/widgets",
  folders: ["widgets-1.0.0", "widgets-2.0.0", "widgets-3.0.0"],
  fields: {
    "widgets-1.0.0": version([
      { name: "code", depth: 0, values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")], description: "Old words." },
      { name: "owner", depth: 0 },
      { name: "pidm", depth: 1, values: [ref("SWBWIDG_PIDM", "SWBWIDG", "SWBWIDG_PIDM")] },
    ]),
    // 2.0.0 has no fields in the catalog.
    "widgets-3.0.0": version(
      [
        { name: "code", depth: 0, values: [ref("SWBWIDG_CODE", "SWBWIDG", "SWBWIDG_CODE")], description: "New words." },
        // Same path, other lineage: a field of its own.
        { name: "owner", depth: 0 },
        { name: "pidm", depth: 1, values: [ref("SWBOWNR_PIDM", "SWBOWNR", "SWBOWNR_PIDM")] },
      ],
      [{ schema: "OldWidget", fields: [{ name: "legacy", depth: 0, values: [ref("SWBOLDW_LEGACY", "SWBOLDW", "SWBOLDW_LEGACY")] }] }],
    ),
  },
}
const empty: SearchSource = { id: "BannerWidgetAPIs/blanks", folders: ["blanks-1.0.0"], fields: {} }

const tables = buildTables(
  [widgets].map((s) => ({ id: s.id, family: "BannerWidgetAPIs", folders: s.folders, fields: s.fields })),
)
const { search, descriptions } = buildSearch([widgets, empty], tables)

describe("buildSearch", () => {
  it("merges a field across versions when its path and lineage are the same, noting which versions have it", () => {
    const fields = search.apis[0].fields
    expect(fields.map((f) => `${f.schema ?? ""}:${f.path} ${f.v.join(",")} ${f.values?.[0].text ?? "-"}`)).toEqual([
      ":code 0,2 SWBWIDG_CODE",
      ":owner 0,2 -",
      ":owner.pidm 0 SWBWIDG_PIDM",
      ":owner.pidm 2 SWBOWNR_PIDM",
      "OldWidget:legacy 2 SWBOLDW_LEGACY",
    ])
  })

  it("leaves out APIs with no fields", () => {
    expect(search.apis.map((a) => a.id)).toEqual(["BannerWidgetAPIs/widgets"])
  })

  it("keeps descriptions apart, in the fields' order, with the newest version's words", () => {
    expect(descriptions).toEqual({ "BannerWidgetAPIs/widgets": ["New words.", null, null, null, null] })
    expect(JSON.stringify(search)).not.toContain("words")
  })

  it("lists every table with its columns and the APIs using each", () => {
    const swbwidg = search.tables.find((t) => t.name === "SWBWIDG")
    expect(swbwidg).toEqual({
      product: "Banner",
      name: "SWBWIDG",
      apis: ["BannerWidgetAPIs/widgets"],
      columns: [
        { name: "SWBWIDG_CODE", apis: [0] },
        { name: "SWBWIDG_PIDM", apis: [0] },
      ],
    })
    expect(search.tables.map((t) => t.name)).toEqual(["SWBOLDW", "SWBOWNR", "SWBWIDG"])
  })
})
