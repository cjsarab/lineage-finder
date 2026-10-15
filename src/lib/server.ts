// Talking to the app's server (server/api.ts). The shapes are shared with it, as types only.
import type {
  Api,
  ApiChangesWas,
  ApiFields,
  ApiParameters,
  ApisFile,
  Changes,
  ChangesSent,
  FolderCheck,
  FormDetail,
  FormList,
  FormSummary,
  MethodParameters,
  SearchDescriptionsSent,
  SearchFileSent,
  Status,
  TableDetail,
  TableList,
  TableSummary,
  VersionFields,
  VersionWas,
} from "../../server/api-types.ts"

export type {
  Api,
  ApiRef,
  ApiVersion,
  CatalogCheck,
  ChangeCounts,
  Changes,
  FamilyChange,
  LastRead,
  VersionChange,
  VersionRef,
  VersionWas,
  Coverage,
  FamilySummary,
  Field,
  FolderCheck,
  FormApi,
  FormDetail,
  FormSummary,
  IndexSummary,
  Link,
  MethodParameters,
  Parameter,
  Place,
  ProductGroup,
  RunStatus,
  SearchApi,
  SearchField,
  SearchTable,
  Status,
  TableApi,
  TableColumn,
  TableDetail,
  TableField,
  TableSummary,
  Value,
  Via,
  VersionFields,
} from "../../server/api-types.ts"

export async function getStatus(): Promise<Status> {
  const res = await fetch("/api/status")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return res.json()
}

/** Every API in the index. */
export async function getApis(): Promise<Api[]> {
  const res = await fetch("/api/apis")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as ApisFile).apis
}

/** One API's query parameters and headers, by version folder. */
export async function getApiParameters(family: string, name: string): Promise<Record<string, MethodParameters[]>> {
  const res = await fetch(`/api/apis/${encodeURIComponent(family)}/${encodeURIComponent(name)}/parameters`)
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as ApiParameters).versions
}

/** One API's fields and lineage, by version folder. */
export async function getApiFields(family: string, name: string): Promise<Record<string, VersionFields>> {
  const res = await fetch(`/api/apis/${encodeURIComponent(family)}/${encodeURIComponent(name)}/fields`)
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as ApiFields).versions
}

/** What changed since the read before the last one, or null. */
export async function getChanges(): Promise<Changes | null> {
  const res = await fetch("/api/changes")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as ChangesSent).changes
}

/** One API's changed versions as they were at the read before, by version folder. */
export async function getApiChangesWas(family: string, name: string): Promise<Record<string, VersionWas>> {
  const res = await fetch(`/api/changes/${encodeURIComponent(family)}/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as ApiChangesWas).versions
}

/** Every table, for the tables list. */
export async function getTables(): Promise<TableSummary[]> {
  const res = await fetch("/api/tables")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as TableList).tables
}

/** One table's page, or null if the index has no such table. */
export async function getTable(product: string, name: string): Promise<TableDetail | null> {
  const res = await fetch(`/api/tables/${encodeURIComponent(product)}/${encodeURIComponent(name)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return res.json()
}

/** Every form, for the forms list. */
export async function getForms(): Promise<FormSummary[]> {
  const res = await fetch("/api/forms")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as FormList).forms
}

/** One form's page, or null if the index has no such form. */
export async function getForm(product: string, code: string): Promise<FormDetail | null> {
  const res = await fetch(`/api/forms/${encodeURIComponent(product)}/${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return res.json()
}

/** Search's file: every field merged across versions, and every table's columns. */
export async function getSearch(): Promise<SearchFileSent> {
  const res = await fetch("/api/search")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return res.json()
}

/** The fields' descriptions, by API id, in the search file's order (fetched when Descriptions is switched on). */
export async function getSearchDescriptions(): Promise<Record<string, (string | null)[]>> {
  const res = await fetch("/api/search/descriptions")
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return ((await res.json()) as SearchDescriptionsSent).apis
}

export async function checkFolder(path: string): Promise<FolderCheck> {
  const res = await post("/api/check-folder", { path })
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
  return res.json()
}

/** Starts reading. A refusal because a reading is already running (409) is fine: the page just shows it. */
export async function startReading(path: string): Promise<void> {
  const res = await post("/api/start-reading", { path })
  if (!res.ok && res.status !== 409) throw new Error(`The app answered ${res.status}`)
}

export async function stopReading(): Promise<void> {
  await post("/api/stop-reading", {})
}

/** Deletes the index and the remembered folder (Settings). */
export async function deleteIndex(): Promise<void> {
  const res = await post("/api/delete-index", {})
  if (!res.ok) throw new Error(`The app answered ${res.status}`)
}

function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
}
