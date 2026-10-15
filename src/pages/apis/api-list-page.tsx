// The API list: every API the Settings "Families shown" choice allows, grouped by family,
// 20, 50 or 100 to a page, with filters on the left (in a side panel on a narrow window). The filters and the page live in
// the address, so Back and bookmarks return to the same list.
import { useEffect, useLayoutEffect, useMemo, type MouseEvent, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { Notice } from "@/components/notice"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { useSettingsOpen } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item } from "@/components/ui/item"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import {
  NOT_STATED,
  anyFilter,
  applyFilters,
  domainsOf,
  optionCounts,
  pageCount,
  pageNumbers,
  pageRows,
  readFilters,
  toListApis,
  writeFilters,
  type Filters,
  type ListApi,
} from "@/lib/api-list"
import { setHiddenFamilies, useHiddenFamilies } from "@/lib/families"
import { count, n } from "@/lib/first-run-text"
import { PAGE_SIZES, choosePageSize, usePageSize, type PageSize } from "@/lib/page-size"
import { useApis } from "@/lib/use-apis"
import { useStatus } from "@/lib/use-status"
import { FilterGroups, NameBox } from "./list-filters"

export const apiPath = (a: { family: string; name: string }) => `/apis/${encodeURIComponent(a.family)}/${encodeURIComponent(a.name)}`

export function ApiListPage() {
  const { status } = useStatus()
  const { apis, error, retry } = useApis()
  const hidden = useHiddenFamilies()
  const size = usePageSize()
  const { openAt: openSettingsAt } = useSettingsOpen()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const search = params.toString()
  const filters = useMemo(() => readFilters(new URLSearchParams(search)), [search])

  const families = status?.index.state === "ready" ? status.index.summary.families : null
  const list = useMemo(() => (apis && families ? toListApis(apis, families) : null), [apis, families])
  // "Families shown" (Settings) decides what's in the app at all; the filters narrow down within that.
  const visible = useMemo(() => list?.filter((a) => !hidden.includes(a.family)) ?? [], [list, hidden])
  const matched = useMemo(() => applyFilters(visible, filters), [visible, filters])
  const counts = useMemo(() => optionCounts(visible, filters), [visible, filters])
  const domains = useMemo(() => domainsOf(visible), [visible])

  useKeepScrollPlace(list !== null)

  if (!families) return null
  const shownFamilies = families.filter((f) => !hidden.includes(f.name))
  const hiddenCount = families.length - shownFamilies.length

  if (shownFamilies.length === 0) {
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
        <AlertTitle>Couldn't load the APIs</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Is the app still running in the terminal?</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (!list) {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Loading the APIs…
      </p>
    )
  }

  const update = (change: Partial<Filters>) => setParams(writeFilters({ ...filters, page: 1, ...change }), { replace: true })
  const clear = () => update({ families: [], domains: [], statuses: [], lineage: [], name: "" })
  const pages = pageCount(matched.length, size)
  const page = Math.min(filters.page, pages)
  const first = (page - 1) * size + 1
  const ticked = filters.families.length + filters.domains.length + filters.statuses.length + filters.lineage.length
  const hiddenInFilter = filters.families.filter((f) => hidden.includes(f))
  const groupOf = new Map(families.map((f) => [f.name, f.group]))

  const filterGroups = <FilterGroups filters={filters} families={shownFamilies} domains={domains} counts={counts} onChange={update} />
  const nameBox = (className?: string) => <NameBox value={filters.name} onChange={(name) => update({ name })} className={className} />

  // A new page size keeps the first API you were looking at on the page.
  function changeSize(next: PageSize) {
    choosePageSize(next)
    setParams(writeFilters({ ...filters, page: Math.floor((first - 1) / next) + 1 }), { replace: true })
  }

  const hrefFor = (p: number) => `?${writeFilters({ ...filters, page: p })}`

  function goToPage(p: number) {
    navigate({ search: writeFilters({ ...filters, page: p }).toString() })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block" aria-label="Filters">
        {/* pb-3: the tick boxes' larger click area reaches 8px below the last one, which otherwise makes a needless
            scroll bar. */}
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] space-y-6 overflow-y-auto p-1 pr-3 pb-3">
          {nameBox()}
          {filterGroups}
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        {/* Two rows: the title with the Settings and Clear filters links, then where you are
            and the page controls, directly above the list, so turning the page never needs a scroll. The full
            page numbers stay at the bottom too. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <h1 className="font-head text-2xl">APIs</h1>
          {(hiddenCount > 0 || anyFilter(filters)) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {hiddenCount > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openSettingsAt("families")}>
                  {count(hiddenCount, "family", "families")} hidden in Settings
                </Button>
              )}
              {anyFilter(filters) && (
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
            <SheetTrigger render={<Button variant="outline" />}>Filters{ticked > 0 && ` (${ticked})`}</SheetTrigger>
            <SheetContent side="left" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription className="sr-only">Narrow the list by family, domain and status.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-8">{filterGroups}</div>
            </SheetContent>
          </Sheet>
        </div>
        {matched.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <p>
              {pages > 1 ? `${n(first)}–${n(Math.min(first + size - 1, matched.length))} of ` : ""}
              {count(matched.length, "API", "APIs")}
            </p>
            {pages > 1 && <PageStepper page={page} pages={pages} hrefFor={hrefFor} onGo={goToPage} />}
            {matched.length > PAGE_SIZES[0] && <PageSizePicker size={size} onChange={changeSize} things="APIs" />}
          </div>
        )}

        {hiddenInFilter.length > 0 && (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>
                {hiddenInFilter.length === 1 ? "This list asks for a family that is" : "This list asks for families that are"} hidden in
                Settings: <span className="font-names">{hiddenInFilter.join(", ")}</span>.
              </p>
              <Button size="sm" variant="outline" onClick={() => setHiddenFamilies(hidden.filter((h) => !hiddenInFilter.includes(h)))}>
                {hiddenInFilter.length === 1 ? "Show it" : "Show them"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {matched.length === 0 ? (
          <Notice title="No APIs match these filters.">
            <Button variant="outline" onClick={clear}>
              Clear filters
            </Button>
          </Notice>
        ) : (
          <ul className="border-2 border-border bg-card shadow-md">
            {pageRows(matched, page, size).map((row) =>
              row.kind === "heading" ? (
                <li key={`heading-${row.family}`} className="flex items-baseline justify-between gap-3 border-b-2 border-border bg-muted px-3 py-2">
                  <h2 className="min-w-0 break-all">
                    <span className="font-names font-semibold">{row.family}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {groupOf.get(row.family)}
                      {row.continued && ", continued"}
                    </span>
                  </h2>
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{count(row.count, "API", "APIs")}</span>
                </li>
              ) : (
                <li key={row.api.id} className="border-b border-border/30 last:border-b-0">
                  <ApiRow api={row.api} />
                </li>
              ),
            )}
          </ul>
        )}

        {pages > 1 && <ListPages page={page} pages={pages} hrefFor={hrefFor} onGo={goToPage} />}
      </section>
    </div>
  )
}

function ApiRow({ api }: { api: ListApi }) {
  return (
    <Item
      size="xs"
      className="rounded-none border-0 sm:flex-nowrap"
      render={<Link to={apiPath(api)} state={{ fromList: true }} />}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="font-names break-all">{api.name}</span>
        {api.status === "beta" && <Badge variant="outline">beta</Badge>}
        {api.deprecated && <Badge variant="destructive">deprecated</Badge>}
        {api.lineage === "none" && <span className="text-sm text-muted-foreground">no lineage published</span>}
      </span>
      {/* Narrow: one line under the name, with dots between. Wide: three columns. */}
      <span className="flex w-full flex-wrap gap-x-2 text-muted-foreground sm:w-auto sm:flex-nowrap sm:gap-x-0">
        <span className="sm:w-36">{api.domain === NOT_STATED ? "" : api.domain}</span>
        {api.domain !== NOT_STATED && <span className="sm:hidden">·</span>}
        <span className="font-names sm:w-28">{api.version ? `v${api.version}` : ""}</span>
        {api.versions > 1 && <span className="sm:hidden">·</span>}
        <span className="sm:w-24 sm:text-right">{api.versions > 1 ? `${api.versions} versions` : ""}</span>
      </span>
    </Item>
  )
}

