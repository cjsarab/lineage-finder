// A table's page: its columns, with how many APIs use each, and every API and field that uses
// it, across all versions. Both lists have a filter and pages once they pass the page size. "Families shown"
// (Settings) is honoured. Narrowed to one column at the column's own address: the column
// marked in the list, and the APIs keeping only the fields that name it. A newly chosen column scrolls to its APIs,
// wherever it was chosen from, with a way back up to the list. Also the query parameters that filter on it, and which
// APIs have it as their base table, with a tick box to show only those; "Also a form" when a form shares its name, and
// a name that's a form rather than a table points to the form; and the APIs whose lookups or derived logic name it, in
// the same list, with a Show choice when there's more than one kind.
import { ArrowUp } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useLocation, useParams } from "react-router"
import { StarButton } from "@/components/favourites/star-button"
import { Notice } from "@/components/notice"
import { BackToList, DetailsList, FamilyCounts, FilterBox, Paged } from "@/components/page-parts"
import { useSettingsOpen } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useHiddenFamilies } from "@/lib/families"
import { recordRecent } from "@/lib/favourites"
import { count, n } from "@/lib/first-run-text"
import { matchesQuery } from "@/lib/search"
import type { TableApi, TableDetail, TableField } from "@/lib/server"
import {
  columnCount,
  columnPath,
  matchingFields,
  moduleLabel,
  moduleOf,
  SHOW_LABELS,
  SHOW_NOTES,
  showCounts,
  showing,
  shownColumn,
  shownTable,
  splitApiId,
  tablePath,
  usesOf,
  writeTableFilters,
  type Show,
  type ShownColumn,
  type ShownTable,
} from "@/lib/tables"
import { formPath } from "@/lib/forms"
import { useForms, useTable } from "@/lib/use-tables"
import { apiPath } from "@/pages/apis/api-list-page"
import { Typos } from "@/pages/apis/lineage-parts"

