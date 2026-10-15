// Comparing two versions of an API: which versions an address asks for. The comparing
// rules themselves are in indexer/compare.ts (the indexer uses them too), passed through here.
import { versionKey } from "@/lib/api-page"
import type { Api, ApiVersion } from "@/lib/server"

export { compareDetails, compareFields, compareHeaders, compareParameters } from "../../indexer/compare.ts"
export type { DetailChange, FieldRow, Mark, ParameterGroup, ParameterRow } from "../../indexer/compare.ts"

// ---------- Which versions ----------

/**
 * The versions an address asks for (`?from=&to=`). Missing, the newest and the one before it, or the one before `to`;
 * a version the API doesn't have, or a `from` that isn't older than `to`, gives the newest pair and says why.
 */
export function chooseComparison(api: Api, from: string | null, to: string | null): { from: ApiVersion; to: ApiVersion; problem: string | null } {
  const vs = api.versions
  const at = (key: string) => vs.findIndex((v) => versionKey(v) === key)
  const newestPair = (problem: string | null) => ({ from: vs[Math.max(0, vs.length - 2)], to: vs[vs.length - 1], problem })
  for (const key of [from, to]) if (key !== null && at(key) < 0) return newestPair(`This API has no version ${key}.`)
  const t = to === null ? vs.length - 1 : at(to)
  const f = from === null ? t - 1 : at(from)
  if (f < 0) return newestPair(`There's no version older than ${versionKey(vs[t])}.`)
  if (f >= t) return newestPair(`Version ${versionKey(vs[f])} isn't older than ${versionKey(vs[t])}.`)
  return { from: vs[f], to: vs[t], problem: null }
}

/** What the API page's button compares: the version shown with the one before it, or the oldest with the next. */
export function startingPair(api: Api, shown: ApiVersion): [string, string] {
  const i = Math.max(1, api.versions.indexOf(shown))
  return [versionKey(api.versions[i - 1]), versionKey(api.versions[i])]
}

export function comparePath(api: { family: string; name: string }, from: string, to: string): string {
  return `/apis/${encodeURIComponent(api.family)}/${encodeURIComponent(api.name)}/compare?${new URLSearchParams({ from, to })}`
}
