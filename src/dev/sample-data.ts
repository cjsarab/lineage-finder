// Made-up sample content for the component gallery. Shaped like the catalog (long upper-case table and
// column names, nested field paths, version numbers, lineage notes), but none of it is Ellucian material.

export type Confidence = "stated" | "probable" | "not supported" | "no lineage"

export type SampleField = {
  path: string
  table: string | null
  column: string | null
  confidence: Confidence
  raw: string
}

const TABLES = ["SXRWIDG", "SXBGADG", "GXVTHNG", "SXRFLMP", "GXBWOMB"]
const LEAVES = ["id", "code", "title", "startOn", "endOn", "status", "owner.id", "detail.description", "rank"]

/** 50 rows, enough to judge density, with every kind of lineage we'll show. */
export const sampleFields: SampleField[] = Array.from({ length: 50 }, (_, i) => {
  const table = TABLES[i % TABLES.length]
  const leaf = LEAVES[i % LEAVES.length]
  const path = i % 7 === 0 ? `widgetDetails.allocations.${leaf}` : leaf
  const column = `${table}_${leaf.replace(/\W/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`
  if (i % 11 === 5) return { path, table: null, column: null, confidence: "not supported", raw: "unsupported" }
  if (i % 13 === 7) return { path, table: null, column: null, confidence: "no lineage", raw: "" }
  if (i % 5 === 3) return { path, table, column: `${column}_IND`, confidence: "probable", raw: `${table.toLowerCase()}${leaf}Ind` }
  return { path, table, column, confidence: "stated", raw: column }
})

export const sampleVersions = [
  { value: "3.0.0", label: "3.0.0", note: "beta" },
  { value: "2.1.0", label: "2.1.0", note: "latest" },
  { value: "2.0.0", label: "2.0.0", note: "deprecated" },
  { value: "1.0.0", label: "1.0.0", note: "sunset 1 Jan 2027" },
]

export const sampleApis = [
  { name: "widget-requests", family: "Banner Business", type: "business", versions: 4, coverage: "92%" },
  { name: "gadget-allocations", family: "Banner EEDM", type: "ethos", versions: 2, coverage: "41%" },
  { name: "thing-statuses", family: "Banner ERP", type: "erp", versions: 1, coverage: "none published" },
]

export const sampleDerivedLogic =
  "If SXRWIDG_STATUS_IND is 'A', the widget is active. Otherwise the most recent row in SXBGADG for the same " +
  "SXRWIDG_PIDM decides it, ignoring rows whose GXVTHNG_END_DATE has passed."

export const sampleSuggestions = ["sxrwidg", "sxrfmlp", "widget"]