export function ListPages(props: { page: number; pages: number; hrefFor: (page: number) => string; onGo: (page: number) => void }) {
  const go = (p: number) => (e: MouseEvent) => {
    e.preventDefault()
    props.onGo(p)
  }
  const { page, pages } = props
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          {page > 1 ? (
            <PaginationPrevious href={props.hrefFor(page - 1)} onClick={go(page - 1)} />
          ) : (
            <PaginationPrevious aria-disabled className="pointer-events-none opacity-50" />
          )}
        </PaginationItem>
        {/* Narrow: just "2 of 5". */}
        <PaginationItem className="px-2 text-sm sm:hidden">
          {page} of {pages}
        </PaginationItem>
        {pageNumbers(page, pages).map((p, i) => (
          <PaginationItem key={p === "gap" ? `gap-${i}` : p} className="hidden sm:block">
            {p === "gap" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink href={props.hrefFor(p)} isActive={p === page} onClick={go(p)} aria-label={`Page ${p}`}>
                {p}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          {page < pages ? (
            <PaginationNext href={props.hrefFor(page + 1)} onClick={go(page + 1)} />
          ) : (
            <PaginationNext aria-disabled className="pointer-events-none opacity-50" />
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

/**
 * Coming back to the list (Back from an API) returns to the same place on the page. The position is noted as you
 * scroll, saved against this visit to the list when you leave, and restored once the list is drawn.
 */
export function useKeepScrollPlace(ready: boolean) {
  const { key } = useLocation()
  const storageKey = `lineage-finder:list-scroll:${key}`

  useLayoutEffect(() => {
    if (!ready) return
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(storageKey)
    } catch {
      // Storage unavailable: start at the top.
    }
    if (saved) window.scrollTo({ top: Number(saved) })
  }, [ready, storageKey])

  useEffect(() => {
    let y = window.scrollY
    const note = () => {
      y = window.scrollY
    }
    window.addEventListener("scroll", note, { passive: true })
    return () => {
      window.removeEventListener("scroll", note)
      try {
        sessionStorage.setItem(storageKey, String(y))
      } catch {
        // Storage unavailable: Back starts at the top.
      }
    }
  }, [storageKey])
}
