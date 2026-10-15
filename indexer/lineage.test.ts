// Lineage on fields. Made-up specs and values only.
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { classify, coverage, extract, extractFields, keyBlockFields, LINEAGE_KEYS, makeLinker, makeResolver, type Field, type Link, type RawValue } from "./lineage.ts"
import { readSpecText, type Spec } from "./read-spec.ts"

function load(relPath: string): Spec {
  const r = readSpecText(fs.readFileSync(path.join(import.meta.dirname, "test-catalog", relPath), "utf8"))
  if (r.status === "unreadable") throw new Error(r.reason)
  return r.data
}

const ref = (text: string): RawValue => ({ kind: "ref", text })

describe("lineage keys", () => {
  it("maps all 20 spellings found in the catalog", () => {
    const kinds = Object.values(LINEAGE_KEYS)
    expect(kinds).toHaveLength(20)
    expect(kinds.filter((k) => k === "ref")).toHaveLength(9)
    expect(kinds.filter((k) => k === "lookup")).toHaveLength(7)
    expect(kinds.filter((k) => k === "derived")).toHaveLength(4)
  })
})

describe("value formats and tables", () => {
  it.each([
    ["SWBSPRK_CODE", "banner-table_column", [{ table: "SWBSPRK", column: "SWBSPRK_CODE", how: "prefix" }]],
    ["SWBSPRK_CODE(SWBSPRK)", "banner-column(table)", [{ table: "SWBSPRK", column: "SWBSPRK_CODE", how: "brackets" }]],
    ["fullname(contact)", "field(container)", [{ table: "CONTACT", column: "FULLNAME", how: "brackets" }]],
    ["SWRGRNT.AWARD_AMT", "dotted-name", [{ table: "SWRGRNT", column: "AWARD_AMT", how: "dotted" }]],
    ["swbsprk", "bare-table", [{ table: "SWBSPRK", column: null, how: "bare" }]],
    ["GORGUID_GUID(LDM_NAME='sprockets')", "guid-lookup", [{ table: "GORGUID", column: "GORGUID_GUID", how: "guid" }]],
    [
      "SWBSPRK_CODE or SWRSIZE_SIZE",
      "alternatives",
      [
        { table: "SWBSPRK", column: "SWBSPRK_CODE", how: "prefix" },
        { table: "SWRSIZE", column: "SWRSIZE_SIZE", how: "prefix" },
      ],
    ],
    ["unsupported", "unsupported", []],
    ["Derived", "derived", []],
    ["id", "other", []],
    ["see the notes for this", "free-text", []],
  ])("%s is %s", (value, category, found) => {
    expect(classify(value)).toBe(category)
    expect(extract(value)).toEqual(found)
  })

  it("reads camelCase names only against tables already known", () => {
    expect(classify("swbsprkTitle")).toBe("camelCase-name")
    expect(extract("swbsprkTitle")).toEqual([])
    expect(extract("swbsprkTitle", new Set(["SWBSPRK"]))).toEqual([{ table: "SWBSPRK", column: "SWBSPRK_TITLE", how: "camel" }])
  })
})

