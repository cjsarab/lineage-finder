// The working-out behind the "Fields and lineage" section: the fields as a tree,
// the filter box and "Only fields with lineage", and what each row says when there's no table.
import { matchesQuery, queryWords } from "@/lib/search"
import type { Coverage, Field, Value } from "@/lib/server"

export interface FieldNode {
  field: Field
  /** e.g. "owner.title": unique within the version, used to remember what's open. */
  path: string
  children: FieldNode[]
  /** Fields at the ends of its branches, and how many of those have lineage (for "4 fields, 3 with lineage"). */
  leaves: number
  leavesWithLineage: number
}

/** Any value other than `unsupported` counts as lineage published. */
export const hasLineage = (f: Field) => (f.values ?? []).some((v) => v.note !== "unsupported")

/** The index's flat list (parents first, depth one more for their fields) as a tree. */
export function buildTree(fields: readonly Field[]): FieldNode[] {
  const roots: FieldNode[] = []
  const stack: FieldNode[] = []
  for (const field of fields) {
    while (stack.length > field.depth) stack.pop()
    const parent = stack.at(-1)
    const node: FieldNode = { field, path: parent ? `${parent.path}.${field.name}` : field.name, children: [], leaves: 0, leavesWithLineage: 0 }
    ;(parent ? parent.children : roots).push(node)
    stack.push(node)
  }
  const count = (n: FieldNode) => {
    if (n.children.length === 0) {
      n.leaves = 1
      n.leavesWithLineage = hasLineage(n.field) ? 1 : 0
    } else {
      n.children.forEach(count)
      n.leaves = n.children.reduce((s, c) => s + c.leaves, 0)
      n.leavesWithLineage = n.children.reduce((s, c) => s + c.leavesWithLineage, 0)
    }
  }
  roots.forEach(count)
  return roots
}

const valueText = (v: Value) => [v.text, ...(v.places ?? []).flatMap((p) => [p.table, p.column ?? ""])].join(" ")

/**
 * The fields to show. `query` keeps fields whose path or lineage matches it, as search matches (src/lib/search.ts),
 * with their parents, and lists the parents to open so the matches are seen; a field that matches keeps all its own
 * fields. `onlyLineage` keeps fields with lineage and the parents on the way to them.
 */
export function filterTree(nodes: readonly FieldNode[], query: string, onlyLineage: boolean): { nodes: FieldNode[]; open: Set<string> } {
  const q = queryWords(query).length > 0 ? query : ""
  const open = new Set<string>()
  const matches = (n: FieldNode) => q !== "" && matchesQuery(q, n.path, ...(n.field.values ?? []).map(valueText))

  const keep = (n: FieldNode, matchedAbove: boolean): FieldNode | null => {
    const self = q === "" || matchedAbove || matches(n)
    const children = n.children.map((c) => keep(c, self && q !== "")).filter((c): c is FieldNode => c !== null)
    if (children.length && q !== "" && !self) open.add(n.path)
    const lineageOk = !onlyLineage || hasLineage(n.field) || children.length > 0
    if ((self || children.length) && lineageOk) return { ...n, children }
    return null
  }
  return { nodes: nodes.map((n) => keep(n, false)).filter((n): n is FieldNode => n !== null), open }
}

/** Every parent's path, for "Open all". */
export function allParents(nodes: readonly FieldNode[]): string[] {
  return nodes.flatMap((n) => (n.children.length ? [n.path, ...allParents(n.children)] : []))
}

/**
 * What the Table and Column cells say when no value gives a table: "Ellucian says not supported", "nothing
 * published", "Derived" or "Lookup". Null when a value gives a table, or for a value with neither (e.g. `id`).
 */
export function fieldWords(f: Field): string | null {
  const values = f.values ?? []
  if (values.some((v) => v.places?.length)) return null
  if (values.length === 0) return "nothing published"
  if (values.every((v) => v.note === "unsupported")) return "Ellucian says not supported"
  if (values.some((v) => v.note === "derived" || v.kind === "derived")) return "Derived"
  if (values.some((v) => v.kind === "lookup")) return "Lookup"
  return null
}

/** The summary above the fields: "Lineage on 9 of 11 fields", or why there's none. */
export function coverageText(c: Coverage | null): string {
  if (!c || c.fields === 0) return "This version has no fields in the catalog."
  if (c.withLineage === 0) {
    return c.unsupported === c.fields
      ? "No lineage published for this version: Ellucian says none of its fields are supported."
      : "No lineage published for this version."
  }
  return `Lineage on ${c.withLineage.toLocaleString("en-GB")} of ${c.fields.toLocaleString("en-GB")} fields`
}
