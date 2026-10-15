// Comparing two versions of an API. Made-up APIs only.
import { describe, expect, it } from "vitest"
import { fakeApi } from "@/test-support/fake-app"
import { chooseComparison, compareDetails, compareFields, compareHeaders, compareParameters, comparePath, startingPair } from "./compare"
import type { ApiVersion, Field, MethodParameters, Value } from "./server"

const ref = (text: string): Value => ({ kind: "ref", text })
const f = (name: string, depth: number, values?: Value[], list?: true): Field => ({ name, depth, ...(values ? { values } : {}), ...(list ? { list } : {}) })
/** Each row as "<mark> <path>[ (notes)]", the way the page reads it; unchanged rows as "= <path>". */
const rows = (a: Field[], b: Field[]) =>
  compareFields(a, b).map((r) => `${r.mark ?? "="} ${r.path}${r.notes.length ? ` (${r.notes.join(", ")})` : ""}${r.movedFrom !== undefined ? ` from ${r.movedFrom || "the top"}` : ""}`)

describe("fields", () => {
  it("marks fields added and removed, keeping a removed one where it was", () => {
    const a = [f("id", 0), f("code", 0), f("owner", 0), f("name", 1)]
    const b = [f("id", 0), f("owner", 0), f("name", 1), f("title", 1)]
    expect(rows(a, b)).toEqual(["= id", "removed code", "= owner", "= owner.name", "added owner.title"])
  })

  it("marks lineage added, removed and changed", () => {
    const a = [f("id", 0), f("code", 0, [ref("STVWIDG_CODE")]), f("desc", 0, [ref("STVWIDG_DESC")])]
    const b = [f("id", 0, [ref("GORGUID_GUID")]), f("code", 0), f("desc", 0, [ref("STVWIDG_LONG_DESC")])]
    expect(rows(a, b)).toEqual(["changed id (lineage added)", "changed code (lineage removed)", "changed desc (lineage changed)"])
  })

  it("ignores runs of spaces and tabs in lineage, but not line breaks, capitals or quotes", () => {
    const was = "A record in GORGUID where GORGUID_LDM_NAME='widgets' and   GORGUID_DOMAIN_KEY = STVWIDG_CODE"
    const a = [f("id", 0, [ref(was)]), f("b", 0, [ref("x y")]), f("c", 0, [ref("STVWIDG_CODE")]), f("d", 0, [ref("'a'")])]
    const b = [
      f("id", 0, [ref(was.replace("and   ", "and\t"))]),
      f("b", 0, [ref("x\ny")]),
      f("c", 0, [ref("stvwidg_code")]),
      f("d", 0, [ref('"a"')]),
    ]
    expect(rows(a, b)).toEqual(["= id", "changed b (lineage changed)", "changed c (lineage changed)", "changed d (lineage changed)"])
  })

  it("compares a lookup with a reference of the same words as different lineage", () => {
    const a = [f("term", 0, [{ kind: "lookup", text: "SXVTERM" }])]
    const b = [f("term", 0, [ref("SXVTERM")])]
    expect(rows(a, b)).toEqual(["changed term (lineage changed)"])
  })

  it("says when a field becomes or stops being a list", () => {
    expect(rows([f("tags", 0), f("codes", 0, undefined, true)], [f("tags", 0, undefined, true), f("codes", 0)])).toEqual([
      "changed tags (now a list)",
      "changed codes (no longer a list)",
    ])
  })

  it("marks a field moved when its name is once among the removed and once among the added", () => {
    const a = [f("person", 0), f("phone", 1, [ref("SWRTELE_PHONE")]), f("contact", 0)]
    const b = [f("person", 0), f("contact", 0), f("phone", 1, [ref("SWRTELE_PHONE")])]
    expect(rows(a, b)).toEqual(["= person", "= contact", "moved contact.phone from person"])
  })

  it("says moved from the top level, and still notes a lineage change on a moved field", () => {
    const a = [f("phone", 0, [ref("SWRTELE_PHONE")]), f("contact", 0)]
    const b = [f("contact", 0), f("phone", 1, [ref("SWRTELE_PHONE_NUMBER")])]
    expect(rows(a, b)).toEqual(["= contact", "moved contact.phone (lineage changed) from the top"])
  })

  it("doesn't call a common name moved when it's removed or added more than once", () => {
    const a = [f("a", 0), f("id", 1), f("b", 0), f("id", 1)]
    const b = [f("c", 0), f("id", 1)]
    expect(rows(a, b)).toEqual(["added c", "added c.id", "removed a", "removed a.id", "removed b", "removed b.id"])
  })

  it("lists every field once even if the index repeats a path", () => {
    expect(rows([f("id", 0)], [f("id", 0), f("id", 0)])).toEqual(["= id"])
  })
})

