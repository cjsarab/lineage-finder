// The fields tree, its filter and the words for rows without a table. Made-up data.
import { describe, expect, it } from "vitest"
import { allParents, buildTree, coverageText, fieldWords, filterTree } from "./fields"
import type { Field, Value } from "./server"

const ref = (text: string, extra: Partial<Value> = {}): Value => ({ kind: "ref", text, ...extra })
const placed = (text: string, table: string, column?: string) => ref(text, { places: [{ table, ...(column ? { column } : {}) }] })

const fields: Field[] = [
  { name: "id", depth: 0, values: [placed("SWBSPRK_ID", "SWBSPRK", "SWBSPRK_ID")] },
  { name: "owner", depth: 0 },
  { name: "title", depth: 1, values: [placed("swbsprkTitle", "SWBSPRK", "SWBSPRK_TITLE")] },
  { name: "preference", depth: 1, values: [ref("unsupported", { note: "unsupported" })] },
  { name: "address", depth: 1 },
  { name: "street", depth: 2, values: [placed("SWRADDR_STREET", "SWRADDR", "SWRADDR_STREET")] },
  { name: "status", depth: 0 },
]

describe("buildTree", () => {
  it("nests fields under their parents and counts what's at the ends of the branches", () => {
    const tree = buildTree(fields)
    expect(tree.map((n) => n.path)).toEqual(["id", "owner", "status"])
    const owner = tree[1]
    expect(owner.children.map((n) => n.path)).toEqual(["owner.title", "owner.preference", "owner.address"])
    expect(owner.children[2].children[0].path).toBe("owner.address.street")
    expect([owner.leaves, owner.leavesWithLineage]).toEqual([3, 2])
    expect(allParents(tree)).toEqual(["owner", "owner.address"])
  })
})

describe("filterTree", () => {
  const tree = buildTree(fields)
  const paths = (nodes: ReturnType<typeof filterTree>["nodes"]): string[] => nodes.flatMap((n) => [n.path, ...paths(n.children)])

  it("keeps everything with no filter", () => {
    expect(paths(filterTree(tree, "", false).nodes)).toHaveLength(7)
  })

  it("keeps matches by name or lineage, with their parents, and opens those parents", () => {
    const byName = filterTree(tree, "STREET", false)
    expect(paths(byName.nodes)).toEqual(["owner", "owner.address", "owner.address.street"])
    expect([...byName.open]).toEqual(["owner.address", "owner"])
    expect(paths(filterTree(tree, "swbsprk_title", false).nodes)).toEqual(["owner", "owner.title"])
  })

  it("matches as search does: separators as spaces, every word in any order, on the field's path too", () => {
    expect(paths(filterTree(tree, "addr street", false).nodes)).toEqual(["owner", "owner.address", "owner.address.street"])
    expect(paths(filterTree(tree, "title owner", false).nodes)).toEqual(["owner", "owner.title"])
    // What a search result sets the filter to: the field's path.
    expect(paths(filterTree(tree, "owner.title", false).nodes)).toEqual(["owner", "owner.title"])
  })

  it("keeps all of a matching parent's fields", () => {
    expect(paths(filterTree(tree, "address", false).nodes)).toEqual(["owner", "owner.address", "owner.address.street"])
  })

  it("keeps only fields with lineage, and the parents on the way to them", () => {
    expect(paths(filterTree(tree, "", true).nodes)).toEqual(["id", "owner", "owner.title", "owner.address", "owner.address.street"])
  })
})

describe("fieldWords", () => {
  it("says why there's no table, in words", () => {
    expect(fieldWords({ name: "a", depth: 0 })).toBe("nothing published")
    expect(fieldWords({ name: "a", depth: 0, values: [ref("unsupported", { note: "unsupported" })] })).toBe("Ellucian says not supported")
    expect(fieldWords({ name: "a", depth: 0, values: [ref("derived", { note: "derived" }), { kind: "lookup", text: "SWVNAME" }] })).toBe("Derived")
    expect(fieldWords({ name: "a", depth: 0, values: [{ kind: "lookup", text: "SWVNAME" }] })).toBe("Lookup")
    expect(fieldWords({ name: "a", depth: 0, values: [ref("id")] })).toBeNull()
    expect(fieldWords(fields[0])).toBeNull()
  })
})

describe("coverageText", () => {
  it("sums up a version's lineage", () => {
    expect(coverageText({ fields: 1200, withLineage: 1100, unsupported: 0 })).toBe("Lineage on 1,100 of 1,200 fields")
    expect(coverageText({ fields: 4, withLineage: 0, unsupported: 1 })).toBe("No lineage published for this version.")
    expect(coverageText({ fields: 4, withLineage: 0, unsupported: 4 })).toBe(
      "No lineage published for this version: Ellucian says none of its fields are supported.",
    )
    expect(coverageText({ fields: 0, withLineage: 0, unsupported: 0 })).toBe("This version has no fields in the catalog.")
    expect(coverageText(null)).toBe("This version has no fields in the catalog.")
  })
})