describe("makeResolver: the false-table rule and probable", () => {
  const resolve = makeResolver(["SWBSPRK_CODE", "BATCH_ID", "MENU_URL", "SWRSIZE_SIZE(SWRSIZE)", "RLVL_CODE", "rlvl", "KEYBLCK_TERM", "SWRGRNT.AWARD_AMT"])

  it("states what the catalog states", () => {
    expect(resolve(ref("SWBSPRK_CODE"), false)).toEqual({ ...ref("SWBSPRK_CODE"), places: [{ table: "SWBSPRK", column: "SWBSPRK_CODE" }] })
  })

  it("drops a table found only by its prefix unless it has Banner's 7-character shape or another rule names it", () => {
    expect(resolve(ref("BATCH_ID"), false)).toEqual(ref("BATCH_ID"))
    expect(resolve(ref("MENU_URL"), false)).toEqual(ref("MENU_URL"))
    expect(resolve(ref("RLVL_CODE"), false).places).toEqual([{ table: "RLVL", column: "RLVL_CODE" }]) // named bare elsewhere
  })

  it("never takes a key block for a table", () => {
    expect(resolve(ref("KEYBLCK_TERM"), false)).toEqual(ref("KEYBLCK_TERM"))
  })

  it("marks camelCase and TABLE.COLUMN as probable, but not Colleague's FILE.FIELD", () => {
    expect(resolve(ref("swbsprkTitle"), false).places).toEqual([{ table: "SWBSPRK", column: "SWBSPRK_TITLE", probable: true }])
    expect(resolve(ref("SWRGRNT.AWARD_AMT"), false).places).toEqual([{ table: "SWRGRNT", column: "AWARD_AMT", probable: true }])
    expect(resolve(ref("WIDGET.CODE"), true).places).toEqual([{ table: "WIDGET", column: "CODE" }])
  })

  it("says unsupported and derived in words, and leaves lookups and derived logic as written", () => {
    expect(resolve(ref(" unsupported "), false)).toEqual({ ...ref(" unsupported "), note: "unsupported" })
    expect(resolve(ref("derived"), false)).toEqual({ ...ref("derived"), note: "derived" })
    expect(resolve({ kind: "lookup", text: "SWVNAME" }, false)).toEqual({ kind: "lookup", text: "SWVNAME" })
  })
})

describe("makeResolver: names that aren't tables", () => {
  const resolve = makeResolver([
    "SWAWIDG_KEY_BLOCK",
    "swawidgTermCode",
    "SWACRSE_CRSE_NUMB",
    "SWBWIDG_CODE",
    "swbwidgTitle",
    "key_block2",
    "swbagrl_ctrl_block",
    "SWBAGRL_CTRL_BLOCK",
    "SWBAGRL_TERM",
    "CLASSES",
  ])

  it("never takes a Banner name with a form's third letter (A, I, M, Q) for a table, nor guesses its columns", () => {
    expect(resolve(ref("SWAWIDG_KEY_BLOCK"), false)).toEqual(ref("SWAWIDG_KEY_BLOCK"))
    expect(resolve(ref("SWACRSE_CRSE_NUMB"), false)).toEqual(ref("SWACRSE_CRSE_NUMB"))
    expect(resolve(ref("swawidgTermCode"), false)).toEqual(ref("swawidgTermCode"))
    expect(resolve(ref("swbwidgTitle"), false).places).toEqual([{ table: "SWBWIDG", column: "SWBWIDG_TITLE", probable: true }])
  })

  it("applies the form-letter rule to Banner names only: Colleague files and other products keep theirs", () => {
    expect(resolve(ref("CLASSES"), true).places).toEqual([{ table: "CLASSES" }])
    expect(resolve(ref("CLASSES"), false, false).places).toEqual([{ table: "CLASSES" }])
    expect(resolve(ref("CLASSES"), false).places).toBeUndefined()
  })

  it("never takes a key or control block for a table or column", () => {
    expect(resolve(ref("key_block2"), false)).toEqual(ref("key_block2"))
    expect(resolve(ref("swbagrl_ctrl_block"), false)).toEqual(ref("swbagrl_ctrl_block"))
    expect(resolve(ref("SWBAGRL_CTRL_BLOCK"), false)).toEqual(ref("SWBAGRL_CTRL_BLOCK"))
    expect(resolve(ref("SWBAGRL_TERM"), false).places).toEqual([{ table: "SWBAGRL", column: "SWBAGRL_TERM" }])
  })
})

