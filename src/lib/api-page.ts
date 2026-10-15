// The working-out behind one API's page: which version is shown, what the heading and
// Details say, the methods in order and the one-line summary of headers.
import { nameKey } from "@/lib/api-list"
import type { Api, ApiVersion, MethodParameters } from "@/lib/server"

// Shared with the comparing rules (indexer/compare.ts), so they live there.
import { methodRank, sortMethods, versionKey } from "../../indexer/compare.ts"
export { releaseText, sortMethods, versionKey } from "../../indexer/compare.ts"

/** The word beside a version on its button or in a picker: "deprecated", "beta" or nothing. */
export const versionLabel = (v: ApiVersion) => (v.details?.deprecatedOn ? "deprecated" : v.details?.beta ? "beta" : null)

/**
 * The version asked for in the address (`?version=2.0.0`), or the newest. `unknown` is set when the address asks
 * for one the API doesn't have; the newest is shown instead.
 */
export function chooseVersion(api: Api, asked: string | null): { version: ApiVersion; newest: ApiVersion; unknown: string | null } {
  const newest = api.versions[api.versions.length - 1]
  if (asked === null) return { version: newest, newest, unknown: null }
  const found = api.versions.find((v) => versionKey(v) === asked)
  return found ? { version: found, newest, unknown: null } : { version: newest, newest, unknown: asked }
}

/** The title, only when it says something the name doesn't (not just other capitals, spaces or hyphens). */
export function titleIfDifferent(title: string | null, name: string): string | null {
  return title && nameKey(title) !== nameKey(name) ? title : null
}

/** APIs with the same name in other families ("Also in …"). */
export const sameNameElsewhere = (apis: readonly Api[], api: Api) => apis.filter((a) => a.name === api.name && a.family !== api.family)

/**
 * A Banner ERP family's source value names forms and tables together, so the API page shows it
 * as written under "Source", with the names linked. Business APIs' is their form ("Form").
 */
export const isErpFamily = (family: string) => family.startsWith("BannerErp")

/** The note on a key-block parameter's label (borne out by test calls to the APIs). */
export const KEY_BLOCK_NOTE =
  "The form starts from its key block. Often needed even when the catalog says optional (an ID, a term, a CRN); some are optional filters."

/** "Banner page" for Banner families; other products name their own screens, so just "Source page" there. */
export const sourcePageLabel = (family: string) => (family.startsWith("Banner") ? "Banner page" : "Source page")

/** "Widget Maintenance (SWAWIDG)", either half alone, or null. */
export function sourcePage(title: string | null, code: string | null): string | null {
  if (title && code) return `${title} (${code})`
  return title ?? code
}

/** The query and path parameters, per method, in method order; methods with only headers are left out. */
export function parameterGroups(methods: readonly MethodParameters[]): MethodParameters[] {
  return sortMethods(methods)
    .map((m) => ({ ...m, parameters: m.parameters.filter((p) => p.in !== "header") }))
    .filter((m) => m.parameters.length > 0)
}

/**
 * The headers in one line (they're rarely important for users): "Accept, X-SDE-Expand
 * (GET, PUT) · Content-Type (POST)". When every method (`allMethods`) sends the same ones, just
 * the names. Null
 * when there are none.
 */
export function headersLine(methods: readonly MethodParameters[], allMethods: readonly { method: string }[] = []): string | null {
  const byMethod = new Map<string, string[]>()
  for (const m of [...allMethods].sort((x, y) => methodRank(x.method) - methodRank(y.method))) byMethod.set(m.method, [])
  for (const m of sortMethods(methods)) {
    const names = byMethod.get(m.method) ?? []
    for (const p of m.parameters) if (p.in === "header" && !names.includes(p.name)) names.push(p.name)
    byMethod.set(m.method, names)
  }
  const groups = new Map<string, string[]>() // the header names → the methods that send them
  for (const [method, names] of byMethod) {
    if (names.length === 0) continue
    const key = names.join(", ")
    groups.set(key, [...(groups.get(key) ?? []), method])
  }
  if (groups.size === 0) return null
  const [first] = groups
  if (groups.size === 1 && first[1].length === byMethod.size) return first[0]
  return [...groups].map(([names, ms]) => `${names} (${ms.join(", ")})`).join(" · ")
}
