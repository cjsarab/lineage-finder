import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { extractDetails, extractParameters, parsePermissions } from "./extract.ts"
import { readSpecText, type Spec } from "./read-spec.ts"

function load(relPath: string): Spec {
  const r = readSpecText(fs.readFileSync(path.join(import.meta.dirname, "test-catalog", relPath), "utf8"))
  if (r.status === "unreadable") throw new Error(r.reason)
  return r.data
}

const info = (fields: Record<string, unknown>): Spec => ({ info: fields, paths: {} })

describe("extractDetails: info", () => {
  it("reads the details shown for an API version", () => {
    expect(extractDetails(load("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml"), "1.2.0")).toMatchObject({
      title: "widgets",
      description: "Made-up widgets API used to test the indexer.",
      specVersion: "1.2.0",
      apiType: "bus-poc",
      releaseStatus: "ga",
      sourceSystem: "banner",
      sourceDomain: "Student",
      sourceName: "SWAWIDG",
      sourceTitle: "Widget Maintenance",
      audience: "public",
      deprecatedOn: null,
      sunsetOn: null,
    })
  })

  it("reads deprecation and sunset dates", () => {
    expect(extractDetails(load("BannerWidgetAPIs/pulleys-1.0.0/pulleys.yaml"), "1.0.0")).toMatchObject({
      deprecatedOn: "2019-06-30",
      sunsetOn: "2019-12-31",
    })
  })

  it("treats missing, empty and non-text values as absent", () => {
    const d = extractDetails(info({ title: null, description: { nested: true }, "x-audience": "" }), "1.0.0")
    expect(d).toMatchObject({ title: null, description: null, audience: null, specVersion: null })
  })

  it("copes with a spec that has no info or paths at all", () => {
    expect(extractDetails({ openapi: "3.0.0" }, "1.0.0")).toMatchObject({ title: null, methods: [] })
  })
})

describe("extractDetails: beta", () => {
  it("is beta when the spec's version ends -beta", () => {
    expect(extractDetails(info({ version: "1.0.0-beta" }), "1.0.0").beta).toBe(true)
  })

  it("is beta when the release status says so", () => {
    expect(extractDetails(info({ version: "1.0.0", "x-release-status": "beta" }), "1.0.0").beta).toBe(true)
  })

  it("is not beta otherwise", () => {
    expect(extractDetails(info({ version: "1.0.0", "x-release-status": "ga" }), "1.0.0").beta).toBe(false)
  })
})

describe("extractDetails: version disagreements", () => {
  const differs = (specVersion: unknown, folderVersion: string) =>
    extractDetails(info({ version: specVersion }), folderVersion).versionDiffers

  it("agrees when the numbers match, once padded", () => {
    expect(differs("1.2.0", "1.2.0")).toBe(false)
    expect(differs("6.0", "6.0.0")).toBe(false)
  })

  it("agrees when the spec only adds -beta", () => {
    expect(differs("1.0.0-beta", "1.0.0")).toBe(false)
  })

  it("differs when the numbers differ, with or without -beta", () => {
    expect(differs("1.0.0", "1.1.0")).toBe(true)
    expect(differs("1.0.0-beta", "1.0.1")).toBe(true)
  })

  it("keeps the spec's own number, written as text", () => {
    expect(extractDetails(info({ version: "1.0.0" }), "1.1.0").specVersion).toBe("1.0.0")
    expect(extractDetails(info({ version: 2 }), "2.0.0").specVersion).toBe("2")
  })

  it("can't disagree when either number is missing", () => {
    expect(differs(undefined, "1.0.0")).toBe(false)
    expect(extractDetails(info({ version: "1.0.0" }), null).versionDiffers).toBe(false)
  })
})

describe("extractDetails: methods", () => {
  it("lists each path's methods with summary and permissions, under every spelling", () => {
    expect(extractDetails(load("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml"), "1.2.0").methods).toEqual([
      { path: "/api/widgets", method: "GET", summary: "Lists widgets.", permissions: ["API_WIDGETS", "API_WIDGETS_READ"] },
      { path: "/api/widgets", method: "POST", summary: "Creates a widget.", permissions: ["API_WIDGETS", "API_OVERRIDE"] },
      { path: "/api/widgets/{id}", method: "PUT", summary: "Updates a widget.", permissions: ["API_WIDGETS", "API_UPDATE"] },
      { path: "/api/widgets/{id}", method: "DELETE", summary: "Deletes a widget.", permissions: ["API_WIDGETS_DELETE"] },
      { path: "/api/widgets/{id}", method: "PATCH", summary: "Patches a widget.", permissions: [] },
    ])
  })
})

