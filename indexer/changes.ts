// "What changed" since the last read: worked out at the end of a re-index, while the old index is still on disk, with
// the rules of Compare versions (./compare.ts). Only the result is kept, as changes.json in the
// new index; for each changed version it holds that version as it was, so its page can show the details later.
import { compareDetails, compareFields, compareHeaders, compareParameters, versionKey } from "./compare.ts"
import type { MethodParameters } from "./extract.ts"
import type { Api, ApiVersion, FieldsByApi, ParametersByApi, VersionFields } from "./run-index.ts"

export const CHANGES_FILE = "changes.json"

/** The last read, as the summary names it: "since your last read (12 Oct 2026, 10:49)". */
export interface LastRead {
  builtAt: string
  catalog: string
}

export interface ApiRef {
  family: string
  name: string
}

export interface VersionRef extends ApiRef {
  /** The version's number, as in addresses. */
  version: string
}

/** A whole family added or gone: one line on the summary, its APIs folded underneath. */
export interface FamilyChange {
  name: string
  apis: string[]
}

/** What a changed version's line on the summary counts. */
export interface ChangeCounts {
  /** Details box lines: status, dates, base tables, methods added or removed. */
  details: number
  parameters: number
  headers: boolean
  /** Field rows marked, other schemas' included. */
  fields: number
  /** Of those fields and parameters, the ones whose lineage changed. */
  lineage: number
}

export interface VersionChange extends VersionRef {
  folder: string
  counts: ChangeCounts
}

/** One version as it was at the last read: what the changes page compares the current index with. */
export interface VersionWas {
  version: ApiVersion
  parameters: MethodParameters[]
  fields: VersionFields | null
}

export interface Compared {
  outcome: "compared"
  lastRead: LastRead
  families: { added: FamilyChange[]; removed: FamilyChange[] }
  /** Outside the families added or gone. */
  apis: { added: ApiRef[]; removed: ApiRef[] }
  /** In APIs that are in both reads. */
  versions: { added: VersionRef[]; removed: VersionRef[] }
  changed: VersionChange[]
}

export type Changes =
  | Compared
  /** Too different to list (another catalog altogether): just says so. */
  | { outcome: "different-catalog"; lastRead: LastRead }
  /** The last read is in an older index format: an app update changed how the index is kept. */
  | { outcome: "not-comparable" }
  /** Comparing went wrong; the new index is kept regardless. */
  | { outcome: "failed"; lastRead: LastRead | null; message: string }

/** changes.json: the result, and by API id then version folder, each changed version as it was. */
export interface ChangesFile {
  changes: Changes
  was: Record<string, Record<string, VersionWas>>
}

export interface Read {
  lastRead: LastRead
  apis: Api[]
  parameters: ParametersByApi
  fields: FieldsByApi
}

const sameFolder = (a: string, b: string) => a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase()

export function buildChanges(last: Read, now: Read): ChangesFile {
  if (!sameFolder(last.lastRead.catalog, now.lastRead.catalog)) {
    return { changes: { outcome: "different-catalog", lastRead: last.lastRead }, was: {} }
  }
  const families = (apis: Api[]) => {
    const m = new Map<string, string[]>()
    for (const a of apis) m.set(a.family, [...(m.get(a.family) ?? []), a.name])
    return m
  }
  const fa = families(last.apis), fb = families(now.apis)
  const byName = (a: FamilyChange, b: FamilyChange) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const familiesAdded = [...fb].filter(([f]) => !fa.has(f)).map(([name, apis]) => ({ name, apis: apis.sort() })).sort(byName)
  const familiesRemoved = [...fa].filter(([f]) => !fb.has(f)).map(([name, apis]) => ({ name, apis: apis.sort() })).sort(byName)

  const result: Compared = {
    outcome: "compared",
    lastRead: last.lastRead,
    families: { added: familiesAdded, removed: familiesRemoved },
    apis: { added: [], removed: [] },
    versions: { added: [], removed: [] },
    changed: [],
  }
  const was: ChangesFile["was"] = {}
  const ia = new Map(last.apis.map((a) => [a.id, a])), ib = new Map(now.apis.map((a) => [a.id, a]))
  for (const [id, b] of ib) if (!ia.has(id) && fa.has(b.family)) result.apis.added.push({ family: b.family, name: b.name })
  for (const [id, a] of ia) if (!ib.has(id) && fb.has(a.family)) result.apis.removed.push({ family: a.family, name: a.name })

  for (const [id, b] of ib) {
    const a = ia.get(id)
    if (!a) continue
    const ref = { family: b.family, name: b.name }
    const va = new Map(a.versions.map((v) => [v.folder, v]))
    const vb = new Map(b.versions.map((v) => [v.folder, v]))
    for (const [f, v] of vb) if (!va.has(f)) result.versions.added.push({ ...ref, version: versionKey(v) })
    for (const [f, v] of va) if (!vb.has(f)) result.versions.removed.push({ ...ref, version: versionKey(v) })
    for (const [folder, v1] of va) {
      const v2 = vb.get(folder)
      if (!v2) continue
      const pa = last.parameters[id]?.[folder] ?? [], pb = now.parameters[id]?.[folder] ?? []
      const fda = last.fields[id]?.[folder], fdb = now.fields[id]?.[folder]
      const counts = countChanges(v1, v2, pa, pb, fda, fdb)
      if (counts.details + counts.parameters + counts.fields === 0 && !counts.headers) continue
      result.changed.push({ ...ref, version: versionKey(v2), folder, counts })
      ;(was[id] ??= {})[folder] = { version: v1, parameters: pa, fields: fda ?? null }
    }
  }
  return { changes: result, was }
}

function countChanges(
  a: ApiVersion,
  b: ApiVersion,
  pa: MethodParameters[],
  pb: MethodParameters[],
  fa: VersionFields | undefined,
  fb: VersionFields | undefined,
): ChangeCounts {
  const d = compareDetails(a, b)
  const params = compareParameters(pa, pb).flatMap((g) => g.rows.filter((r) => r.mark))
  const schemas = [...new Set([...(fa?.other ?? []), ...(fb?.other ?? [])].map((o) => o.schema))]
  const of = (v: VersionFields | undefined, s: string) => v?.other.find((o) => o.schema === s)?.fields ?? []
  const fields = [
    ...compareFields(fa?.fields ?? [], fb?.fields ?? []),
    ...schemas.flatMap((s) => compareFields(of(fa, s), of(fb, s))),
  ].filter((r) => r.mark)
  const lineage = (rows: { notes: string[] }[]) => rows.filter((r) => r.notes.some((n) => n.startsWith("lineage"))).length
  return {
    details: d.changes.length + d.methodsAdded.length + d.methodsRemoved.length,
    parameters: params.length,
    headers: compareHeaders(pa, pb).line !== null,
    fields: fields.length,
    lineage: lineage(fields) + lineage(params),
  }
}