const params = (method: string, path: string, ...p: [name: string, where: string, required: boolean, values?: Value[]][]): MethodParameters => ({
  method,
  path,
  parameters: p.map(([name, where, required, values]) => ({ name, in: where, required, description: null, ...(values ? { values } : {}) })),
})
const groups = (a: MethodParameters[], b: MethodParameters[]) =>
  compareParameters(a, b).map(
    (g) =>
      `${g.method} ${g.path}${g.pathWas ? ` (was ${g.pathWas})` : ""}: ${g.rows.map((r) => `${r.mark ?? "="} ${r.name}${r.notes.length ? ` (${r.notes.join(", ")})` : ""}`).join("; ")}`,
  )

describe("query parameters", () => {
  it("marks parameters added, removed and changed, per method, in the API page's method order", () => {
    const a = [
      params("POST", "/api/widgets", ["dryRun", "query", false]),
      params("GET", "/api/widgets", ["termCode", "query", false], ["limit", "query", false], ["old", "query", false]),
    ]
    const b = [
      params("GET", "/api/widgets", ["termCode", "query", true], ["limit", "query", false], ["campus", "query", false]),
      params("POST", "/api/widgets", ["dryRun", "query", false]),
    ]
    expect(groups(a, b)).toEqual([
      "GET /api/widgets: changed termCode (now required); = limit; added campus; removed old",
      "POST /api/widgets: = dryRun",
    ])
  })

  it("notes lineage changes and a parameter no longer required", () => {
    const a = [params("GET", "/api/widgets", ["code", "query", true, [ref("STVWIDG_CODE")]])]
    const b = [params("GET", "/api/widgets", ["code", "query", false, [ref("STVWIDG_CODE_NEW")]])]
    expect(groups(a, b)).toEqual(["GET /api/widgets: changed code (no longer required, lineage changed)"])
  })

  it("matches a method whose address differs only in its version number, and says what it was", () => {
    const a = [params("GET", "/api/v1/widgets", ["code", "query", false])]
    const b = [params("GET", "/api/v2/widgets", ["code", "query", false])]
    expect(groups(a, b)).toEqual(["GET /api/v2/widgets (was /api/v1/widgets): = code"])
  })

  it("keeps two addresses with the same verb apart", () => {
    const a = [params("POST", "/api/widgets", ["a", "query", false]), params("POST", "/qapi/widgets", ["b", "query", false])]
    const b = [params("POST", "/api/widgets", ["a", "query", false])]
    expect(groups(a, b)).toEqual(["POST /api/widgets: = a", "POST /qapi/widgets: removed b"])
  })

  it("tells a path parameter from a query parameter of the same name", () => {
    expect(groups([params("GET", "/api/widgets/{id}", ["id", "query", false])], [params("GET", "/api/widgets/{id}", ["id", "path", true])])).toEqual([
      "GET /api/widgets/{id}: added id; removed id",
    ])
  })

  it("leaves headers out", () => {
    expect(groups([params("GET", "/api/widgets", ["Accept", "header", false])], [params("GET", "/api/widgets", ["limit", "query", false])])).toEqual([
      "GET /api/widgets: added limit",
    ])
  })
})

describe("headers", () => {
  it("lists headers added and removed, by method, ignoring capitals, spaces, hyphens and underscores", () => {
    const a = [
      params("GET", "/api/widgets", ["accept", "header", false], ["X-Old", "header", false]),
      params("POST", "/api/widgets", ["content type", "header", false]),
    ]
    const b = [
      params("GET", "/api/widgets", ["Accept", "header", false]),
      params("POST", "/api/widgets", ["Content-Type", "header", false], ["X-Request-Id", "header", false]),
      params("PUT", "/api/widgets", ["X-Request-Id", "header", false]),
    ]
    const h = compareHeaders(a, b)
    expect(h.line).toBe("X-Request-Id added (POST, PUT) · X-Old removed (GET)")
    expect(h.writtenDifferently).toEqual([
      { name: "Accept", was: "accept" },
      { name: "Content-Type", was: "content type" },
    ])
  })

  it("has no line when the headers are the same", () => {
    expect(compareHeaders([params("GET", "/api/widgets", ["Accept", "header", false])], [params("GET", "/api/widgets", ["ACCEPT", "header", false])]).line).toBeNull()
  })
})