describe("extractDetails: media types", () => {
  it("lists the responses' versioned media types once each, leaving out errors and plain JSON", () => {
    expect(extractDetails(load("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml"), "1.2.0").mediaTypes).toEqual([
      "application/vnd.hedtech.integration.v2+json",
      "application/vnd.hedtech.integration.v2.1.0+json",
    ])
  })

  it("gives none when there are no responses", () => {
    expect(extractDetails(info({}), null).mediaTypes).toEqual([])
  })
})

describe("extractParameters", () => {
  it("reads each method's query, path and header parameters, the method's own replacing the path's", () => {
    expect(extractParameters(load("BannerWidgetAPIs/widgets-1.2.0/widgets.yaml"))).toEqual([
      {
        path: "/api/widgets",
        method: "GET",
        parameters: [
          { name: "criteria", in: "query", required: false, description: "Filter the widgets." },
          { name: "limit", in: "query", required: true, description: "How many to return." },
          { name: "Accept", in: "header", required: false, description: null },
          { name: "X-SDE-Expand", in: "header", required: false, description: "Expands the response." },
        ],
      },
      { path: "/api/widgets", method: "POST", parameters: [{ name: "limit", in: "query", required: false, description: null }] },
      { path: "/api/widgets/{id}", method: "PUT", parameters: [{ name: "id", in: "path", required: true, description: null }] },
    ])
  })

  it("keeps each parameter's lineage as written, on the parameter or in its schema", () => {
    const [get] = extractParameters(load("BannerWidgetAPIs/flanges-1.0.0/flanges.yaml"))
    expect(get.parameters.map((p) => [p.name, p.values])).toEqual([
      ["code", [{ kind: "ref", text: "SWBFLNG_CODE" }]],
      ["ownerTitle", [{ kind: "ref", text: "swbflngTitle" }]],
      ["typeFlag", [{ kind: "ref", text: "TYPE_IND" }]],
      ["size", [{ kind: "lookup", text: "SWVSIZE" }]],
      ["limit", undefined],
    ])
  })

  it("flags a query parameter named like a field of the form's key block, and no other", () => {
    const spec: Spec = {
      paths: {
        "/x": {
          get: {
            parameters: [
              { name: "termCode", in: "query" },
              { name: "status", in: "query", required: true },
              { name: "termCode", in: "header" },
            ],
          },
        },
      },
      components: { schemas: { Keys: { "x-lineageReferenceObject": "KEY_BLOCK", properties: { termCode: {}, crn: {} } } } },
    }
    expect(extractParameters(spec)[0].parameters).toEqual([
      { name: "termCode", in: "query", required: false, description: null, formKey: true },
      { name: "status", in: "query", required: true, description: null },
      { name: "termCode", in: "header", required: false, description: null },
    ])
  })

  it("skips a $ref that leads nowhere, and gives nothing for a spec without paths", () => {
    const spec: Spec = { paths: { "/x": { get: { parameters: [{ $ref: "#/components/parameters/missing" }, { $ref: "elsewhere.yaml" }] } } } }
    expect(extractParameters(spec)).toEqual([])
    expect(extractParameters({})).toEqual([])
  })
})

describe("parsePermissions", () => {
  it("splits a comma-separated list and strips quotes and spaces", () => {
    expect(parsePermissions("A, B")).toEqual(["A", "B"])
    expect(parsePermissions(" 'CONTROL', 'SCRIBE' ")).toEqual(["CONTROL", "SCRIBE"])
  })

  it("accepts a YAML list", () => {
    expect(parsePermissions(["A", "B, C"])).toEqual(["A", "B", "C"])
  })

  it("gives none for null or anything else", () => {
    expect(parsePermissions(null)).toEqual([])
    expect(parsePermissions({ a: 1 })).toEqual([])
  })
})
