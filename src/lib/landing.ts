// The landing page's ways in: APIs, Tables and Forms with their counts broken down, each count linking to its list
// already filtered. Counted with the lists' own code, so a
// badge's number is what its list shows: hidden families left out, domains tidied, modules by first letter.
import { NOT_STATED, optionCounts, writeFilters, type Filters, type ListApi } from "@/lib/api-list"
import type { ListForm } from "@/lib/forms"
import type { FamilySummary } from "@/lib/server"
import { moduleLabel, modulesOf, productsOf, tableCounts, writeTableFilters, type Listed, type ListTable } from "@/lib/tables"

/** One count: what, how many, and the list it opens, already filtered. */
export interface Bit {
  label: string
  count: number
  href: string
}

export interface Breakdown {
  /** e.g. "By family". */
  title: string
  /** Largest first ("Not stated" and "Other" last, as the lists have them). */
  bits: Bit[]
}

export interface Way {
  count: number
  /** The smaller line under the count: "4,468 versions", "5,120 columns", "312 also a table". */
  extra: number
  breakdowns: Breakdown[]
}

const NO_FILTERS: Filters = { families: [], domains: [], statuses: [], lineage: [], name: "", page: 1 }
const apisHref = (f: Partial<Filters>) => `/apis?${writeFilters({ ...NO_FILTERS, ...f })}`
const byCount = (a: Bit, b: Bit) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)

/** The APIs (`toListApis`) as the list shows them, hidden families left out, by product, family and domain. */
export function apiWay(list: readonly ListApi[], families: readonly FamilySummary[], hidden: readonly string[]): Way {
  const shown = list.filter((a) => !hidden.includes(a.family))
  const counts = optionCounts(shown, NO_FILTERS)
  const shownFamilies = families.filter((f) => !hidden.includes(f.name) && counts.family.has(f.name))

  // By the family filter's groups (Banner, Colleague, CRM, PowerCampus, Apply, Other products): the one-family products
  // are shown by folder name only. A badge ticks all the group's families, as the group's box does.
  const products = new Map<string, string[]>()
  for (const f of shownFamilies) products.set(f.group, [...(products.get(f.group) ?? []), f.name])
  const byProduct = [...products]
    .map(([product, names]) => ({
      label: product,
      count: names.reduce((sum, name) => sum + (counts.family.get(name) ?? 0), 0),
      href: apisHref({ families: names }),
    }))
    .sort(byCount)
  const byFamily = shownFamilies.map((f) => ({ label: f.name, count: counts.family.get(f.name)!, href: apisHref({ families: [f.name] }) })).sort(byCount)
  const byDomain = [...counts.domain]
    .map(([domain, count]) => ({ label: domain, count, href: apisHref({ domains: [domain] }) }))
    .sort((a, b) => (a.label === NOT_STATED ? 1 : b.label === NOT_STATED ? -1 : byCount(a, b)))

  return {
    count: shown.length,
    extra: shown.reduce((sum, a) => sum + a.versions, 0),
    breakdowns: [
      { title: "By product", bits: byProduct },
      { title: "By family", bits: byFamily },
      { title: "By domain", bits: byDomain },
    ],
  }
}

/** Tables or forms as their list shows them (`toListTables`, `toListForms`), by product and Banner module. */
function placeBreakdowns(items: readonly Listed[], base: "/tables" | "/forms"): Breakdown[] {
  const href = (product: string, modules: string[]) => `${base}?${writeTableFilters({ product, modules, name: "", page: 1 })}`
  const byProduct = productsOf(items).map((p) => ({ label: p.product, count: p.count, href: href(p.product, []) }))
  const { modules } = tableCounts(items, "Banner", { product: "Banner", modules: [], name: "", page: 1 })
  const byModule = modulesOf(items, "Banner").map((m) => ({ label: moduleLabel(m), count: modules.get(m)!, href: href("Banner", [m]) }))
  return [
    { title: "By product", bits: byProduct },
    { title: "Banner, by module", bits: byModule },
  ]
}

export function tableWay(tables: readonly ListTable[]): Way {
  return { count: tables.length, extra: tables.reduce((sum, t) => sum + t.columns, 0), breakdowns: placeBreakdowns(tables, "/tables") }
}

export function formWay(forms: readonly ListForm[]): Way {
  return { count: forms.length, extra: forms.filter((f) => f.table).length, breakdowns: placeBreakdowns(forms, "/forms") }
}
