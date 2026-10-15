// Pulls the details the app shows out of one parsed spec: its details, query parameters, headers and media types,
// and the parameters' lineage. The beta and version rules and the permission spellings come from a survey of the
// whole catalog.
import { padVersion } from "./folders.ts"
import { keyBlockFields, lineageOf, type Value } from "./lineage.ts"
import type { Spec } from "./read-spec.ts"

export interface Method {
  path: string
  method: string
  summary: string | null
  permissions: string[]
}

export interface Details {
  title: string | null
  description: string | null
  /** The spec's own version, as written. */
  specVersion: string | null
  /** True when the spec's number differs from the folder's (ignoring padding and "-beta"). */
  versionDiffers: boolean
  beta: boolean
  apiType: string | null
  releaseStatus: string | null
  sourceSystem: string | null
  sourceDomain: string | null
  sourceName: string | null
  sourceTitle: string | null
  audience: string | null
  deprecatedOn: string | null
  sunsetOn: string | null
  /** The responses' media types that carry a version (what an EEDM caller puts in Accept), errors left out. */
  mediaTypes: string[]
  methods: Method[]
}

/** One query, path or header parameter of a method. */
export interface Parameter {
  name: string
  in: string
  required: boolean
  description: string | null
  /**
   * Its lineage, on the parameter or in its own schema: as written when read, with tables and columns
   * worked out once every spec is read (indexer/run-index.ts).
   */
  values?: Value[]
  /**
   * A query parameter named like a field of the form's key block: often needed even
   * when the catalog says optional. The catalog's own `required` is never changed.
   */
  formKey?: true
}

/** A method's parameters. Kept out of apis.json, in parameters.json, as only the API page uses them. */
export interface MethodParameters {
  path: string
  method: string
  parameters: Parameter[]
}

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "head", "options", "trace"])

const isMapping = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v)

// Text or a number (YAML reads `version: 2` as a number); anything else, or empty, is absent.
function text(v: unknown): string | null {
  if (typeof v === "number") return String(v)
  if (typeof v !== "string") return null
  const t = v.trim()
  return t === "" ? null : t
}

const BETA = /-beta$/i

export function extractDetails(spec: Spec, folderVersion: string | null): Details {
  const info = isMapping(spec.info) ? spec.info : {}
  const specVersion = text(info.version)
  const releaseStatus = text(info["x-release-status"])
  const versionDiffers =
    specVersion != null && folderVersion != null && padVersion(specVersion.replace(BETA, "")) !== padVersion(folderVersion)

  return {
    title: text(info.title),
    description: text(info.description),
    specVersion,
    versionDiffers,
    beta: (specVersion != null && BETA.test(specVersion)) || releaseStatus?.toLowerCase() === "beta",
    apiType: text(info["x-api-type"]),
    releaseStatus,
    sourceSystem: text(info["x-source-system"]),
    sourceDomain: text(info["x-source-domain"]),
    sourceName: text(info["x-source-name"]),
    sourceTitle: text(info["x-source-title"]),
    audience: text(info["x-audience"]),
    deprecatedOn: text(info["x-deprecated-on"]),
    sunsetOn: text(info["x-sunset-on"]),
    mediaTypes: extractMediaTypes(spec.paths),
    methods: extractMethods(spec.paths),
  }
}

// Each method in the spec, with the path's own entry (which can hold parameters shared by its methods).
function eachMethod(paths: unknown): { path: string; method: string; op: Record<string, unknown>; shared: Record<string, unknown> }[] {
  if (!isMapping(paths)) return []
  const out = []
  for (const [path, ops] of Object.entries(paths)) {
    if (!isMapping(ops)) continue
    for (const [method, op] of Object.entries(ops)) {
      if (HTTP_METHODS.has(method.toLowerCase()) && isMapping(op)) out.push({ path, method: method.toUpperCase(), op, shared: ops })
    }
  }
  return out
}

