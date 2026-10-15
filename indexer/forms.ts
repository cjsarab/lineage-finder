// Forms: the Banner (and Colleague) forms an API works through, found by rules checked against a Banner database: a
// Business API's form is its x-source-name (or, for a few,
// its description); a Banner ERP API's value names tables and forms, so only its names that are a Business API's form
// or have a form's third letter count; a Colleague Business API's is Colleague's own code.
import type { Details } from "./extract.ts"
import { FORM_LETTER } from "./lineage.ts"
import { productOfFamily } from "./products.ts"
import type { Tables } from "./tables.ts"

type FormFamily = "business" | "erp" | "colleague"

function formFamily(family: string): FormFamily | null {
  if (family.startsWith("BannerBus")) return "business"
  if (family.startsWith("BannerErp")) return "erp"
  if (family.startsWith("ColleagueBus")) return "colleague"
  return null
}

const BANNER_SHAPE = /^[A-Z][A-Z0-9]{6}$/
// A few Business versions have no x-source-name; their description names the page.
const DESCRIBED = /^API for (\S+) administrative page/i

function businessForm(details: Details): string | null {
  if (details.sourceName) return details.sourceName.trim().toUpperCase()
  const named = details.description?.match(DESCRIBED)?.[1].toUpperCase()
  return named && BANNER_SHAPE.test(named) ? named : null
}

/** For each version (in the order given), the forms it works through. ERP values need every Business form first. */
export function recogniseForms(versions: readonly { family: string; details: Details | null }[]): string[][] {
  const business = new Set<string>()
  for (const v of versions) {
    if (v.details && formFamily(v.family) === "business") {
      const form = businessForm(v.details)
      if (form) business.add(form)
    }
  }
  return versions.map(({ family, details }) => {
    if (!details) return []
    switch (formFamily(family)) {
      case "business": {
        const form = businessForm(details)
        return form ? [form] : []
      }
      case "colleague":
        return details.sourceName ? [details.sourceName.trim()] : []
      case "erp": {
        const names = (details.sourceName ?? "").split(/[\s,/]+/).map((n) => n.toUpperCase())
        return [...new Set(names.filter((n) => BANNER_SHAPE.test(n) && (business.has(n) || FORM_LETTER.test(n))))]
      }
      default:
        return []
    }
  })
}

/** One API built on a form, on the form's page. */
export interface FormApi {
  id: string
  /** The versions that work through the form, oldest first. */
  versions: string[]
  /** The base tables of the newest of those versions. */
  baseTables: string[]
  /** A Banner ERP API's x-source-name as written: it names other tables and forms too. */
  source?: string
  /** The API's newest version doesn't work through the form. */
  older?: true
}

/** A form's page (GET /api/forms/<product>/<code>). */
export interface FormDetail {
  product: string
  code: string
  /** The title its Business APIs give most often (a tie: the shorter); null if none gives one (forms only an ERP API names). */
  title: string | null
  /** Other titles its APIs give, A–Z. */
  titles: string[]
  /** By API id. */
  apis: FormApi[]
  /** A table of the same product has the same name (validation and rule forms). */
  table?: true
}

/** A form on the list (GET /api/forms). */
export interface FormSummary {
  product: string
  code: string
  title: string | null
  apis: string[]
  table?: true
}

export interface Forms {
  /** By product, then code A–Z. */
  list: FormSummary[]
  /** By `<product>/<code>`. */
  forms: Record<string, FormDetail>
}

/** What forms need from each API: its family and its versions (oldest first) with the forms recognised. */
export interface FormSource {
  id: string
  family: string
  versions: { folder: string; version: string | null; details: Details | null; forms: string[]; baseTables: string[] }[]
}

export const formKey = (product: string, code: string) => `${product}/${code}`

export function buildForms(sources: Iterable<FormSource>, tables: Tables): Forms {
  type Found = { product: string; code: string; apis: Map<string, FormApi>; titles: Map<string, number> }
  const found = new Map<string, Found>()

  for (const src of sources) {
    const product = productOfFamily(src.family).product
    const newest = src.versions.at(-1)
    const titled = formFamily(src.family) !== "erp"
    for (const v of src.versions) {
      for (const code of v.forms) {
        const key = formKey(product, code)
        let f = found.get(key)
        if (!f) found.set(key, (f = { product, code, apis: new Map(), titles: new Map() }))
        let api = f.apis.get(src.id)
        if (!api) f.apis.set(src.id, (api = { id: src.id, versions: [], baseTables: [] }))
        api.versions.push(v.version ?? v.folder)
        api.baseTables = v.baseTables
        if (!titled && v.details?.sourceName) api.source = v.details.sourceName
      }
    }
    for (const code of new Set(src.versions.flatMap((v) => v.forms))) {
      if (!newest?.forms.includes(code)) found.get(formKey(product, code))!.apis.get(src.id)!.older = true
      // Each API's title is its newest version's that works through the form.
      const title = titled ? src.versions.findLast((v) => v.forms.includes(code))?.details?.sourceTitle : null
      if (!title) continue
      const titles = found.get(formKey(product, code))!.titles
      titles.set(title, (titles.get(title) ?? 0) + 1)
    }
  }

  const list: FormSummary[] = []
  const forms: Record<string, FormDetail> = {}
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const sorted = [...found.values()].sort((a, b) => order(a.product, b.product) || order(a.code, b.code))
  for (const f of sorted) {
    const apis = [...f.apis.values()].sort((a, b) => order(a.id, b.id))
    // Most often given first; a tie goes to the shorter, so "Widget Validation" beats "Widget Validation (Local)" and
    // "Widget Validation Form", then A–Z.
    const ranked = [...f.titles].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || order(a[0], b[0]))
    const title = ranked[0]?.[0] ?? null
    const table = Object.hasOwn(tables.tables, formKey(f.product, f.code))
    const key = formKey(f.product, f.code)
    forms[key] = {
      product: f.product,
      code: f.code,
      title,
      titles: ranked.slice(1).map(([t]) => t).sort(order),
      apis,
      ...(table ? { table: true as const } : {}),
    }
    list.push({ product: f.product, code: f.code, title, apis: apis.map((a) => a.id), ...(table ? { table: true as const } : {}) })
  }
  return { list, forms }
}