describe("makeResolver: a form's on-screen items and words aren't tables", () => {
  const banner = [
    "DISPLAY_TEXT_IND",
    "display",
    "displayPropCode",
    "amount",
    "head1",
    "sxvterm",
    "GENIDEN_LAST_NAME",
    "FWBPOHDEA_DEST_DESC(FWBPOHDEA)",
    "FWBPOHDEA_CODE",
    "txgbwrul",
    "TXGBWRUL.NAME",
    "txgbparm",
    "TXGBPARM_NAME",
    "name",
    "SWBWIDG_CODE",
  ]
  const resolve = makeResolver([...banner, "PERSON", "PERSON.NAME", "TERMS"], banner)

  it("takes a Banner word written alone for a table only if it has a table's third letter (B, R, V, T)", () => {
    expect(resolve(ref("amount"), false)).toEqual(ref("amount"))
    expect(resolve(ref("head1"), false)).toEqual(ref("head1"))
    expect(resolve(ref("name"), false)).toEqual(ref("name"))
    expect(resolve(ref("sxvterm"), false).places).toEqual([{ table: "SXVTERM" }])
  })

  it("…or some value writes it as a table: COLUMN(TABLE), TABLE.COLUMN, or TABLE_COLUMN for a name of another length", () => {
    expect(resolve(ref("txgbwrul"), false).places).toEqual([{ table: "TXGBWRUL" }])
    expect(resolve(ref("FWBPOHDEA_CODE"), false).places).toEqual([{ table: "FWBPOHDEA", column: "FWBPOHDEA_CODE" }])
    // An 8-letter Web Tailor table, written alone and as TABLE_COLUMN: kept, as the database check found it real.
    expect(resolve(ref("txgbparm"), false).places).toEqual([{ table: "TXGBPARM" }])
    expect(resolve(ref("TXGBPARM_NAME"), false).places).toEqual([{ table: "TXGBPARM", column: "TXGBPARM_NAME" }])
  })

  it("takes a 7-letter Banner name found only as NAME_COLUMN for a table only with a table's third letter", () => {
    expect(resolve(ref("DISPLAY_TEXT_IND"), false)).toEqual(ref("DISPLAY_TEXT_IND"))
    expect(resolve(ref("GENIDEN_LAST_NAME"), false)).toEqual(ref("GENIDEN_LAST_NAME")) // a real table, the agreed cost
    expect(resolve(ref("SWBWIDG_CODE"), false).places).toEqual([{ table: "SWBWIDG", column: "SWBWIDG_CODE" }])
  })

  it("makes no guessed columns from the names it drops", () => {
    expect(resolve(ref("displayPropCode"), false)).toEqual(ref("displayPropCode"))
    expect(resolve(ref("swbwidgTitle"), false).places).toEqual([{ table: "SWBWIDG", column: "SWBWIDG_TITLE", probable: true }])
  })

  it("leaves other products' names as they were", () => {
    expect(resolve(ref("TERMS"), true).places).toEqual([{ table: "TERMS" }])
    expect(resolve(ref("PERSON"), true).places).toEqual([{ table: "PERSON" }])
  })
})