function extractMethods(paths: unknown): Method[] {
  return eachMethod(paths).map(({ path, method, op }) => ({ path, method, summary: text(op.summary), permissions: permissionsOf(op) }))
}

// e.g. application/vnd.hedtech.integration.v6+json. Plain application/json carries no version, so it's left out.
const VERSIONED_MEDIA = /\.v\d+(\.\d+)*[+.]/i

function extractMediaTypes(paths: unknown): string[] {
  const out = new Set<string>()
  for (const { op } of eachMethod(paths)) {
    if (!isMapping(op.responses)) continue
    for (const response of Object.values(op.responses)) {
      if (!isMapping(response) || !isMapping(response.content)) continue
      for (const type of Object.keys(response.content)) {
        if (VERSIONED_MEDIA.test(type) && !/error/i.test(type)) out.add(type)
      }
    }
  }
  return [...out]
}

/**
 * Each method's query, path and header parameters, those on the path first. A method's own parameter replaces
 * the path's one of the same name and kind (OpenAPI's rule). Query parameters named like a key-block field are flagged. A `$ref` to `components/parameters` is followed
 * (none were seen in the catalog, but they're allowed). Methods without parameters are left out.
 */
export function extractParameters(spec: Spec): MethodParameters[] {
  const components = isMapping(spec.components) && isMapping(spec.components.parameters) ? spec.components.parameters : {}
  const resolve = (p: unknown): unknown => {
    if (!isMapping(p) || typeof p.$ref !== "string") return p
    const m = p.$ref.match(/^#\/components\/parameters\/(.+)$/)
    return m ? components[m[1]] : null
  }
  const keyFields = keyBlockFields(spec)
  const list = (v: unknown): Parameter[] =>
    (Array.isArray(v) ? v : []).map(resolve).flatMap((p) => {
      if (!isMapping(p)) return []
      const name = text(p.name)
      const where = text(p.in)
      if (!name || !where) return []
      const values = [...lineageOf(p), ...(isMapping(p.schema) ? lineageOf(p.schema) : [])]
      const place = where.toLowerCase()
      return [
        {
          name,
          in: place,
          required: p.required === true,
          description: text(p.description),
          ...(values.length ? { values } : {}),
          ...(place === "query" && keyFields.has(name) ? { formKey: true as const } : {}),
        },
      ]
    })

  const out: MethodParameters[] = []
  for (const { path, method, op, shared } of eachMethod(spec.paths)) {
    const own = list(op.parameters)
    const key = (p: Parameter) => `${p.in} ${p.name}`
    const ownKeys = new Set(own.map(key))
    const parameters = [...list(shared.parameters).filter((p) => !ownKeys.has(key(p))), ...own]
    if (parameters.length) out.push({ path, method, parameters })
  }
  return out
}

// The spellings in the catalog: x-method-permissions, x-method-permission, x-method-prermissions, and one key that is a whole
// `{ "x-method-permissionS": "..." }` written as the key itself (its value is in the key).
const PERMISSION_KEY = /^x-method-pr?ermissions?$/i
const PERMISSION_IN_KEY = /^\s*\{\s*"(x-method-[^"]+)"\s*:\s*"([^"]*)"\s*\}\s*$/

function permissionsOf(op: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(op)) {
    const inKey = key.match(PERMISSION_IN_KEY)
    if (inKey && PERMISSION_KEY.test(inKey[1])) out.push(...parsePermissions(inKey[2]))
    else if (PERMISSION_KEY.test(key)) out.push(...parsePermissions(value))
  }
  return [...new Set(out)]
}

// "A, B" or " 'A', 'B' " or a YAML list of either.
export function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(parsePermissions)
  if (typeof value !== "string") return []
  return value
    .split(",")
    .map((p) => p.trim().replace(/^['"]+|['"]+$/g, "").trim())
    .filter((p) => p !== "")
}
