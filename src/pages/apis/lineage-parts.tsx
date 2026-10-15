// The small pieces that draw lineage on an API's page, shared by "Fields and lineage",
// the query parameters and the base table: names, links to table and column
// pages, and the catalog's own words, with the names in lookups and derived logic linked.
import { Fragment, type ReactNode } from "react"
import { Link } from "react-router"
import { Badge } from "@/components/ui/badge"
import { useHiddenFamilies } from "@/lib/families"
import { formPath } from "@/lib/forms"
import type { Link as NameLink, Value } from "@/lib/server"
import { columnPath, splitApiId, tablePath } from "@/lib/tables"
import { typoNote, typosIn, type Typo } from "@/lib/typos"
import { useStatus } from "@/lib/use-status"
import { useTables } from "@/lib/use-tables"
import { apiPath } from "./api-list-page"

/** Tables are kept by product, so a table (and a column) links within the API's own product. */
export function useProductOf(family: string): string {
  const { status } = useStatus()
  const families = status?.index.state === "ready" ? status.index.summary.families : []
  return families.find((f) => f.name === family)?.product ?? ""
}

// Names longer than this may wrap on a wide window; shorter ones stay on one line (about
// 1 name in 100 is longer).
const NAME_CAP = 32

/**
 * A field, table or column name. On a wide window it never breaks mid-word: short names stay on one line, so their
 * column widens to fit; a long one gets a 32-character box and wraps after `_` or `.` or before a capital letter.
 * On a narrow window a name may break anywhere it has to.
 */
export function Name({ text, title }: { text: string; title?: string }) {
  if (text.length <= NAME_CAP)
    return (
      <span className="font-names max-md:break-all md:whitespace-nowrap" title={title}>
        {text}
      </span>
    )
  const parts = text.split(/(?<=[_.])|(?<=[a-z0-9])(?=[A-Z])/)
  return (
    <span className="font-names max-md:break-all md:inline-block md:w-[32ch] md:break-words" title={title}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </span>
  )
}

export function TableLink({ product, table }: { product: string; table: string }) {
  return (
    <>
      <Link to={tablePath(product, table)} className="underline">
        <Name text={table} />
      </Link>
      <Typos text={table} product={product} />
    </>
  )
}

/**
 * "probably SMAPRLE" beside a name the catalog probably mistyped, linking to the name meant, with how it was
 * checked on hover. `linked={false}` inside something that's already a link (a list row). Oracle's own names have no page
 * in the app, so aren't linked.
 */
export function TypoBadge({ typo, product, linked = true }: { typo: Typo; product: string; linked?: boolean }) {
  const badge = (
    <Badge variant="outline" title={typoNote(typo)}>
      probably {typo.probably}
    </Badge>
  )
  return linked && typo.kind !== "oracle" ? (
    <Link to={typo.kind === "form" ? formPath(product, typo.probably) : tablePath(product, typo.probably)} className="no-underline">
      {badge}
    </Link>
  ) : (
    badge
  )
}

/** A badge for each listed typo in a Banner name or value; nothing for other products. */
export function Typos({ text, product, linked }: { text: string; product: string; linked?: boolean }) {
  if (product !== "Banner") return null
  return (
    <>
      {typosIn(text).map((t) => (
        <TypoBadge key={t.name} typo={t} product={product} linked={linked} />
      ))}
    </>
  )
}

export function ColumnLink({ product, table, column }: { product: string; table: string; column: string }) {
  return (
    <Link to={columnPath(product, table, column)} className="underline">
      <Name text={column} />
    </Link>
  )
}

/**
 * A lineage value exactly as the catalog writes it, with "Lookup:" or "Derived logic:" before those kinds, and the names
 * in a lookup or derived logic linked.
 */