describe("makeLinker: names in lookups and derived logic", () => {
  const linker = () =>
    makeLinker({
      tables: new Map([
        ["Banner", new Set(["SXVTERM", "SWVCOLL", "SWBWREQ", "SWVWTYP", "CURRENT"])],
        ["Colleague", new Set(["PERSON", "TERMS"])],
      ]),
      columns: new Map([["Banner/SXVTERM", new Set(["SXVTERM_CODE"])]]),
      forms: new Map([["Banner", new Set(["SWAWIDG"])]]),
      apis: new Map([
        ["Banner", ["BannerGizmoAPIs/persons", "BannerGizmoAPIs/sprocket-methods", "BannerGizmoAPIs/sites", "BannerOtherAPIs/sites", "BannerGizmoAPIs/periods", "BannerOtherAPIs/periods"]],
      ]),
    })
  // Each link as the text it covers, then what it opens.
  const shown = (text: string, links: Link[]) =>
    links.map((l) => `${text.slice(l.at, l.at + l.length)} → ${l.column ?? l.table ?? l.form ?? l.api}`)
  const lookup = (text: string, family = "BannerBusAPIs", product = "Banner") => shown(text, linker().lookup(text, product, family))
  const derived = (text: string, product = "Banner") => shown(text, linker().derived(text, product))

  it("links a lookup to the table it names, in any case", () => {
    expect(lookup("sxvterm")).toEqual(["sxvterm → SXVTERM"])
    expect(lookup("SXVTERM_CODE")).toEqual(["SXVTERM_CODE → SXVTERM"])
  })

  it("links each table in a list, skipping a schema owner, and leaves the separators as written", () => {
    expect(lookup("saturn,sxvterm, swvcoll")).toEqual(["sxvterm → SXVTERM", "swvcoll → SWVCOLL"])
    expect(lookup("saturn.sxvterm or 'swvcoll'")).toEqual(["sxvterm → SXVTERM", "swvcoll → SWVCOLL"])
  })

  it("links a form, and an API: of the same family, else the only one of the product with that name", () => {
    expect(lookup("SWAWIDG")).toEqual(["SWAWIDG → SWAWIDG"])
    expect(lookup("persons", "BannerGizmoAPIs")).toEqual(["persons → BannerGizmoAPIs/persons"])
    expect(lookup("Sprocket_Methods", "BannerGizmoAPIs")).toEqual(["Sprocket_Methods → BannerGizmoAPIs/sprocket-methods"])
    expect(lookup("sites", "BannerOtherAPIs")).toEqual(["sites → BannerOtherAPIs/sites"])
    // From another family: the one "persons" in Banner; two "sites", so neither.
    expect(lookup("persons", "BannerErpAPIs")).toEqual(["persons → BannerGizmoAPIs/persons"])
    expect(lookup("sites", "BannerErpAPIs")).toEqual([])
    expect(lookup("persons", "ColleagueAPIs", "Colleague")).toEqual([])
  })

  it("links a Banner name with a table's shape that no lineage names, as a table only lookups name", () => {
    const l = linker()
    expect(shown("gwbpval", l.lookup("gwbpval", "Banner", "BannerBusAPIs"))).toEqual(["gwbpval → GWBPVAL"])
    expect(l.lookupsOnly.get("Banner")).toEqual(new Set(["GWBPVAL"]))
    // …then derived logic links it too.
    expect(shown("From GWBPVAL.", l.derived("From GWBPVAL.", "Banner"))).toEqual(["GWBPVAL → GWBPVAL"])
    // Not a form's name, an API's name (PERIODS has R third), nor in other products.
    expect(lookup("SWAPRLE")).toEqual([])
    expect(lookup("periods", "BannerErpAPIs")).toEqual([]) // two APIs called that: no link, and not a table
    expect(lookup("GWBPVAL", "ColleagueAPIs", "Colleague")).toEqual([])
  })

  it("links the table names in SQL written into a lookup, and leaves the SQL plain", () => {
    expect(lookup("select sxvterm_code from sxvterm where x = 1")).toEqual(["sxvterm_code → SXVTERM_CODE", "sxvterm → SXVTERM"])
  })

  it("links other products' lookups to their own tables", () => {
    expect(lookup("PERSON", "ColleagueAPIs", "Colleague")).toEqual(["PERSON → PERSON"])
  })

  it("links derived logic's tables, a known column, and an unknown column's table part", () => {
    expect(derived("Adds SXVTERM_CODE to SWBWREQ_FEE_AMT from swvwtyp.")).toEqual([
      "SXVTERM_CODE → SXVTERM_CODE",
      "SWBWREQ → SWBWREQ",
      "swvwtyp → SWVWTYP",
    ])
  })

  it("doesn't link ordinary words in derived logic, nor any in other products", () => {
    expect(derived("The CURRENT term, for display.")).toEqual([])
    expect(derived("Reads PERSON and TERMS.", "Colleague")).toEqual([])
  })
})

describe("keyBlockFields: the form's key-block inputs", () => {
  it("names the fields of every schema whose lineage is a key block, nested ones and list items too", () => {
    expect(keyBlockFields(load("BannerWidgetAPIs/flanges-1.0.0/flanges.yaml"))).toEqual(new Set(["term"]))
    expect(
      keyBlockFields({
        components: {
          schemas: {
            Outer: { type: "object", properties: { inner: { "x-lineageReferenceObject": "swawidg_key_block", properties: { id: {}, termCode: {} } } } },
            Listed: { type: "array", items: { "x-lineageReferenceObject": "KEY_BLOCK2", properties: { crn: {} } } },
            Plain: { "x-lineageReferenceObject": "SWBWIDG", properties: { code: {} } },
          },
        },
      }),
    ).toEqual(new Set(["id", "termCode", "crn"]))
  })

  it("gives nothing for a spec without key blocks", () => {
    expect(keyBlockFields(load("BannerWidgetAPIs/sprockets-1.0.0/sprockets.yaml"))).toEqual(new Set())
  })
})