export function TablePage() {
  const params = useParams()
  const product = params.product ?? ""
  const name = params.name ?? ""
  const column = params.column ?? null
  const { table, error } = useTable(product, name)
  const { forms } = useForms()
  const isForm = forms?.some((f) => f.product === product && f.code === name) ?? false
  const hidden = useHiddenFamilies()
  const { openAt: openSettingsAt } = useSettingsOpen()
  const shown = useMemo(() => (table ? shownTable(table, hidden) : null), [table, hidden])
  const chosen = useMemo(() => (shown && column !== null ? shownColumn(shown, column) : null), [shown, column])

  // A newly chosen column, from this page or elsewhere (an API's lineage, a bookmark), scrolls to its APIs, which are
  // usually below the fold: otherwise the click looks like it did nothing. Only once per
  // column, so changing Families shown doesn't scroll again.
  const columnsRef = useRef<HTMLElement>(null)
  const apisRef = useRef<HTMLElement>(null)
  const scrolledTo = useRef<string | null>(null)
  const ready = chosen !== null
  useEffect(() => {
    if (!ready || column === null) {
      scrolledTo.current = null
      return
    }
    if (scrolledTo.current === column) return
    scrolledTo.current = column
    apisRef.current?.scrollIntoView?.({ behavior: scrollBehaviour(), block: "start" })
  }, [column, ready])
  // Recently viewed: one entry per table, keeping the chosen column. Not for a table that
  // isn't there or that only hidden families use.
  const seen = table && shown && shown.apis.length > 0
  const seenProduct = table?.product ?? ""
  const seenName = table?.name ?? ""
  const seenColumn = chosen !== null ? column : null
  useEffect(() => {
    if (seen) recordRecent({ kind: "table", product: seenProduct, name: seenName, column: seenColumn })
  }, [seen, seenProduct, seenName, seenColumn])

  const backToColumns = () => {
    const row = columnsRef.current?.querySelector('tr[aria-current="true"]') ?? columnsRef.current
    row?.scrollIntoView?.({ behavior: scrollBehaviour(), block: "center" })
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load this table</AlertTitle>
        <AlertDescription>Is the app still running in the terminal?</AlertDescription>
      </Alert>
    )
  }
  if (table === undefined || (table && !shown)) {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Loading the table…
      </p>
    )
  }
  if (table === null || !shown) {
    return (
      <Notice title={`No ${product} table called ${name} in the index.`}>
        {/* Forms' names (once wrongly read as tables) are left out: an old link or favourite lands here. */}
        {isForm && <p className="mb-3">{name} is a form.</p>}
        <div className="flex flex-wrap gap-2">
          {isForm && (
            <Button variant="outline" nativeButton={false} render={<Link to={formPath(product, name)} />}>
              Open the form
            </Button>
          )}
          <Button variant="outline" nativeButton={false} render={<Link to="/tables" />}>
            See every table
          </Button>
        </div>
      </Notice>
    )
  }
  if (shown.apis.length === 0) {
    return (
      <Notice title={`${name} is only used by families hidden in Settings.`}>
        <Button variant="outline" onClick={() => openSettingsAt("families")}>
          Open Settings
        </Button>
      </Notice>
    )
  }

  // A base table is stated by the catalog, so a table that's any API's base table is never "probable" as a whole. Lookups
  // and derived logic don't count either way.
  const probableOnly =
    !table.lookupsOnly &&
    (table.columns.length > 0 ? shown.columns.every((c) => c.probable) : table.apis.every((a) => !a.base && a.fields.every((f) => f.via || f.probable)))
  const where = { product: table.product, table: table.name }
  // A column asked for but not shown: one the table doesn't have, or one only hidden families use.
  const missing = column !== null && !chosen ? column : null

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BackToList to="/tables" all="All tables" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex flex-wrap items-center gap-3 font-names text-2xl font-semibold break-all">
            {table.name}
            {probableOnly && <Badge variant="outline">probable</Badge>}
            {table.lookupsOnly && (
              <Badge variant="outline" title={LOOKUPS_ONLY_NOTE} className="font-sans">
                named only in lookups
              </Badge>
            )}
            <span className="font-sans text-base font-normal">
              <Typos text={table.name} product={table.product} />
            </span>
          </h1>
          <StarButton favourite={{ kind: "table", product: table.product, name: table.name }} what={table.name} />
        </div>
      </div>

      {missing !== null && <MissingColumn table={table} column={missing} onSettings={() => openSettingsAt("families")} />}

      {/* The columns at their own width, with the table's Details beside them, named like the API page's. On a
          narrow window, Details comes first. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(24rem,auto)_minmax(18rem,1fr)] lg:gap-8">
        <Card className="lg:order-2">
          <CardHeader>
            <CardTitle className="font-head text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <TableDetails table={table} shown={shown} probable={probableOnly} form={isForm} />
          </CardContent>
        </Card>
        <section ref={columnsRef} className="min-w-0 scroll-mt-4 space-y-3 lg:order-1">
          <h2 className="font-head text-xl">Columns</h2>
          {shown.columns.length === 0 ? (
            <p className="max-w-md text-muted-foreground">The catalog names no columns for this table, only the table itself.</p>
          ) : (
            <Columns columns={shown.columns} where={where} chosen={chosen ? column : null} />
          )}
        </section>
      </div>

      <section ref={apisRef} className="scroll-mt-4 space-y-3">
        {chosen && column !== null ? (
          <>
            <h2 className="font-head text-xl">
              APIs using <span className="font-names break-all">{column}</span>
            </h2>
            <ColumnSummary column={column} chosen={chosen} where={where} onBackToColumns={backToColumns} />
          </>
        ) : (
          <h2 className="font-head text-xl">APIs using this table</h2>
        )}
        <Apis key={chosen ? column : ""} apis={chosen ? chosen.apis : shown.apis} where={where} oneColumn={chosen !== null} />
      </section>
    </div>
  )
}

/** On a table only lookups name: what that means (the tables list's badge says the same). */
export const LOOKUPS_ONLY_NOTE = "No field's lineage names this table; only the catalog's lookups do. It may be a table or the page where codes are kept."

/**
 * The table's details, laid out like the API page's Details: product, module, counts, families, other products. "APIs"
 * and the families count direct lineage, as the tables list does; lookups and derived logic have rows of their own.
 */
function TableDetails({ table, shown, probable, form }: { table: TableDetail; shown: ShownTable; probable: boolean; form: boolean }) {
  const direct = shown.apis.filter((a) => usesOf(a).direct)
  const uses = showCounts(shown.apis)
  const older = direct.filter((a) => a.older).length
  const counted = direct.length > 0 ? direct : shown.apis
  const families = new Set(counted.map((a) => splitApiId(a.id).family))
  const module = moduleOf(table.product, table.name)

  const rows: [string, ReactNode][] = [["Product", table.product]]
  if (module) {
    rows.push([
      "Module",
      <Link to={`/tables?${writeTableFilters({ product: table.product, modules: [module], name: "", page: 1 })}`} className="underline">
        {moduleLabel(module)}
      </Link>,
    ])
  }
  const base = shown.apis.filter((a) => a.base).length
  if (base > 0) rows.push(["Base table of", count(base, "API", "APIs")])
  rows.push(["Columns", shown.columns.length > 0 ? n(shown.columns.length) : "none named"])
  if (direct.length > 0) rows.push(["APIs", `${n(direct.length)}${older > 0 ? ` (${n(older)} in older versions only)` : ""}`])
  if (uses.lookup > 0) rows.push(["Looked up by", <span title={SHOW_NOTES.lookup}>{count(uses.lookup, "API", "APIs")}</span>])
  if (uses.derived > 0) rows.push(["In derived logic", <span title={SHOW_NOTES.derived}>{count(uses.derived, "API", "APIs")}</span>])
  rows.push([families.size > 1 ? "Families" : "Family", <FamilyCounts apis={counted} />])
  if (table.alsoIn.length > 0) {
    rows.push([
      "Also named in",
      <>
        {table.alsoIn.map((p, i) => (
          <span key={p}>
            {i > 0 && ", "}
            <Link to={tablePath(p, table.name)} className="underline">
              {p}
            </Link>
          </span>
        ))}
      </>,
    ])
  }
  if (form) {
    rows.push([
      "Also a form",
      <Link to={formPath(table.product, table.name)} className="font-names underline">
        {table.name}
      </Link>,
    ])
  }
  if (probable) rows.push(["Probable", "Worked out from the catalog's names rather than read directly."])
  if (table.lookupsOnly) rows.push(["Named only in lookups", LOOKUPS_ONLY_NOTE])

  return <DetailsList rows={rows} />
}

/** Smooth scrolling, unless the system asks for reduced motion. */
function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

/** Where a column link goes from this table. */
type Where = { product: string; table: string }

/**
 * A link that moves between this table's columns (or back to the whole table). It replaces the address rather than
 * adding to it, as switching versions does on the API page, and keeps where you came from, so Back and "Back to the
 * list" still return there.
 */
function SameTableLink(props: { to: string; className?: string; children: ReactNode }) {
  const { state } = useLocation()
  return (
    <Link to={props.to} replace state={state} className={props.className}>
      {props.children}
    </Link>
  )
}

function WholeTableButton({ where }: { where: Where }) {
  const { state } = useLocation()
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={<Link to={tablePath(where.product, where.table)} replace state={state} />}>
      Show all APIs using the whole table
    </Button>
  )
}

