// What the server's /api/ addresses send back. Shared with the web page (type-only imports, so none of the
// server's code ends up in the page).
import type { FolderCheck } from "./catalog-folder.ts"
import type { ProductGroup } from "../indexer/products.ts"
import type { Api, ApiVersion, Stage, VersionFields } from "../indexer/run-index.ts"
import type { Coverage, Field, Link, Place, Value } from "../indexer/lineage.ts"
import type { Details, MethodParameters, Parameter } from "../indexer/extract.ts"
import type { SearchApi, SearchField, SearchFile, SearchTable } from "../indexer/search.ts"
import type { TableApi, TableColumn, TableDetail, TableField, TableSummary, Via } from "../indexer/tables.ts"
import type { FormApi, FormDetail, FormSummary } from "../indexer/forms.ts"
import type { ApiRef, ChangeCounts, Changes, FamilyChange, LastRead, VersionChange, VersionRef, VersionWas } from "../indexer/changes.ts"

export type { Api, ApiVersion, Coverage, Details, Field, FolderCheck, Link, MethodParameters, Parameter, Place, ProductGroup, Stage, Value, VersionFields }
export type { TableApi, TableColumn, TableDetail, TableField, TableSummary, Via }
export type { SearchApi, SearchField, SearchTable }
export type { FormApi, FormDetail, FormSummary }
export type { ApiRef, ChangeCounts, Changes, FamilyChange, LastRead, VersionChange, VersionRef, VersionWas }

/** What GET /api/search sends: the index's search.json. */
export type SearchFileSent = SearchFile & { format: number }

/** What GET /api/search/descriptions sends: by API id, each field's description in search.json's order, or null. */
export interface SearchDescriptionsSent {
  format: number
  apis: Record<string, (string | null)[]>
}

/** What GET /api/tables sends: every table, for the list. */
export interface TableList {
  tables: TableSummary[]
}

/** What GET /api/forms sends: every form, for the list. */
export interface FormList {
  forms: FormSummary[]
}

/** What GET /api/apis sends: the index's apis.json. */
export interface ApisFile {
  format: number
  apis: Api[]
}

/** What GET /api/apis/<family>/<name>/parameters sends: by version folder, the methods that have parameters. */
export interface ApiParameters {
  versions: Record<string, MethodParameters[]>
}

/** What GET /api/apis/<family>/<name>/fields sends: by version folder, the fields and their lineage. */
export interface ApiFields {
  versions: Record<string, VersionFields>
}

/** One family, with the product it belongs to (indexer/products.ts). */
export interface FamilySummary {
  name: string
  group: ProductGroup
  /** The product's name, e.g. "Banner" or, under "Other products", "Degree Works". */
  product: string
  apis: number
  versions: number
}

/** What the page shows about a finished index: the Done screen and the landing page. */
export interface IndexSummary {
  builtAt: string
  catalog: string
  seconds: number
  apis: number
  versions: number
  specFiles: number
  /** In display order: by product group (Banner first), then by name. */
  families: FamilySummary[]
  /** e.g. 18, "18 read by the second reader"; the same lines `npm run index` prints. */
  care: { count: number; text: string }[]
  /** Files that couldn't be read at all, with the reason. */
  unreadable: { file: string; reason: string }[]
}

export interface RunStatus {
  catalog: string
  stage: Stage
  done: number
  total: number
  /** Seconds since the reading stage began (0 before it), for the "time left" guess. */
  readingSeconds: number
}

export type LastRun =
  | { outcome: "done"; summary: IndexSummary }
  | { outcome: "stopped" }
  | { outcome: "failed"; message: string }

/** Whether the catalog folder differs from the list saved at the last read. */
export type CatalogCheck =
  /** Being checked (about 0.1 s): the page asks again. */
  | { state: "checking" }
  /** Can't tell: no index, an index made by an older version without the list, or the folder has gone. */
  | { state: "unknown" }
  | { state: "same" | "changed"; fingerprint: string }

/** What GET /api/changes sends: what changed since the read before the last, or null (none to compare with). */
export interface ChangesSent {
  changes: Changes | null
}

/** What GET /api/changes/<family>/<name> sends: by version folder, each changed version as it was at the read before. */
export interface ApiChangesWas {
  versions: Record<string, VersionWas>
}

export interface Status {
  app: { version: string; indexFormat: number }
  index: { state: "ready"; summary: IndexSummary } | { state: "missing" } | { state: "outdated" }
  /** Where the index and settings are kept (data/ inside the app). */
  dataDir: string
  catalog: {
    /** The folder chosen last time; null if it's the default (or nothing was chosen yet). */
    chosen: string | null
    default: string
  }
  /** The reading in progress, if any. */
  run: RunStatus | null
  /** How the most recent reading since the app started ended, if there was one. */
  last: LastRun | null
  /** Whether the catalog has changed since it was read (checked at start-up and after each re-index). */
  catalogCheck: CatalogCheck
}