describe("extractFields: the fields each method sends and returns", () => {
  const { fields, other } = extractFields(load("BannerWidgetAPIs/sprockets-1.0.0/sprockets.yaml"))
  const outline = fields.map((f) => `${"  ".repeat(f.depth)}${f.name}${f.list ? "[]" : ""}`)
  const field = (name: string) => fields.find((f) => f.name === name)

  it("follows references (to schemas, request bodies and responses), lists and allOf, stopping at a loop", () => {
    expect(outline).toEqual([
      "id",
      "code",
      "owner",
      "  pidm",
      "  title",
      "  preference",
      "  fullName",
      "  batch",
      "  keyed",
      "  grant",
      "  either",
      "  listed",
      "  plain",
      "sizes[]",
      "  size",
      "tags[]",
      "status",
      "parent",
      "createdBy",
    ])
  })

  it("keeps every value as written, under every key spelling, and a YAML list one value per item", () => {
    expect(field("size")?.values).toEqual([ref("SWRSIZE_SIZE(SWRSIZE)")])
    expect(field("pidm")?.values).toEqual([ref("SWBSPRK_PIDM")])
    expect(field("tags")?.values).toEqual([ref("swbtags")])
    expect(field("listed")?.values).toEqual([ref("SWBSPRK_CODE"), ref("SWBSPRK_PIDM")])
    expect(field("fullName")?.values).toEqual([
      ref("derived"),
      { kind: "derived", text: "Joins the first and last names." },
      { kind: "lookup", text: "SWVNAME" },
    ])
    expect(field("status")?.values).toBeUndefined()
  })

  it("leaves a referenced schema's own top-level lineage (its main table) off the field", () => {
    expect(field("parent")?.values).toBeUndefined()
  })

  it("leaves out error responses, and lists schemas no method uses only when they hold lineage", () => {
    expect(field("message")).toBeUndefined()
    expect(other).toEqual([{ schema: "OldSprocket", fields: [{ name: "legacy", depth: 0, values: [ref("SWBOLDS_LEGACY")] }] }])
  })

  it("collects the base table: lineage at the top of a whole body's schema, its list's items or allOf parts", () => {
    expect(extractFields(load("BannerWidgetAPIs/sprockets-1.0.0/sprockets.yaml")).base).toEqual([ref("swbsprk")])
    // Each written form once; not a schema nested in a field (Owner), an error response's (ErrorBlock) or an unused one.
    expect(extractFields(load("BannerWidgetAPIs/flanges-1.0.0/flanges.yaml")).base).toEqual([ref("swbflng"), ref("SWBFLNG"), ref("SWRFLDT"), ref("KEY_BLOCK"), ref("SWAFLNG")])
  })

  it("gives nothing for a spec without paths", () => {
    expect(extractFields({})).toEqual({ fields: [], other: [], base: [] })
  })
})

describe("coverage", () => {
  it("counts the fields at the ends of branches: with lineage, and with only 'unsupported'", () => {
    const f = (name: string, depth: number, notes?: ("unsupported" | null)[]): Field => ({
      name,
      depth,
      ...(notes ? { values: notes.map((n) => ({ kind: "ref" as const, text: "x", ...(n ? { note: n } : {}) })) } : {}),
    })
    const fields = [f("a", 0, [null]), f("b", 0), f("c", 0, [null]), f("c1", 1, ["unsupported"]), f("c2", 1, ["unsupported", null]), f("d", 0)]
    expect(coverage(fields)).toEqual({ fields: 5, withLineage: 2, unsupported: 1 })
  })
})
