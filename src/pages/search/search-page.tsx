// The Search page: one box; results as you type, grouped as APIs, Fields (with their lineage),
// Tables, Forms and Columns, the first 10 of each with "Show all"; the Derived logic and Descriptions switches; "Did you
// mean" when there are few results. The search lives in the address, so Back and bookmarks work. "Families shown"
// (Settings) is honoured.
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useDeferredValue, useId, useMemo, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { useSettingsOpen } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { pageCount } from "@/lib/api-list"
import { titleIfDifferent, versionKey } from "@/lib/api-page"
import { useHiddenFamilies } from "@/lib/families"
import { formPath } from "@/lib/forms"
import { fieldWords } from "@/lib/fields"
import { count, n } from "@/lib/first-run-text"
import { PAGE_SIZES, choosePageSize, usePageSize, type PageSize } from "@/lib/page-size"
import {
  FEW_RESULTS,
  GROUPS,
  resultCount,
  search,
  suggestions,
  type Group,
  type Hit,
  type IndexedApi,
  type IndexedColumn,
  type IndexedField,
  type IndexedForm,
  type IndexedTable,
  type SearchResults,
} from "@/lib/search"
import type { Api } from "@/lib/server"
import { columnPath, moduleLabel, moduleOf, tablePath } from "@/lib/tables"
import { useApis } from "@/lib/use-apis"
import { useSearchIndex } from "@/lib/use-search"
import { useStatus } from "@/lib/use-status"
import { apiPath, ListPages } from "@/pages/apis/api-list-page"

/** Each group shows this many before "Show all". */
export const PER_GROUP = 10

const GROUP_NAMES: Record<Group, [string, string]> = {
  apis: ["APIs", "API"],
  fields: ["Fields", "field"],
  tables: ["Tables", "table"],
  forms: ["Forms", "form"],
  columns: ["Columns", "column"],
}

/** What the address holds: `?q=widget+code`, `derived=off`, `descriptions=on`, `show=fields`, `page=2`. */
interface Wanted {
  q: string
  derived: boolean
  descriptions: boolean
  show: Group | null
  page: number
}

