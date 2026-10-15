// Comparing two versions of an API, at `/apis/<family>/<name>/compare?from=&to=`:
// pickers (older → newer only), a "What changed" Details box, then the query parameters, the fields and lineage and the
// other schemas, each change marked, under "Only changes" or "Everything", as one list or side by side. Long lists fold.
import { ArrowLeft, ChevronRight, Info } from "lucide-react"
import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { DetailsList } from "@/components/page-parts"
import { Notice } from "@/components/notice"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { headersLine, versionKey, versionLabel } from "@/lib/api-page"
import { chooseComparison, compareDetails, compareFields, compareHeaders, compareParameters, type FieldRow, type Mark, type ParameterGroup, type ParameterRow } from "@/lib/compare"
import { chooseCompareLayout, useCompareLayout, type CompareLayout } from "@/lib/compare-layout"
import { fieldWords } from "@/lib/fields"
import { count, n } from "@/lib/first-run-text"
import { choosePageSize, usePageSize } from "@/lib/page-size"
import type { Api, ApiVersion, Field, MethodParameters, Parameter, Value, VersionFields } from "@/lib/server"
import { useApiFields, useApiParameters } from "@/lib/use-api-data"
import { ApiGate } from "./api-gate"
import { apiPath } from "./api-list-page"
import { CountedHeading, Fold } from "./fold"
import { AsWritten, ColumnLink, Name, ParameterLineage, TableLink, useProductOf } from "./lineage-parts"

export function ComparePage() {
  return <ApiGate>{(api) => <Compare api={api} />}</ApiGate>
}

export type Show = "changes" | "all"