/**
 * "SWBWIDG_CODE: 14 APIs (2 in older versions only), 23 fields", the way back up to the Columns list and the way back
 * to the whole table.
 */
function ColumnSummary(props: { column: string; chosen: ShownColumn; where: Where; onBackToColumns: () => void }) {
  const { column, chosen, where, onBackToColumns } = props
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          <span className="font-names break-all">{column}</span>: {count(chosen.apis.length, "API", "APIs")}
          {chosen.older > 0 && ` (${n(chosen.older)} in older versions only)`}, {count(chosen.fields, "field", "fields")}
        </span>
        {chosen.probable && <Badge variant="outline">probable</Badge>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onBackToColumns}>
          <ArrowUp /> Pick another column
        </Button>
        <WholeTableButton where={where} />
      </div>
    </div>
  )
}

/** An address naming a column this table doesn't show: an old bookmark, a catalog update, or hidden families. */
function MissingColumn({ table, column, onSettings }: { table: TableDetail; column: string; onSettings: () => void }) {
  const hiddenOnly = table.columns.some((c) => c.name === column)
  return (
    <Notice title={hiddenOnly ? `${column} is only used by families hidden in Settings.` : `${table.name} has no column called ${column}.`}>
      <div className="flex flex-wrap gap-2">
        <WholeTableButton where={{ product: table.product, table: table.name }} />
        {hiddenOnly && (
          <Button variant="outline" size="sm" onClick={onSettings}>
            Open Settings
          </Button>
        )}
      </div>
    </Notice>
  )
}