/** A version with the details that are compared; everything else as fakeApi makes it. */
function version(key: string, o: Partial<{ release: string | null; beta: boolean; deprecatedOn: string | null; sunsetOn: string | null; baseTables: string[]; methods: string[] }> = {}): ApiVersion {
  const v = structuredClone(fakeApi("BannerWidgetAPIs", "widgets", { versions: [key] }).versions[0])
  Object.assign(v.details!, {
    releaseStatus: o.release === undefined ? "ga" : o.release,
    beta: o.beta ?? false,
    deprecatedOn: o.deprecatedOn ?? null,
    sunsetOn: o.sunsetOn ?? null,
    methods: (o.methods ?? []).map((m) => ({ method: m.split(" ")[0], path: m.split(" ")[1], summary: null, permissions: [] })),
  })
  v.baseTables = o.baseTables ?? []
  return v
}

describe("details", () => {
  it("lists only what changed, each as now and was, in the Details box's order", () => {
    const a = version("1.0.0", { release: "beta", beta: true, baseTables: ["STVWIDG"] })
    const b = version("2.0.0", { deprecatedOn: "2026-01-01", sunsetOn: "2027-01-01", baseTables: ["STVWIDG", "SWBWIDG"] })
    expect(compareDetails(a, b).changes).toEqual([
      { label: "Base tables", was: "STVWIDG", now: "STVWIDG, SWBWIDG" },
      { label: "Status", was: "Beta", now: "Released" },
      { label: "Deprecated on", was: "none", now: "2026-01-01" },
      { label: "Sunset on", was: "none", now: "2027-01-01" },
    ])
  })

  it("lists methods added and removed, matched by verb and address", () => {
    const a = version("1.0.0", { methods: ["GET /api/widgets", "DELETE /api/widgets/{id}"] })
    const b = version("2.0.0", { methods: ["GET /api/widgets", "PUT /api/widgets/{id}"] })
    expect(compareDetails(a, b)).toMatchObject({ methodsAdded: ["PUT /api/widgets/{id}"], methodsRemoved: ["DELETE /api/widgets/{id}"] })
  })

  it("has nothing to say about identical versions", () => {
    expect(compareDetails(version("1.0.0"), version("1.1.0"))).toEqual({ changes: [], methodsAdded: [], methodsRemoved: [] })
  })
})

describe("which versions", () => {
  const api = fakeApi("BannerWidgetAPIs", "widgets", { versions: ["1.0.0", "2.0.0", "3.0.0", "4.0.0"] })
  const keys = (c: ReturnType<typeof chooseComparison>) => `${c.from.version} → ${c.to.version}${c.problem ? `: ${c.problem}` : ""}`

  it("starts on the newest and the one before it", () => {
    expect(keys(chooseComparison(api, null, null))).toBe("3.0.0 → 4.0.0")
  })

  it("takes the versions the address asks for", () => {
    expect(keys(chooseComparison(api, "1.0.0", "3.0.0"))).toBe("1.0.0 → 3.0.0")
  })

  it("takes the one before To when From is missing, and the newest when To is", () => {
    expect(keys(chooseComparison(api, null, "2.0.0"))).toBe("1.0.0 → 2.0.0")
    expect(keys(chooseComparison(api, "2.0.0", null))).toBe("2.0.0 → 4.0.0")
  })

  it("says so, and shows the newest pair, when the address asks for a version the API doesn't have", () => {
    expect(keys(chooseComparison(api, "1.0.0", "9.9.9"))).toBe("3.0.0 → 4.0.0: This API has no version 9.9.9.")
  })

  it("only compares an older version with a newer one", () => {
    expect(keys(chooseComparison(api, "3.0.0", "2.0.0"))).toBe("3.0.0 → 4.0.0: Version 3.0.0 isn't older than 2.0.0.")
    expect(keys(chooseComparison(api, "2.0.0", "2.0.0"))).toBe("3.0.0 → 4.0.0: Version 2.0.0 isn't older than 2.0.0.")
  })

  it("opens from the API page on the version shown and the one before it, or the one after the oldest", () => {
    expect(startingPair(api, api.versions[2])).toEqual(["2.0.0", "3.0.0"])
    expect(startingPair(api, api.versions[0])).toEqual(["1.0.0", "2.0.0"])
  })

  it("has an address of its own", () => {
    expect(comparePath(api, "1.0.0", "2.0.0")).toBe("/apis/BannerWidgetAPIs/widgets/compare?from=1.0.0&to=2.0.0")
  })
})