function Compare({ api }: { api: Api }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { from, to, problem } = chooseComparison(api, params.get("from"), params.get("to"))
  const vs = api.versions
  // Show starts on Only changes each time; Layout is remembered.
  const [show, setShow] = useState<Show>("changes")
  const layout = useCompareLayout()
  const product = useProductOf(api.family)
  const p = useApiParameters(api.family, api.name)
  const f = useApiFields(api.family, api.name)

  // Picking versions replaces the address rather than adding to it, as the API page's version buttons do.
  const setPair = (a: ApiVersion, b: ApiVersion) =>
    setParams(new URLSearchParams({ from: versionKey(a), to: versionKey(b) }), { replace: true, state: location.state })
  const pickFrom = (key: string) => {
    const i = vs.findIndex((v) => versionKey(v) === key)
    setPair(vs[i], vs.indexOf(to) > i ? to : vs[i + 1])
  }

  return (
    <div className="space-y-6">
      <BackToApi api={api} to={to} />
      <header className="space-y-2">
        <h1 className="font-head text-2xl">
          Compare versions of <span className="font-names break-all">{api.name}</span>
        </h1>
        <p className="text-muted-foreground">
          <Link to={`/apis?family=${encodeURIComponent(api.family)}`} className="font-names underline">
            {api.family}
          </Link>
        </p>
      </header>

      {problem && (
        <Alert>
          <Info />
          <AlertTitle>{problem} Showing the newest two versions.</AlertTitle>
        </Alert>
      )}

      {/* Older → newer only: an old version is only ever compared with a newer one. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <VersionPicker label="From" shown="From" versions={vs.slice(0, -1)} value={from} onChange={pickFrom} />
        <VersionPicker
          label="To"
          shown="to"
          versions={vs.slice(vs.indexOf(from) + 1)}
          value={to}
          onChange={(key) => setPair(from, vs.find((v) => versionKey(v) === key)!)}
        />
      </div>

      {!from.details || !to.details ? (
        <Notice title={`Version ${versionKey(from.details ? to : from)}'s spec couldn't be read.`}>
          <p>{(from.details ? to : from).problem ?? "The folder has no spec file."}</p>
        </Notice>
      ) : p.error || f.error ? (
        <p className="text-muted-foreground">Couldn't load the fields and parameters. Is the app still running in the terminal?</p>
      ) : !p.versions || !f.versions ? (
        <p className="flex items-center gap-2">
          <Spinner /> Loading…
        </p>
      ) : (
        <Comparison
          // Keyed by the pair, so folding starts afresh; the lists are keyed by Show too.
          key={`${from.folder} ${to.folder}`}
          from={from}
          to={to}
          params={[p.versions[from.folder] ?? [], p.versions[to.folder] ?? []]}
          fields={[f.versions[from.folder], f.versions[to.folder]]}
          show={show}
          setShow={setShow}
          layout={layout}
          product={product}
        />
      )}
    </div>
  )
}

/** The same button as the other pages' "Back to the list": the API page as you left it, else on the newer version. */
function BackToApi({ api, to }: { api: Api; to: ApiVersion }) {
  const navigate = useNavigate()
  const fromApi = (useLocation().state as { fromApi?: boolean } | null)?.fromApi === true
  const newest = to === api.versions.at(-1)
  const label = (
    <>
      <ArrowLeft /> Back to {api.name}
    </>
  )
  return fromApi ? (
    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
      {label}
    </Button>
  ) : (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={newest ? apiPath(api) : `${apiPath(api)}?version=${encodeURIComponent(versionKey(to))}`} />}>
      {label}
    </Button>
  )
}

function VersionPicker(props: { label: string; shown: string; versions: ApiVersion[]; value: ApiVersion; onChange: (key: string) => void }) {
  const items = props.versions.map((v) => ({ value: versionKey(v), label: versionKey(v) }))
  return (
    <span className="flex items-center gap-2">
      <span className="font-head">{props.shown}</span>
      <Select value={versionKey(props.value)} items={items} onValueChange={(v) => v && props.onChange(v as string)}>
        <SelectTrigger className="w-44" aria-label={props.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.versions.map((v) => (
            <SelectItem key={v.folder} value={versionKey(v)}>
              <span className="font-names">{versionKey(v)}</span>
              {versionLabel(v) && <span className="text-muted-foreground"> {versionLabel(v)}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  )
}

/** A row of radio buttons, drawn like the table page's Show choice. */
function Choice<T extends string>(props: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = useId()
  return (
    <RadioGroup value={props.value} onValueChange={(v) => props.onChange(v as T)} className="flex w-auto flex-wrap items-center gap-x-5 gap-y-2" aria-label={props.label}>
      <span className="text-sm text-muted-foreground">{props.label}</span>
      {props.options.map(([value, label]) => (
        <span key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`${id}-${value}`} />
          <Label htmlFor={`${id}-${value}`} className="font-normal">
            {label}
          </Label>
        </span>
      ))}
    </RadioGroup>
  )
}

// ---------- Counting ----------

const tally = (rows: readonly { mark: Mark }[], mark: Mark) => rows.filter((r) => r.mark === mark).length
const listed = (parts: [number, string][]) =>
  parts
    .filter(([k]) => k > 0)
    .map(([k, w]) => `${n(k)} ${w}`)
    .join(", ")
const parameterCounts = (rows: readonly ParameterRow[]) => listed([[tally(rows, "added"), "added"], [tally(rows, "removed"), "removed"], [tally(rows, "changed"), "changed"]])
const lineageChanged = (rows: readonly FieldRow[]) => rows.filter((r) => r.notes.some((x) => x.startsWith("lineage"))).length
const fieldCounts = (rows: readonly FieldRow[]) =>
  listed([[tally(rows, "added"), "added"], [tally(rows, "removed"), "removed"], [tally(rows, "moved"), "moved"]])
const fieldCountsWithLineage = (rows: readonly FieldRow[]) =>
  listed([
    [tally(rows, "added"), "added"],
    [tally(rows, "removed"), "removed"],
    [tally(rows, "moved"), "moved"],
    [lineageChanged(rows), "with lineage changed"],
    [rows.filter((r) => r.mark === "changed" && !r.notes.some((x) => x.startsWith("lineage"))).length, "changed"],
  ])

// ---------- The comparison ----------

/**
 * The comparison under the pickers. Also the body of a changed version's page, comparing the last read with now: there `labels` name the two sides, as both
 * have the same version number, and `intro` replaces the "From version" and "To version" lines.
 */
export function Comparison(props: {
  from: ApiVersion
  to: ApiVersion
  params: [MethodParameters[], MethodParameters[]]
  fields: [VersionFields | undefined, VersionFields | undefined]
  show: Show
  setShow: (s: Show) => void
  layout: CompareLayout
  product: string
  labels?: { from: string; to: string }
  intro?: [string, ReactNode][]
}) {
  const { from, to, show, layout, product } = props
  const [pa, pb] = props.params
  const [fa, fb] = props.fields
  const keys = props.labels ?? { from: versionKey(from), to: versionKey(to) }

  const details = useMemo(() => compareDetails(from, to), [from, to])
  const groups = useMemo(() => compareParameters(pa, pb), [pa, pb])
  const headers = useMemo(() => compareHeaders(pa, pb), [pa, pb])
  const fields = useMemo(() => compareFields(fa?.fields ?? [], fb?.fields ?? []), [fa, fb])
  const others = useMemo(() => {
    const schemas = [...new Set([...(fa?.other ?? []), ...(fb?.other ?? [])].map((o) => o.schema))]
    const of = (v: VersionFields | undefined, s: string) => v?.other.find((o) => o.schema === s)?.fields ?? []
    return schemas.map((schema) => ({ schema, rows: compareFields(of(fa, schema), of(fb, schema)) }))
  }, [fa, fb])

  const parameterRows = groups.flatMap((g) => g.rows).filter((r) => r.mark)
  const fieldsChanged = fields.filter((r) => r.mark)
  const otherRows = others.flatMap((o) => o.rows)
  const otherChanged = otherRows.some((r) => r.mark)
  const nothing =
    details.changes.length === 0 &&
    details.methodsAdded.length === 0 &&
    details.methodsRemoved.length === 0 &&
    parameterRows.length === 0 &&
    headers.line === null &&
    fieldsChanged.length === 0 &&
    !otherChanged

  const rows: [string, ReactNode][] = [
    ...(props.intro ?? [
      ["From version", <span className="font-names">{keys.from}</span>],
      ["To version", <span className="font-names">{keys.to}</span>],
    ]),
    // Each as "new (was old)", with no arrows.
    ...details.changes.map((c): [string, ReactNode] => [
      c.label,
      <>
        <span className="font-names">{c.now}</span>{" "}
        <span className="text-muted-foreground">
          (was <span className="font-names">{c.was}</span>)
        </span>
      </>,
    ]),
  ]
  if (details.methodsAdded.length || details.methodsRemoved.length) {
    rows.push([
      "Methods",
      <>
        {details.methodsAdded.map((m) => (
          <span key={`+${m}`} className="block">
            added <span className="font-names">{m}</span>
          </span>
        ))}
        {details.methodsRemoved.map((m) => (
          <span key={`-${m}`} className="block">
            removed <span className="font-names">{m}</span>
          </span>
        ))}
      </>,
    ])
  }
  if (nothing) rows.push(["Changes", "None: the query parameters, headers, fields, lineage, base table, methods and status are the same."])
  else {
    rows.push(["Query parameters", parameterCounts(parameterRows) || "No change"])
    rows.push(["Headers", headers.line ? <span className="font-names">{headers.line}</span> : "No change"])
    rows.push(["Fields", fieldCounts(fieldsChanged) || "No change"])
    rows.push(["Lineage", lineageChanged(fields) ? `Changed on ${count(lineageChanged(fields), "field", "fields")}` : "No change"])
    if (otherChanged) rows.push(["Other schemas", fieldCountsWithLineage(otherRows)])
  }

  return (
    <>
      {/* Laid out like the API page's Details box, for a consistent look. */}
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="font-head text-lg">What changed</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailsList rows={rows} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
        <Choice
          label="Show"
          value={show}
          options={[
            ["changes", "Only changes"],
            ["all", "Everything"],
          ]}
          onChange={props.setShow}
        />
        {/* Both layouts suit different uses, so a choice on the page, remembered. */}
        <Choice
          label="Layout"
          value={layout}
          options={[
            ["one", "One list"],
            ["side", "Side by side"],
          ]}
          onChange={chooseCompareLayout}
        />
      </div>

      {/* Keyed by Show, so changing it starts the folding afresh without redrawing the choices themselves. */}
      <Parameters key={`p ${show}`} groups={groups} headers={headers} newer={pb} to={to} keys={keys} show={show} layout={layout} product={product} />

      <FieldsFold key={`f ${show}`} title="Fields and lineage" rows={fields} keys={keys} show={show} layout={layout} product={product} />

      {(otherChanged || (show === "all" && others.length > 0)) && (
        <Fold
          key={`o ${show}`}
          level="h2"
          heading="Other schemas in the spec" counts={fieldCountsWithLineage(otherRows) || "no changes"} rows={others.reduce((s, o) => s + shownRows(o.rows, show).length, 0)}>
          <p className="text-muted-foreground">Schemas in the spec that no method uses, as at the end of the API page.</p>
          {others
            .filter((o) => show === "all" || o.rows.some((r) => r.mark))
            .map((o) => (
              <div key={o.schema} className="space-y-2">
                <h3 className="font-names break-all">{o.schema}</h3>
                <FieldsTable rows={o.rows} keys={keys} show={show} layout={layout} product={product} />
              </div>
            ))}
        </Fold>
      )}
    </>
  )
}

// ---------- Marks ----------

function MarkBadge({ mark }: { mark: Mark }) {
  if (mark === "added") return <Badge>+ added</Badge>
  if (mark === "removed") return <Badge variant="destructive">− removed</Badge>
  if (mark === "moved") return <Badge variant="outline">moved</Badge>
  if (mark === "changed") return <Badge variant="outline">changed</Badge>
  return null
}

const Notes = ({ notes }: { notes: string[] }) => (notes.length ? <span className="block font-head text-sm">{notes.join(", ")}</span> : null)

const NotIn = ({ version }: { version: string }) => <span className="text-muted-foreground italic">not in {version}</span>

const hasLineageNote = (notes: string[]) => notes.some((x) => x.startsWith("lineage"))

// ---------- Query parameters ----------

function Parameters(props: {
  groups: ParameterGroup[]
  headers: ReturnType<typeof compareHeaders>
  newer: MethodParameters[]
  to: ApiVersion
  keys: { from: string; to: string }
  show: Show
  layout: CompareLayout
  product: string
}) {
  const { headers, keys, show } = props
  const all = props.groups.flatMap((g) => g.rows)
  const shown = props.groups.map((g) => ({ ...g, rows: show === "changes" ? g.rows.filter((r) => r.mark) : g.rows })).filter((g) => g.rows.length > 0)
  const allHeaders = show === "all" ? headersLine(props.newer, props.to.details?.methods ?? []) : null

  // No fold of its own: each method folds (a long GET is passed by folding it), so one control per list.
  return (
    <section className="space-y-3">
      <CountedHeading level="h2" heading="Query parameters" counts={parameterCounts(all) || "no changes"} />
      {shown.length === 0 && <p className="text-muted-foreground">{show === "changes" || all.length > 0 ? "No changes." : "No query parameters in either version."}</p>}
      {shown.map((g) => (
        <Fold
          key={`${g.method} ${g.path}`}
          level="h3"
          heading={
            <span className="font-names break-all">
              {g.method} {g.path}
            </span>
          }
          counts={`${g.pathWas ? `was ${g.pathWas}; ` : ""}${parameterCounts(g.rows) || `${count(g.rows.length, "parameter", "parameters")}, no changes`}`}
          rows={g.rows.length}
        >
          {props.layout === "one" ? <ParametersOneList rows={g.rows} product={props.product} /> : <ParametersSideBySide rows={g.rows} keys={keys} product={props.product} />}
        </Fold>
      ))}
      {headers.line && (
        <p>
          <span className="font-head">Headers:</span> <span className="font-names break-words">{headers.line}</span>
        </p>
      )}
      {allHeaders && (
        <p>
          <span className="font-head">Headers in {keys.to}:</span> <span className="font-names break-words">{allHeaders}</span>
        </p>
      )}
      {show === "all" && headers.writtenDifferently.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {headers.writtenDifferently.map((h, i) => (
            <Fragment key={`${h.name} ${h.was}`}>
              {i > 0 && " · "}
              <span className="font-names">{h.name}</span> written <span className="font-names">{h.was}</span> in {keys.from}
            </Fragment>
          ))}
        </p>
      )}
    </section>
  )
}

function ParameterBadges({ p }: { p: Parameter }) {
  return (
    <>
      {p.in === "path" && <Badge variant="outline">in the path</Badge>}
      {p.required && <Badge variant="outline">required</Badge>}
    </>
  )
}

/** Like the API page's parameter list, each parameter marked, its old lineage under "was:" when that changed. */
function ParametersOneList({ rows, product }: { rows: ParameterRow[]; product: string }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-l-2 border-border pl-4 max-md:grid-cols-1">
      {rows.map((r) => {
        const p = (r.now ?? r.was)!
        return (
          <div key={`${r.in} ${r.name}`} className="contents">
            <dt className="flex flex-wrap items-center gap-2 max-md:mt-1">
              <MarkBadge mark={r.mark} />
              <span className={`font-names break-all ${r.mark === "removed" ? "line-through" : ""}`}>{r.name}</span>
              <ParameterBadges p={p} />
              {p.values && <ParameterLineage values={p.values} product={product} />}
            </dt>
            <dd className="min-w-0 text-sm">
              <Notes notes={r.notes} />
              {hasLineageNote(r.notes) && r.was?.values?.length ? (
                <span className="block text-muted-foreground line-through">
                  was: <ParameterLineage values={r.was.values} product={product} />
                </span>
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function ParametersSideBySide({ rows, keys, product }: { rows: ParameterRow[]; keys: { from: string; to: string }; product: string }) {
  const side = (p: Parameter | undefined, version: string) =>
    p ? (
      <>
        <span className="block text-sm">{p.required ? "required" : "optional"}</span>
        {p.values && <ParameterLineage values={p.values} product={product} />}
      </>
    ) : (
      <NotIn version={version} />
    )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Parameter</TableHead>
          <TableHead className="font-names">{keys.from}</TableHead>
          <TableHead className="font-names">{keys.to}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.in} ${r.name}`} className="align-top">
            <TableCell className="whitespace-normal">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-names break-all">{r.name}</span>
                {r.in === "path" && <Badge variant="outline">in the path</Badge>}
                <MarkBadge mark={r.mark} />
              </span>
              <Notes notes={r.notes} />
            </TableCell>
            <TableCell className="whitespace-normal">{side(r.was, keys.from)}</TableCell>
            <TableCell className={`whitespace-normal ${hasLineageNote(r.notes) ? "bg-accent" : ""}`}>{side(r.now, keys.to)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------- Fields ----------

const isParentAt = (rows: readonly FieldRow[], i: number) => i + 1 < rows.length && rows[i + 1].path.startsWith(`${rows[i].path}.`)
const parentsOf = (path: string) => path.split(".").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("."))

/** The rows a Show choice lists: under Only changes, the changed ones and the parents they sit under. */
function shownRows(rows: readonly FieldRow[], show: Show): FieldRow[] {
  if (show === "all") return [...rows]
  const holds = new Set(rows.filter((r) => r.mark).flatMap((r) => parentsOf(r.path)))
  return rows.filter((r) => r.mark || holds.has(r.path))
}

function FieldsFold(props: { title: string; rows: FieldRow[]; keys: { from: string; to: string }; show: Show; layout: CompareLayout; product: string }) {
  return (
    <Fold level="h2" heading={props.title} counts={fieldCountsWithLineage(props.rows) || "no changes"} rows={shownRows(props.rows, props.show).length}>
      <FieldsTable {...props} />
    </Fold>
  )
}

function FieldsTable({ rows, keys, show, layout, product }: { rows: FieldRow[]; keys: { from: string; to: string }; show: Show; layout: CompareLayout; product: string }) {
  const shown = useMemo(() => shownRows(rows, show), [rows, show])
  // Parents that hold a change start open, the rest closed.
  const [opened, setOpened] = useState(() => new Set(rows.filter((r) => r.mark).flatMap((r) => parentsOf(r.path))))
  const [page, setPage] = useState(1)
  const size = usePageSize()
  useEffect(() => setPage(1), [show])

  // What's visible once closed parents hide their fields, in pages of top-level fields as on the API page.
  const visible: { row: FieldRow; parent: boolean }[] = []
  const closed: string[] = []
  shown.forEach((row, i) => {
    if (closed.some((c) => row.path.startsWith(`${c}.`))) return
    const parent = isParentAt(shown, i)
    if (parent && !opened.has(row.path)) closed.push(row.path)
    visible.push({ row, parent })
  })
  const tops: (typeof visible)[] = []
  for (const v of visible) (v.row.depth === 0 || tops.length === 0 ? tops[tops.push([]) - 1] : tops[tops.length - 1]).push(v)
  const pages = Math.max(1, Math.ceil(tops.length / size))
  const current = Math.min(page, pages)
  const first = (current - 1) * size
  const onPage = (tops.length > size ? tops.slice(first, first + size) : tops).flat()
  const toggle = (path: string) =>
    setOpened((o) => {
      const next = new Set(o)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  if (shown.length === 0) return <p className="text-muted-foreground">{show === "changes" ? "No changes." : "No fields in either version."}</p>
  return (
    <div className="space-y-3">
      {tops.length > size && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <p>
            {n(first + 1)}–{n(Math.min(first + size, tops.length))} of {count(tops.length, "top-level field", "top-level fields")}
          </p>
          <PageStepper page={current} pages={pages} hrefFor={() => "#"} onGo={setPage} />
          <PageSizePicker
            size={size}
            things="Fields"
            onChange={(next) => {
              choosePageSize(next)
              setPage(Math.floor(first / next) + 1)
            }}
          />
        </div>
      )}
      <Table>
        <TableHeader>
          {layout === "one" ? (
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>As written in the catalog</TableHead>
            </TableRow>
          ) : (
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead className="font-names">{keys.from}</TableHead>
              <TableHead className="font-names">{keys.to}</TableHead>
            </TableRow>
          )}
        </TableHeader>
        <TableBody>
          {onPage.map(({ row, parent }) => (
            <FieldRowView key={`${row.mark} ${row.path}`} row={row} parent={parent} open={opened.has(row.path)} toggle={toggle} context={show === "changes" && !row.mark} keys={keys} layout={layout} product={product} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function FieldRowView(props: {
  row: FieldRow
  parent: boolean
  open: boolean
  toggle: (path: string) => void
  /** A parent shown only for the changes under it: greyed. */
  context: boolean
  keys: { from: string; to: string }
  layout: CompareLayout
  product: string
}) {
  const { row, parent, open, keys, product } = props
  const field = (row.now ?? row.was)!
  const nameCell = (
    <TableCell className="whitespace-normal">
      <span className="flex items-start gap-1" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
        {parent ? (
          <Button variant="ghost" size="icon-xs" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${row.path}`} onClick={() => props.toggle(row.path)} className="-ml-1">
            <ChevronRight className={open ? "rotate-90 transition-transform" : "transition-transform"} />
          </Button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={row.mark === "removed" ? "line-through" : ""}>
            <Name text={row.name} title={row.path} />
          </span>
          {field.list && <span className="text-muted-foreground">(list)</span>}
          <MarkBadge mark={row.mark} />
        </span>
      </span>
      {row.movedFrom !== undefined && (
        <span className="block text-sm text-muted-foreground" style={{ paddingLeft: `${row.depth * 1.25 + 1.25}rem` }}>
          was under {row.movedFrom ? <span className="font-names">{row.movedFrom}</span> : "the top level"}
        </span>
      )}
      {/* Side by side, what changed goes under the name, as for parameters; one list has it with the lineage. */}
      {props.layout === "side" && row.notes.length > 0 && (
        <span className="block" style={{ paddingLeft: `${row.depth * 1.25 + 1.25}rem` }}>
          <Notes notes={row.notes} />
        </span>
      )}
    </TableCell>
  )

  if (props.layout === "side") {
    const side = (f: Field | undefined, version: string) => (f ? <FieldLineage field={f} parent={parent} product={product} /> : <NotIn version={version} />)
    return (
      <TableRow className={`align-top ${props.context ? "text-muted-foreground" : ""}`}>
        {nameCell}
        <TableCell className="whitespace-normal">{side(row.was, keys.from)}</TableCell>
        <TableCell className={`whitespace-normal ${hasLineageNote(row.notes) ? "bg-accent" : ""}`}>{side(row.now, keys.to)}</TableCell>
      </TableRow>
    )
  }

  // One list: the API page's columns for the field as it is now (as it was, if removed), the old words under "was:".
  const words = parent && !field.values ? null : fieldWords(field)
  const places = (field.values ?? []).flatMap((v) => v.places ?? [])
  return (
    <TableRow className={`align-top ${props.context || row.mark === "removed" ? "text-muted-foreground" : ""}`}>
      {nameCell}
      {words !== null ? (
        <TableCell colSpan={2} className="whitespace-normal">
          {words}
        </TableCell>
      ) : (
        <>
          <TableCell className="whitespace-normal">
            {places.map((pl, i) => (
              <span key={i} className="block">
                <TableLink product={product} table={pl.table} />
              </span>
            ))}
          </TableCell>
          <TableCell className="whitespace-normal">
            {places.map((pl, i) => (
              <span key={i} className="flex flex-wrap items-center gap-2">
                {pl.column && <ColumnLink product={product} table={pl.table} column={pl.column} />}
                {pl.probable && <Badge variant="outline">probable</Badge>}
              </span>
            ))}
          </TableCell>
        </>
      )}
      <TableCell className="whitespace-normal">
        <Notes notes={row.notes} />
        <Values values={field.values} product={product} struck={row.mark === "removed"} />
        {hasLineageNote(row.notes) && row.was?.values?.length ? (
          <span className="block text-sm text-muted-foreground">
            was: <Values values={row.was.values} product={product} struck />
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

function Values({ values, product, struck = false }: { values: Value[] | undefined; product: string; struck?: boolean }) {
  return (
    <span className={struck ? "line-through" : ""}>
      {(values ?? []).map((v, i) => (
        <AsWritten key={i} value={v} product={product} />
      ))}
    </span>
  )
}

/** One side of a side-by-side row: the catalog's words, or why there are none. */
function FieldLineage({ field, parent, product }: { field: Field; parent: boolean; product: string }) {
  if (field.values?.length) return <Values values={field.values} product={product} />
  if (parent) return null
  return <span className="text-muted-foreground">{fieldWords(field)}</span>
}
