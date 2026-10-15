// A list of tables or forms: one product at a time, A–Z, with a module
// filter for Banner and a name box; 20, 50 or 100 to a page. The filters and the page live in the address, so Back
// and bookmarks return to the same list. "Families shown" (Settings) is honoured. The Tables and Forms lists differ
// only in their words and rows.
import { useId, useMemo, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { Notice } from "@/components/notice"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { useSettingsOpen } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { pageCount } from "@/lib/api-list"
import { setHiddenFamilies, useHiddenFamilies } from "@/lib/families"
import { count, n } from "@/lib/first-run-text"
import { PAGE_SIZES, choosePageSize, usePageSize, type PageSize } from "@/lib/page-size"
import {
  applyTableFilters,
  moduleLabel,
  modulesOf,
  productsOf,
  readTableFilters,
  tableCounts,
  writeTableFilters,
  type Listed,
  type TableFilters,
} from "@/lib/tables"
import { useStatus } from "@/lib/use-status"
import { cn } from "@/lib/utils"
import { ListPages, useKeepScrollPlace } from "@/pages/apis/api-list-page"

export interface ProductListProps<S, L extends Listed> {
  /** "Tables" or "Forms": the heading. */
  title: string
  /** "table" or "form": in messages and counts ("4 Banner tables"). */
  thing: [string, string]
  /** Everything from the server, or null while loading. */
  loaded: { items: S[] | null; error: boolean; retry: () => void }
  /** The list as shown: hidden families left out. */
  toList: (items: readonly S[], hidden: readonly string[]) => L[]
  /** The name box's words, e.g. "Filter by table name". */
  nameLabel: string
  /** Under the module filter, how modules are worked out. */
  moduleNote: string
  /** When the families shown give none at all. */
  noneAtAll: string
  /** The row of column headings above the list (hidden on a narrow window). */
  headings: ReactNode
  row: (item: L) => ReactNode
}

export function ProductList<S, L extends Listed>(props: ProductListProps<S, L>) {
  const { status } = useStatus()
  const { items, error, retry } = props.loaded
  const { toList } = props
  const hidden = useHiddenFamilies()
  const size = usePageSize()
  const { openAt: openSettingsAt } = useSettingsOpen()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const search = params.toString()
  const filters = useMemo(() => readTableFilters(new URLSearchParams(search)), [search])
  const [one, many] = props.thing

  const list = useMemo(() => (items ? toList(items, hidden) : null), [items, hidden, toList])
  const products = useMemo(() => (list ? productsOf(list) : []), [list])
  // A product no longer in the list (hidden in Settings, or gone after a re-index) falls back to the first.
  const product = products.find((p) => p.product === filters.product)?.product ?? products[0]?.product ?? ""
  const matched = useMemo(() => (list ? applyTableFilters(list, product, filters) : []), [list, product, filters])
  const counts = useMemo(() => (list ? tableCounts(list, product, filters) : null), [list, product, filters])
  const modules = useMemo(() => (list ? modulesOf(list, product) : []), [list, product])

  useKeepScrollPlace(list !== null)

  const families = status?.index.state === "ready" ? status.index.summary.families : null
  if (!families) return null
  const hiddenCount = families.filter((f) => hidden.includes(f.name)).length

  if (hiddenCount === families.length) {
    return (
      <Notice title="Every family is hidden in Settings.">
        <Button variant="outline" onClick={() => setHiddenFamilies([])}>
          Show all
        </Button>
      </Notice>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load the {many}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Is the app still running in the terminal?</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (!list || !counts) {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Loading the {many}…
      </p>
    )
  }
  if (list.length === 0) {
    return <Notice title={props.noneAtAll} />
  }

  const update = (change: Partial<TableFilters>) => setParams(writeTableFilters({ ...filters, page: 1, ...change }), { replace: true })
  const filtered = filters.modules.length > 0 || filters.name.trim() !== ""
  const clear = () => update({ modules: [], name: "" })
  const pages = pageCount(matched.length, size)
  const page = Math.min(filters.page, pages)
  const first = (page - 1) * size + 1
  const hrefFor = (p: number) => `?${writeTableFilters({ ...filters, page: p })}`

  function goToPage(p: number) {
    navigate({ search: writeTableFilters({ ...filters, page: p }).toString() })
    window.scrollTo({ top: 0 })
  }

  // A new page size keeps the first row you were looking at on the page.
  function changeSize(next: PageSize) {
    choosePageSize(next)
    setParams(writeTableFilters({ ...filters, page: Math.floor((first - 1) / next) + 1 }), { replace: true })
  }

  const filterGroups = (
    <ProductModuleFilters
      products={products}
      product={product}
      modules={modules}
      selected={filters.modules}
      counts={counts}
      note={props.moduleNote}
      onProduct={(p) => update({ product: p, modules: [] })}
      onModules={(modules) => update({ modules })}
    />
  )
  const nameBox = (className?: string) => (
    <Input
      type="search"
      aria-label={props.nameLabel}
      placeholder={`${props.nameLabel}…`}
      className={cn("font-names", className)}
      value={filters.name}
      onChange={(e) => update({ name: e.target.value })}
    />
  )

  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] space-y-6 overflow-y-auto p-1 pr-3 pb-3">
          {nameBox()}
          {filterGroups}
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <h1 className="font-head text-2xl">{props.title}</h1>
          {(hiddenCount > 0 || filtered) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {hiddenCount > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openSettingsAt("families")}>
                  {count(hiddenCount, "family", "families")} hidden in Settings
                </Button>
              )}
              {filtered && (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 lg:hidden">
          {nameBox("flex-1")}
          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>Filters{filters.modules.length > 0 && ` (${filters.modules.length})`}</SheetTrigger>
            <SheetContent side="left" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription className="sr-only">Choose the product, and narrow Banner {many} by module.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-8">{filterGroups}</div>
            </SheetContent>
          </Sheet>
        </div>
        {matched.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <p>
              {pages > 1 ? `${n(first)}–${n(Math.min(first + size - 1, matched.length))} of ` : ""}
              {count(matched.length, `${product} ${one}`, `${product} ${many}`)}
            </p>
            {pages > 1 && <PageStepper page={page} pages={pages} hrefFor={hrefFor} onGo={goToPage} />}
            {matched.length > PAGE_SIZES[0] && <PageSizePicker size={size} onChange={changeSize} things={props.title} />}
          </div>
        )}

        {matched.length === 0 ? (
          <Notice title={`No ${many} match these filters.`}>
            <Button variant="outline" onClick={clear}>
              Clear filters
            </Button>
          </Notice>
        ) : (
          <ul className="border-2 border-border bg-card shadow-md">
            <li className="hidden border-b-2 border-border bg-muted px-3 py-2 text-sm text-muted-foreground sm:flex" aria-hidden="true">
              {props.headings}
            </li>
            {matched.slice(first - 1, first - 1 + size).map((item) => (
              <li key={item.name} className="border-b border-border/30 last:border-b-0">
                {props.row(item)}
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && <ListPages page={page} pages={pages} hrefFor={hrefFor} onGo={goToPage} />}
      </section>
    </div>
  )
}

function ProductModuleFilters(props: {
  products: { product: string; count: number }[]
  product: string
  modules: string[]
  selected: string[]
  counts: ReturnType<typeof tableCounts>
  note: string
  onProduct: (product: string) => void
  onModules: (modules: string[]) => void
}) {
  const ids = useId()
  return (
    <div className="space-y-6 text-sm">
      <FilterSection title="Product">
        <RadioGroup value={props.product} onValueChange={(v) => props.onProduct(String(v))} aria-label="Product">
          {props.products.map(({ product }, i) => (
            <span key={product} className="flex items-center gap-2">
              <RadioGroupItem id={`${ids}-p${i}`} value={product} />
              <Label htmlFor={`${ids}-p${i}`} className="flex min-w-0 flex-1 justify-between gap-3 font-normal">
                <span>{product}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{n(props.counts.products.get(product) ?? 0)}</span>
              </Label>
            </span>
          ))}
        </RadioGroup>
      </FilterSection>
      {props.modules.length > 0 && (
        <FilterSection title="Module">
          <ul className="space-y-1">
            {props.modules.map((m, i) => {
              const id = `${ids}-m${i}`
              const ticked = props.selected.includes(m)
              const c = props.counts.modules.get(m) ?? 0
              return (
                <li key={m} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={ticked}
                    disabled={c === 0 && !ticked}
                    onCheckedChange={(on) => props.onModules(on ? [...props.selected, m] : props.selected.filter((s) => s !== m))}
                  />
                  <Label htmlFor={id} className={cn("flex min-w-0 flex-1 justify-between gap-3 font-normal", c === 0 && "text-muted-foreground")}>
                    <span>{moduleLabel(m)}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{n(c)}</span>
                  </Label>
                </li>
              )
            })}
          </ul>
          <p className="text-muted-foreground">{props.note}</p>
        </FilterSection>
      )}
    </div>
  )
}

function FilterSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-head text-sm tracking-wide uppercase">{props.title}</h2>
      {props.children}
    </section>
  )
}