function readWanted(params: URLSearchParams): Wanted {
  const show = params.get("show")
  const page = Number.parseInt(params.get("page") ?? "1", 10)
  return {
    q: params.get("q") ?? "",
    derived: params.get("derived") !== "off",
    descriptions: params.get("descriptions") === "on",
    show: GROUPS.includes(show as Group) ? (show as Group) : null,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

function writeWanted(w: Wanted): URLSearchParams {
  const params = new URLSearchParams()
  if (w.q) params.set("q", w.q)
  if (!w.derived) params.set("derived", "off")
  if (w.descriptions) params.set("descriptions", "on")
  if (w.show) params.set("show", w.show)
  if (w.show && w.page > 1) params.set("page", String(w.page))
  return params
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = params.toString()
  const wanted = useMemo(() => readWanted(new URLSearchParams(query)), [query])
  const { apis, error: apisError } = useApis()
  const { index, descriptions, error, descriptionsError, retry } = useSearchIndex(apis, wanted.descriptions)
  const hidden = useHiddenFamilies()
  const hiddenSet = useMemo(() => new Set(hidden), [hidden])
  const { status } = useStatus()
  const { openAt: openSettingsAt } = useSettingsOpen()
  const ids = useId()

  // The box and switches follow `wanted` at once; the results follow `shown`, which React lets lag behind while you
  // type, so each key reaches the box before the search (up to about 200 ms on a big catalog) runs.
  const shown = useDeferredValue(wanted)
  const results = useMemo(
    () =>
      index
        ? search(index, shown.q, { derived: shown.derived, descriptions: shown.descriptions, hidden: hiddenSet, fieldDescriptions: descriptions })
        : null,
    [index, shown.q, shown.derived, shown.descriptions, hiddenSet, descriptions],
  )
  const found = results ? resultCount(results) : 0
  const typed = shown.q.trim() !== ""
  const tryInstead = useMemo(() => (index && results && typed && found < FEW_RESULTS ? suggestions(index, shown.q) : []), [index, results, typed, found, shown.q])

  // Typing, and the switches, replace the address rather than adding a step to Back for every key.
  const update = (change: Partial<Wanted>) => setParams(writeWanted({ ...wanted, page: 1, ...change }), { replace: true })
  const families = status?.index.state === "ready" ? status.index.summary.families : []
  const productOf = (family: string) => families.find((f) => f.name === family)?.product ?? ""
  const byId = useMemo(() => new Map((apis ?? []).map((a) => [a.id, a])), [apis])

  return (
    <div className="space-y-5">
      <h1 className="font-head text-2xl">Search</h1>
      <div className="space-y-3">
        <Input
          type="search"
          aria-label="Search"
          placeholder="Search APIs, fields, tables, forms and columns…"
          className="font-names"
          autoFocus
          value={wanted.q}
          onChange={(e) => update({ q: e.target.value, show: null })}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-2">
            <Checkbox id={`${ids}-derived`} checked={wanted.derived} onCheckedChange={(c) => update({ derived: c === true })} />
            <Label htmlFor={`${ids}-derived`} className="font-normal">
              Derived logic
            </Label>
          </span>
          <span className="flex items-center gap-2">
            <Checkbox id={`${ids}-descriptions`} checked={wanted.descriptions} onCheckedChange={(c) => update({ descriptions: c === true })} />
            <Label htmlFor={`${ids}-descriptions`} className="font-normal">
              Descriptions
            </Label>
          </span>
          {wanted.descriptions && !descriptions && !descriptionsError && index && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading the fields' descriptions…
            </span>
          )}
          {wanted.descriptions && descriptionsError && (
            <span className="text-sm text-muted-foreground">Couldn't load the fields' descriptions; searching the APIs' own.</span>
          )}
        </div>
      </div>

      {error || apisError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load search</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Is the app still running in the terminal?</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : !index || !results ? (
        <p className="flex items-center gap-2">
          <Spinner /> Preparing search…
        </p>
      ) : !typed ? (
        <div className="space-y-2 text-muted-foreground">
          <p>Search the names of APIs, fields, tables, forms and columns, and the fields' lineage, all at once.</p>
          <p>
            Capitals don't matter, every word you type must appear, and part of a word is enough: for example{" "}
            <span className="font-names text-foreground">pidm</span> or <span className="font-names text-foreground">activity date</span>.
          </p>
        </div>
      ) : (
        <>
          {found === 0 && <p>Nothing matches.</p>}
          {tryInstead.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>Did you mean</span>
              {tryInstead.map((s) => (
                <Button key={s} variant="outline" size="sm" className="font-names" onClick={() => setParams(writeWanted({ ...shown, page: 1, q: s, show: null }), { replace: true })}>
                  {s}
                </Button>
              ))}
            </div>
          )}

          {shown.show ? (
            <OneGroup
              group={shown.show}
              results={results}
              page={shown.page}
              hrefFor={(p) => `?${writeWanted({ ...shown, page: p })}`}
              onGo={(p) => {
                navigate({ search: writeWanted({ ...shown, page: p }).toString() })
                window.scrollTo({ top: 0 })
              }}
              onPageSize={(p) => setParams(writeWanted({ ...shown, page: p }), { replace: true })}
              allHref={`?${writeWanted({ ...shown, show: null })}`}
              byId={byId}
              productOf={productOf}
            />
          ) : (
            GROUPS.map((g) =>
              results[g].length === 0 ? null : (
                <GroupSection
                  key={g}
                  group={g}
                  total={results[g].length}
                  showAll={results[g].length > PER_GROUP ? `?${writeWanted({ ...shown, show: g })}` : null}
                >
                  <Rows group={g} hits={results[g].slice(0, PER_GROUP)} byId={byId} productOf={productOf} />
                </GroupSection>
              ),
            )
          )}

          {results.hidden > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {count(results.hidden, "more result", "more results")} in families hidden in Settings
              <Button variant="outline" size="sm" onClick={() => openSettingsAt("families")}>
                Open Settings
              </Button>
            </p>
          )}
        </>
      )}
    </div>
  )
}