function Columns(props: { columns: { name: string; apis: number; probable: boolean }[]; where: Where; chosen: string | null }) {
  const { columns, where, chosen } = props
  const [query, setQuery] = useState("")
  const matched = useMemo(() => columns.filter((c) => matchesQuery(query, c.name)), [columns, query])
  return (
    <Paged
      items={matched}
      focus={chosen === null ? -1 : matched.findIndex((c) => c.name === chosen)}
      things={["column", "columns"]}
      filter={<FilterBox label="Filter by column name" value={query} onChange={setQuery} />}
      showFilter={columns.length > 10}
      empty="No columns match."
      render={(shown) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead className="text-right">APIs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((c) => (
              <TableRow key={c.name} data-state={c.name === chosen ? "selected" : undefined} aria-current={c.name === chosen ? "true" : undefined}>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    {c.name === chosen ? (
                      <span className="font-names font-semibold break-all">{c.name}</span>
                    ) : (
                      <SameTableLink to={columnPath(where.product, where.table, c.name)} className="font-names break-all underline">
                        {c.name}
                      </SameTableLink>
                    )}
                    {c.probable && <Badge variant="outline">probable</Badge>}
                    {/* Columns are starred here only. */}
                    <StarButton
                      favourite={{ kind: "column", product: where.product, table: where.table, column: c.name }}
                      what={c.name}
                      className="ml-auto"
                    />
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{n(c.apis)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    />
  )
}

/**
 * The APIs using the table, or (`oneColumn`) the chosen column: then each field's column isn't repeated. With more than
 * one kind of use, the Show choice, starting on Direct lineage so the page opens as it did before lookups.
 */
function Apis({ apis, where, oneColumn }: { apis: TableApi[]; where: Where; oneColumn: boolean }) {
  const [query, setQuery] = useState("")
  const [onlyBase, setOnlyBase] = useState(false)
  const onlyBaseId = useId()
  const showId = useId()
  const counts = useMemo(() => showCounts(apis), [apis])
  const kinds = SHOWN_KINDS.filter((k) => counts[k] > 0)
  const [chosenShow, setShow] = useState<Show>(counts.direct > 0 ? "direct" : "all")
  const show = kinds.length > 1 ? chosenShow : "all"
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const matched = useMemo(
    () => apis.flatMap((api) => {
      if (onlyBase && !api.base) return []
      const kept = showing(api, show)
      const fields = kept && matchingFields(kept, query)
      return kept && fields ? [{ api, kept, fields }] : []
    }),
    [apis, query, onlyBase, show],
  )
  const anyBase = apis.some((a) => a.base)
  const showBox = apis.length > 5 || apis.some((a) => a.fields.length > FIELDS_SHOWN)
  const toggle = (id: string) =>
    setOpened((o) => {
      const next = new Set(o)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <Paged
      items={matched}
      things={["API", "APIs"]}
      filter={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* Every field in the column view names the same column, so "or column" is left out there. */}
          {showBox && <FilterBox label={oneColumn ? "Filter by API or field" : "Filter by API, field or column"} value={query} onChange={setQuery} />}
          {/* The tick box: only the APIs whose base table this is. */}
          {anyBase && (
            <span className="flex items-center gap-2">
              <Checkbox id={onlyBaseId} checked={onlyBase} onCheckedChange={(c) => setOnlyBase(c === true)} />
              <Label htmlFor={onlyBaseId} className="font-normal">
                Only APIs using it as their base table
              </Label>
            </span>
          )}
          {/* One list, with the Show choice's radio buttons to narrow it. */}
          {kinds.length > 1 && (
            <RadioGroup value={show} onValueChange={(v) => setShow(v as Show)} className="flex w-auto flex-wrap items-center gap-x-5 gap-y-2" aria-label="Show">
              <span className="text-sm text-muted-foreground">Show</span>
              {(["all", ...kinds] as Show[]).map((k) => (
                <span key={k} className="flex items-center gap-2" title={SHOW_NOTES[k]}>
                  <RadioGroupItem value={k} id={`${showId}-${k}`} />
                  <Label htmlFor={`${showId}-${k}`} className="font-normal">
                    {SHOW_LABELS[k]} ({n(counts[k])})
                  </Label>
                </span>
              ))}
            </RadioGroup>
          )}
        </div>
      }
      showFilter={showBox || anyBase || kinds.length > 1}
      empty="No APIs match."
      render={(shown) => (
        <ul className="border-2 border-border bg-card shadow-md">
          {shown.map(({ api, kept, fields }) => (
            <ApiBlock key={api.id} api={kept} full={api} fields={fields} where={where} oneColumn={oneColumn} open={opened.has(api.id)} onToggle={() => toggle(api.id)} />
          ))}
        </ul>
      )}
    />
  )
}

// Fields shown before "Show all": every field for about two APIs in three.
const FIELDS_SHOWN = 6

const SHOWN_KINDS = ["direct", "lookup", "derived"] as const

/** "3 fields · 1 parameter · 2 lookups · 1 derived note": what an API's lines are, by kind. */
function lineCounts(fields: readonly TableField[]): { label: string; words: [string, string] }[] {
  const kinds: { test: (f: TableField) => boolean; words: [string, string] }[] = [
    { test: (f) => !f.via && !f.parameter, words: ["field", "fields"] },
    { test: (f) => !f.via && f.parameter === true, words: ["parameter", "parameters"] },
    { test: (f) => f.via === "lookup", words: ["lookup", "lookups"] },
    { test: (f) => f.via === "derived", words: ["derived note", "derived notes"] },
  ]
  return kinds.flatMap(({ test, words }) => {
    const count_ = fields.filter(test).length
    return count_ > 0 ? [{ label: count(count_, words[0], words[1]), words }] : []
  })
}

/**
 * One API using the table: its name and family on one line, with labels for lookups and derived logic, the
 * counts on the right, then its fields in two columns on a wide window, the first few only until opened. `api` is what
 * the Show choice keeps, `full` the whole API (for its labels), and `fields` what the filter leaves.
 */
function ApiBlock(props: { api: TableApi; full: TableApi; fields: TableField[]; where: Where; oneColumn: boolean; open: boolean; onToggle: () => void }) {
  const { api, full, fields, where, oneColumn, open, onToggle } = props
  const { family, name } = splitApiId(api.id)
  const uses = usesOf(full)
  const filtered = fields.length < api.fields.length
  const shown = open ? fields : fields.slice(0, FIELDS_SHOWN)
  // Columns from lineage only: a derived note's column is shown on its line.
  const columns = columnCount(api.fields.filter((f) => !f.via))
  const kinds = lineCounts(api.fields)
  const what: [string, string] =
    kinds.length === 1 ? kinds[0].words : api.fields.every((f) => !f.via) ? ["field or parameter", "fields and parameters"] : ["item", "items"]
  return (
    <li className="space-y-2 border-b border-border/30 px-3 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to={apiPath({ family, name })} className="font-names font-semibold [overflow-wrap:anywhere] underline">
            {name}
          </Link>
          <span className="font-names text-sm text-muted-foreground">{family}</span>
          {api.base && <Badge>base table</Badge>}
          {uses.lookup && (
            <Badge variant="outline" title={SHOW_NOTES.lookup}>
              {uses.direct ? "looks it up" : "looks it up only"}
            </Badge>
          )}
          {uses.derived && (
            <Badge variant="outline" title={SHOW_NOTES.derived}>
              derived logic
            </Badge>
          )}
          {api.older && <span className="text-sm text-muted-foreground">older versions only</span>}
        </h3>
        <span className="text-sm text-muted-foreground tabular-nums">
          {kinds.length === 0
            ? "base table only"
            : filtered
              ? `${n(fields.length)} of ${count(api.fields.length, what[0], what[1])} match`
              : kinds.map((k) => k.label).join(" · ")}
          {columns > 0 && !oneColumn && ` · ${count(columns, "column", "columns")}`}
        </span>
      </div>
      <ul className="gap-x-8 md:columns-2">
        {shown.map((f, i) => (
          <li key={i} className="flex break-inside-avoid flex-wrap items-center gap-x-2 py-0.5">
            <span className="font-names [overflow-wrap:anywhere]">{f.path}</span>
            {f.column && !oneColumn && (
              <SameTableLink to={columnPath(where.product, where.table, f.column)} className="font-names [overflow-wrap:anywhere] text-muted-foreground underline">
                {f.column}
              </SameTableLink>
            )}
            {f.via && (
              <span className={`[overflow-wrap:anywhere] text-muted-foreground ${f.via === "derived" ? "text-sm" : ""}`}>
                {f.via === "lookup" ? "Lookup: " : "Derived logic: "}
                <span className={f.via === "lookup" ? "font-names" : ""}>{f.text}</span>
              </span>
            )}
            {f.parameter && <Badge variant="outline">query parameter</Badge>}
            {f.probable && <Badge variant="outline">probable</Badge>}
            {f.schema && <span className="text-sm text-muted-foreground">in {f.schema}, not used by any method</span>}
            {f.older && !api.older && <span className="text-sm text-muted-foreground">older versions</span>}
          </li>
        ))}
      </ul>
      {fields.length > FIELDS_SHOWN && (
        <Button variant="outline" size="sm" onClick={onToggle}>
          {open ? "Show fewer" : filtered ? `Show all ${n(fields.length)} matching` : `Show all ${count(fields.length, what[0], what[1])}`}
        </Button>
      )}
    </li>
  )
}