export function AsWritten({ value, product }: { value: Value; product: string }) {
  const label = value.kind === "lookup" ? "Lookup: " : value.kind === "derived" ? "Derived logic: " : ""
  // Typos are marked in names (tables, lookups), not in derived logic's sentences; a value naming a table has the mark
  // beside the table instead, so it shows once. Every listed typo is a Banner name.
  const typos = value.kind === "derived" || value.places?.length ? [] : typosIn(value.text)
  return (
    <span className={`block break-words whitespace-pre-line ${value.kind === "ref" ? "font-names" : ""}`}>
      {label && <span className="text-muted-foreground">{label}</span>}
      <LinkedText text={value.text} links={value.links ?? []} product={product} />
      {typos.map((t) => (
        <span key={t.name} className="ml-2 font-sans">
          <TypoBadge typo={t} product="Banner" />
        </span>
      ))}
    </span>
  )
}

/**
 * A query parameter's lineage, under its name: "table · column" as links, with "probable" where it was
 * inferred; the catalog's words, in grey, for a value that names no table.
 */
export function ParameterLineage({ values, product }: { values: Value[]; product: string }) {
  return (
    <span className="mt-0.5 block basis-full space-y-0.5 text-sm">
      {values.map((v, i) =>
        v.places?.length ? (
          v.places.map((p, j) => (
            <span key={`${i} ${j}`} className="flex flex-wrap items-center gap-x-2">
              <TableLink product={product} table={p.table} />
              {p.column && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <ColumnLink product={product} table={p.table} column={p.column} />
                </>
              )}
              {p.probable && <Badge variant="outline">probable</Badge>}
            </span>
          ))
        ) : (
          <span key={i} className="text-muted-foreground">
            <AsWritten value={v} product={product} />
          </span>
        ),
      )}
    </span>
  )
}

/** "Base table" or "Base tables". */
export const baseTableLabel = (count: number) => (count === 1 ? "Base table" : "Base tables")

/** An API version's base tables as links: one per line (in Details) or separated by commas. */
export function BaseTables({ tables, product, lines = false }: { tables: string[]; product: string; lines?: boolean }) {
  return (
    <span className={lines ? "flex flex-col items-start" : ""}>
      {tables.map((t, i) => (
        <Fragment key={t}>
          {!lines && i > 0 && ", "}
          <TableLink product={product} table={t} />
        </Fragment>
      ))}
    </span>
  )
}

/**
 * A source value exactly as the catalog writes it (a Banner ERP API's, which names forms and tables together, step
 * 12c), with each name that's a form or a table linked to its page. `self` (the form whose page this is) isn't linked.
 */
export function NamesAsWritten({ text, product, forms, self }: { text: string; product: string; forms: ReadonlySet<string>; self?: string }) {
  const { tables: all } = useTables()
  const tables = new Set((all ?? []).filter((t) => t.product === product).map((t) => t.name))
  const links: NameLink[] = []
  for (const m of text.matchAll(/[A-Za-z0-9$#]+/g)) {
    const name = m[0].toUpperCase()
    if (name === self) continue
    if (forms.has(name)) links.push({ at: m.index, length: m[0].length, form: name })
    else if (tables.has(name)) links.push({ at: m.index, length: m[0].length, table: name })
  }
  return (
    <span className="font-names [overflow-wrap:anywhere]">
      <LinkedText text={text} links={links} product={product} />
    </span>
  )
}

/** Where a name inside a value goes: a column's own address, a table, a form or an API. */
function pathOf(link: NameLink, product: string): string | null {
  if (link.table && link.column) return columnPath(product, link.table, link.column)
  if (link.table) return tablePath(product, link.table)
  if (link.form) return formPath(product, link.form)
  if (link.api) return apiPath(splitApiId(link.api))
  return null
}

/**
 * Text exactly as written, with the names in `links` (in order) linked: a lookup's, derived logic's or an ERP
 * source's. An API whose family is hidden says so after its name.
 */
export function LinkedText({ text, links, product }: { text: string; links: readonly NameLink[]; product: string }) {
  const hidden = useHiddenFamilies()
  const parts: ReactNode[] = []
  let from = 0
  for (const link of links) {
    const to = pathOf(link, product)
    if (link.at < from || to === null) continue
    parts.push(text.slice(from, link.at))
    parts.push(
      <Link to={to} className="underline">
        {text.slice(link.at, link.at + link.length)}
      </Link>,
    )
    if (link.api && hidden.includes(splitApiId(link.api).family)) parts.push(" (hidden in Settings)")
    from = link.at + link.length
  }
  parts.push(text.slice(from))
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  )
}