function GroupSection(props: { group: Group; total: number; showAll: string | null; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-head text-sm tracking-wide uppercase">
          {GROUP_NAMES[props.group][0]} ({n(props.total)})
        </h2>
        {props.showAll && (
          <Link to={props.showAll} className="flex items-center text-sm underline">
            Show all {n(props.total)} <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      {props.children}
    </section>
  )
}

/** One group alone, in pages of 20, 50 or 100, as the other lists. */
function OneGroup(props: {
  group: Group
  results: SearchResults
  page: number
  hrefFor: (page: number) => string
  onGo: (page: number) => void
  onPageSize: (page: number) => void
  allHref: string
  byId: Map<string, Api>
  productOf: (family: string) => string
}) {
  const size = usePageSize()
  const hits = props.results[props.group]
  const pages = pageCount(hits.length, size)
  const page = Math.min(props.page, pages)
  const first = (page - 1) * size + 1
  const [plural, one] = GROUP_NAMES[props.group]

  // A new page size keeps the first result you were looking at on the page.
  function changeSize(next: PageSize) {
    choosePageSize(next)
    props.onPageSize(Math.floor((first - 1) / next) + 1)
  }

  return (
    <section className="space-y-3">
      <Link to={props.allHref} className="flex w-fit items-center text-sm underline">
        <ChevronLeft className="size-4" /> All results
      </Link>
      <h2 className="font-head text-sm tracking-wide uppercase">
        {plural} ({n(hits.length)})
      </h2>
      {hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <p>
            {pages > 1 ? `${n(first)}–${n(Math.min(first + size - 1, hits.length))} of ` : ""}
            {count(hits.length, one, one === "API" ? "APIs" : `${one}s`)}
          </p>
          {pages > 1 && <PageStepper page={page} pages={pages} hrefFor={props.hrefFor} onGo={props.onGo} />}
          {hits.length > PAGE_SIZES[0] && <PageSizePicker size={size} onChange={changeSize} things={plural} />}
        </div>
      )}
      <Rows group={props.group} hits={hits.slice(first - 1, first - 1 + size)} byId={props.byId} productOf={props.productOf} />
      {pages > 1 && <ListPages page={page} pages={pages} hrefFor={props.hrefFor} onGo={props.onGo} />}
    </section>
  )
}

function Rows(props: { group: Group; hits: Hit<unknown>[]; byId: Map<string, Api>; productOf: (family: string) => string }) {
  return (
    <ul className="border-2 border-border bg-card shadow-md">
      {props.hits.map((hit, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border/30 px-3 py-2 last:border-b-0 sm:flex-nowrap">
          {props.group === "apis" && <ApiRow hit={hit as Hit<IndexedApi>} />}
          {props.group === "fields" && <FieldRow hit={hit as Hit<IndexedField>} byId={props.byId} productOf={props.productOf} />}
          {props.group === "tables" && <TableRow hit={hit as Hit<IndexedTable>} />}
          {props.group === "forms" && <FormRow hit={hit as Hit<IndexedForm>} />}
          {props.group === "columns" && <ColumnRow hit={hit as Hit<IndexedColumn>} />}
        </li>
      ))}
    </ul>
  )
}

const Why = ({ hit }: { hit: Hit<unknown> }) => (hit.why ? <Badge variant="outline">in {hit.why}</Badge> : null)

function ApiRow({ hit }: { hit: Hit<IndexedApi> }) {
  const { api } = hit.item
  const title = titleIfDifferent(api.versions.at(-1)?.details?.title ?? null, api.name)
  return (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-2 sm:w-2/5">
        <Link to={apiPath(api)} className="font-names break-all underline">
          {api.name}
        </Link>
        <Why hit={hit} />
      </span>
      <span className="font-names w-full text-sm break-all text-muted-foreground sm:w-1/4">{api.family}</span>
      {title && <span className="w-full min-w-0 text-sm sm:flex-1">{title}</span>}
    </>
  )
}

/**
 * Where a field result goes: its API's page at the newest version that has it, with the Fields filter set to the
 * field (`?field=`), and its schema for one in a schema no method uses.
 */
export function fieldLink(api: Api, f: IndexedField): string {
  const newest = Math.max(...f.field.v)
  const params = new URLSearchParams()
  if (newest !== api.versions.length - 1 && api.versions[newest]) params.set("version", versionKey(api.versions[newest]))
  params.set("field", f.field.path)
  if (f.field.schema) params.set("schema", f.field.schema)
  return `${apiPath(api)}?${params}`
}

function FieldRow({ hit, byId, productOf }: { hit: Hit<IndexedField>; byId: Map<string, Api>; productOf: (family: string) => string }) {
  const f = hit.item
  const api = byId.get(f.apiId)
  if (!api) return null
  const newest = Math.max(...f.field.v)
  const olderOnly = !f.field.v.includes(api.versions.length - 1)
  const version = api.versions[newest]
  const places = (f.field.values ?? []).flatMap((v) => v.places ?? [])
  const product = productOf(api.family)
  const words = places.length ? null : fieldWords({ name: "", depth: 0, values: f.field.values })
  return (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-2 sm:w-2/5">
        <Link to={fieldLink(api, f)} className="font-names break-all underline">
          {f.field.path}
        </Link>
        {f.field.schema && <span className="text-sm text-muted-foreground">in {f.field.schema}</span>}
        <Why hit={hit} />
      </span>
      <span className="w-full text-sm text-muted-foreground sm:w-1/4">
        <Link to={apiPath(api)} className="font-names break-all hover:underline">
          {api.name}
        </Link>{" "}
        {olderOnly ? "(older versions only)" : version && <span className="font-names">{versionKey(version)}</span>}
      </span>
      <span className="flex w-full min-w-0 flex-col gap-1 text-sm sm:flex-1">
        {places.map((p, i) => (
          <span key={i} className="flex flex-wrap items-center gap-2">
            <span className="font-names break-all">
              <Link to={tablePath(product, p.table)} className="underline">
                {p.table}
              </Link>
              {p.column && (
                <>
                  .
                  <Link to={columnPath(product, p.table, p.column)} className="underline">
                    {p.column}
                  </Link>
                </>
              )}
            </span>
            {p.probable && <Badge variant="outline">probable</Badge>}
          </span>
        ))}
        {words && <span className="text-muted-foreground">{words}</span>}
      </span>
    </>
  )
}

function TableRow({ hit }: { hit: Hit<IndexedTable> }) {
  const { table } = hit.item
  const module = moduleOf(table.product, table.name)
  return (
    <>
      <Link to={tablePath(table.product, table.name)} className="font-names break-all underline sm:w-2/5">
        {table.name}
      </Link>
      <span className="text-sm text-muted-foreground">
        {table.product}
        {module && ` · ${moduleLabel(module)}`}
      </span>
    </>
  )
}

function FormRow({ hit }: { hit: Hit<IndexedForm> }) {
  const { form } = hit.item
  const module = moduleOf(form.product, form.code)
  const hidden = useHiddenFamilies()
  const shown = form.apis.filter((id) => !hidden.includes(id.slice(0, id.indexOf("/")))).length
  return (
    <>
      <Link to={formPath(form.product, form.code)} className="font-names break-all underline sm:w-1/5">
        {form.code}
      </Link>
      <span className="sm:w-2/5">{form.title ?? <span className="text-sm text-muted-foreground">no title in the catalog</span>}</span>
      <span className="text-sm text-muted-foreground">
        {form.product}
        {module && ` · ${moduleLabel(module)}`} · {count(shown, "API", "APIs")}
      </span>
    </>
  )
}

function ColumnRow({ hit }: { hit: Hit<IndexedColumn> }) {
  const c = hit.item
  const hidden = useHiddenFamilies()
  const shown = c.apis.filter((id) => !hidden.includes(id.slice(0, id.indexOf("/")))).length
  return (
    <>
      <Link to={columnPath(c.table.product, c.table.name, c.name)} className="font-names break-all underline sm:w-2/5">
        {c.name}
      </Link>
      <span className="text-sm text-muted-foreground sm:w-1/4">
        <span className="font-names">{c.table.name}</span> · {c.table.product}
      </span>
      <span className="text-sm text-muted-foreground tabular-nums">{count(shown, "API", "APIs")}</span>
    </>
  )
}
