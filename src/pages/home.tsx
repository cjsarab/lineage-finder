// The landing page: what the app is, with the legal note; a big search box; the "has changed" notice; Favourites,
// Recently viewed and your catalog; then the ways in (APIs, Tables, Forms) with their counts broken down. For the
// everyday user first.
import { FolderOpen } from "lucide-react"
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { favouriteKind, FavouriteRow, RecentRow, type Lists } from "@/components/favourites/favourite-rows"
import { useFavouritesOpen } from "@/components/favourites/favourites-panel"
import { FavouriteStar } from "@/components/favourites/star-button"
import { SectionTitle } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toListApis } from "@/lib/api-list"
import { dismissCatalogChange, headline, readAt, reindexNow, useCatalogChangeNotice, useChanges, visibleChanges } from "@/lib/catalog-update"
import { setHiddenFamilies, useHiddenFamilies } from "@/lib/families"
import { favouriteKey, shownRecent, sortFavourites, useFavourites, useRecent } from "@/lib/favourites"
import { count, n } from "@/lib/first-run-text"
import { toListForms } from "@/lib/forms"
import { apiWay, formWay, tableWay, type Breakdown, type Way } from "@/lib/landing"
import type { IndexSummary, Status } from "@/lib/server"
import { toListTables } from "@/lib/tables"
import { useApis } from "@/lib/use-apis"
import { useStatus } from "@/lib/use-status"
import { useForms, useTables } from "@/lib/use-tables"

/** How many Favourites and Recently viewed the page shows before "and 3 more in Favourites". */
export const LANDING_ROWS = 5
/** How many badges each breakdown shows before "and 7 more". */
export const TOP_BADGES = 3

export function HomePage() {
  const { status } = useStatus()
  const hidden = useHiddenFamilies()
  if (status?.index.state !== "ready") return null
  const summary = status.index.summary
  const everyFamilyHidden = summary.families.every((f) => hidden.includes(f.name))
  return (
    <div className="space-y-8">
      <AboutTheApp />
      <SearchBox />
      <CatalogChangedNotice status={status} />
      <div className="grid gap-6 md:grid-cols-3">
        <FavouritesCard hidden={hidden} />
        <RecentCard hidden={hidden} />
        <YourCatalog summary={summary} hidden={hidden} />
      </div>
      {/* With every family hidden there's nothing to browse: Your catalog says so, with Show all. */}
      {!everyFamilyHidden && <WaysIn summary={summary} hidden={hidden} />}
    </div>
  )
}

// ---------- What the app is (section 2) ----------

function AboutTheApp() {
  return (
    <div className="space-y-2 text-base">
      <h1 className="font-head text-2xl">The tables behind Ellucian's APIs</h1>
      <p>
        This app reads the API catalog you downloaded from Ellucian and shows, for every API, its versions, its fields and the
        database tables and columns behind them: the lineage. Follow any table to every API that uses it.
      </p>
      <p>It runs on this computer, from your own copy of the catalog. Nothing leaves your computer.</p>
      {/* Settings → About keeps its own copy. */}
      <p className="text-muted-foreground">Unofficial: not affiliated with or endorsed by Ellucian.</p>
    </div>
  )
}

// ---------- Search (section 3) ----------

/** Opens the Search page with the words (`/search?q=…`), so search itself isn't built twice. */
function SearchBox() {
  const id = useId()
  const navigate = useNavigate()
  const [words, setWords] = useState("")
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = words.trim()
    void navigate(q ? `/search?${new URLSearchParams({ q })}` : "/search")
  }
  return (
    // A little more room under the label.
    <form className="space-y-3" onSubmit={submit} role="search">
      <label htmlFor={id} className="block font-head text-xl">
        Search the catalog
      </label>
      {/* No autoFocus: the page's links and the header work from the keyboard as usual. */}
      <div className="flex gap-2">
        <Input
          id={id}
          aria-label="Search the catalog"
          placeholder="Search APIs, fields, tables, forms and columns…"
          value={words}
          onChange={(e) => setWords(e.target.value)}
          className="h-14 text-lg"
        />
        <Button type="submit" size="lg" className="h-14 px-6 text-lg">
          Search
        </Button>
      </div>
    </form>
  )
}

// ---------- The "has changed" notice ----------

/** "Your catalog has changed since it was last read", until a re-index or "Not now". */
function CatalogChangedNotice({ status }: { status: Status }) {
  const { refresh } = useStatus()
  const notice = useCatalogChangeNotice()
  const [problem, setProblem] = useState<string | null>(null)
  if (!notice.show || status.run) return null
  return (
    <Alert>
      <FolderOpen />
      <AlertTitle>Your catalog has changed since it was last read</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Re-read it to bring the app up to date. It takes about 40 seconds, and you can keep browsing meanwhile.</p>
        {problem && <p className="text-destructive">{problem}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => notice.fingerprint && dismissCatalogChange(notice.fingerprint)}>
            Not now
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setProblem(null)
              void reindexNow(status).then((failed) => (failed ? setProblem(failed) : refresh()))
            }}
          >
            Re-index now
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

// ---------- Favourites, Recently viewed, Your catalog (section 5) ----------

function SmallCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <SectionTitle>{title}</SectionTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  )
}

/** The index's lists, once all three have loaded, so rows can say what's gone or hidden (as the panel does). */
function useLists(): Lists {
  const { apis } = useApis()
  const { tables } = useTables()
  const { forms } = useForms()
  return useMemo(() => (apis && tables && forms ? { apis, tables, forms } : null), [apis, tables, forms])
}

/** "and 3 more in Favourites": opens the Favourites panel, as the header's star does. */
function More({ count: more, where }: { count: number; where: string }) {
  const { setOpen } = useFavouritesOpen()
  if (more <= 0) return null
  return (
    <p>
      <button type="button" className="cursor-pointer underline" onClick={() => setOpen(true)}>
        and {more} more {where}
      </button>
    </p>
  )
}

const noop = () => {}

function FavouritesCard({ hidden }: { hidden: readonly string[] }) {
  const saved = useFavourites()
  const lists = useLists()
  const rows = sortFavourites(saved).slice(0, LANDING_ROWS)
  return (
    <SmallCard title="Favourites">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing here yet. Use <FavouriteStar on={false} className="inline align-text-bottom" /> on an API, table, column or form page.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((f) => (
            <FavouriteRow key={favouriteKey(f)} f={f} lists={lists} hidden={hidden} close={noop} kind={favouriteKind(f)} />
          ))}
        </ul>
      )}
      <More count={saved.length - LANDING_ROWS} where="in Favourites" />
    </SmallCard>
  )
}

function RecentCard({ hidden }: { hidden: readonly string[] }) {
  const recent = useRecent()
  const lists = useLists()
  // Gone and hidden ones are left out, as the panel leaves them out; until the lists load, the names as saved.
  const rows = lists ? shownRecent(recent, lists.apis, lists.tables, hidden, lists.forms) : recent.map((item) => ({ item, path: null }))
  return (
    <SmallCard title="Recently viewed">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, LANDING_ROWS).map(({ item, path }, i) => (
            <RecentRow key={path ?? i} item={item} path={path} close={noop} />
          ))}
        </ul>
      )}
      <More count={rows.length - LANDING_ROWS} where="in the Favourites panel" />
    </SmallCard>
  )
}

function YourCatalog({ summary, hidden }: { summary: IndexSummary; hidden: readonly string[] }) {
  const total = summary.families.length
  const shown = summary.families.filter((f) => !hidden.includes(f.name)).length
  return (
    <SmallCard title="Your catalog">
      <div className="space-y-2 text-base">
        <p>
          {count(summary.apis, "API", "APIs")} ({count(summary.versions, "version", "versions")}) in{" "}
          {count(total, "family", "families")}, read {readAt(summary.builtAt)}.
        </p>
        {/* Families shown (Settings). */}
        {shown === 0 ? (
          <p className="flex flex-wrap items-center gap-3">
            Every family is hidden in Settings.
            <Button size="sm" variant="outline" onClick={() => setHiddenFamilies([])}>
              Show all
            </Button>
          </p>
        ) : (
          shown < total && (
            <p>
              Showing {shown} of {total} families ({total - shown} hidden in Settings).
            </p>
          )
        )}
        <WhatChanged hidden={hidden} />
      </div>
    </SmallCard>
  )
}

/** The last read's changes, with the summary always one click away. */
function WhatChanged({ hidden }: { hidden: readonly string[] }) {
  const { changes, loaded } = useChanges()
  if (!loaded) return null
  const summaryLink = (words: string) => (
    <Link to="/summary" className="underline">
      {words}
    </Link>
  )
  if (changes?.outcome === "compared") {
    const { shown, inHidden } = visibleChanges(changes, hidden)
    const what = headline(shown) ?? (inHidden ? count(inHidden, "change in hidden families", "changes in hidden families") : null)
    return <p>{what ? <>Since the read before: {what}. </> : <>No changes since the read before. </>}{summaryLink("See the summary")}</p>
  }
  if (changes?.outcome === "different-catalog") {
    return <p>A different catalog from the read before. {summaryLink("See the summary")}</p>
  }
  // A first read, or nothing to compare after an app update.
  return <p>{summaryLink("See the summary of the last read")}</p>
}

// ---------- The ways in (section 6) ----------

function WaysIn({ summary, hidden }: { summary: IndexSummary; hidden: readonly string[] }) {
  const apis = useApis()
  const tables = useTables()
  const forms = useForms()
  const apiCard = useMemo(() => (apis.apis ? apiWay(toListApis(apis.apis, summary.families), summary.families, hidden) : null), [apis.apis, summary.families, hidden])
  const tableCard = useMemo(() => (tables.tables ? tableWay(toListTables(tables.tables, hidden)) : null), [tables.tables, hidden])
  const formCard = useMemo(() => (forms.forms ? formWay(toListForms(forms.forms, hidden)) : null), [forms.forms, hidden])
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <WayCard
        title="APIs"
        href="/apis"
        what="Every API in your catalog, by family: its versions, fields and the tables and columns behind them."
        way={apiCard}
        extra={(x) => count(x, "version", "versions")}
        loading={{ error: apis.error, retry: apis.retry, what: "APIs" }}
      />
      <WayCard
        title="Tables"
        href="/tables"
        what="Every table the lineage names, with its columns and the APIs and fields that use each one."
        way={tableCard}
        extra={(x) => count(x, "column", "columns")}
        loading={{ error: tables.error, retry: tables.retry, what: "tables" }}
      />
      <WayCard
        title="Forms"
        href="/forms"
        what="The pages (forms) the APIs work through, and which APIs use each one."
        way={formCard}
        extra={(x) => `${n(x)} also a table`}
        loading={{ error: forms.error, retry: forms.retry, what: "forms" }}
      />
    </div>
  )
}

function WayCard(props: {
  title: string
  href: string
  what: string
  way: Way | null
  extra: (x: number) => string
  loading: { error: boolean; retry: () => void; what: string }
}) {
  const { way, loading } = props
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-head text-xl">{props.title}</h2>
          {way && <span className="font-head text-2xl tabular-nums">{n(way.count)}</span>}
        </div>
        {way && <p className="text-sm text-muted-foreground">{props.extra(way.extra)}</p>}
      </CardHeader>
      <CardContent className="space-y-4 text-base">
        <p>{props.what}</p>
        {loading.error && !way ? (
          // As the lists say it (src/components/product-list.tsx).
          <div className="space-y-2 text-sm">
            <p>Couldn't load the {loading.what}. Is the app still running in the terminal?</p>
            <Button variant="outline" size="sm" onClick={loading.retry}>
              Try again
            </Button>
          </div>
        ) : !way ? (
          <p className="flex items-center gap-2 text-sm">
            <Spinner /> Loading…
          </p>
        ) : (
          <>
            {way.breakdowns.filter((b) => b.bits.length > 0).map((b) => (
              <Badges key={b.title} b={b} />
            ))}
            <p>
              {/* The tables and forms lists show one product at a time, so no total there. */}
              <Link to={props.href} className="underline">
                {props.title === "APIs" ? `Browse all ${n(way.count)} APIs` : `Browse all ${props.title.toLowerCase()}`}
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** The top few as small linked badges, largest first, then "and 7 more". */
function Badges({ b }: { b: Breakdown }) {
  const shown = b.bits.slice(0, TOP_BADGES)
  const more = b.bits.length - shown.length
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">{b.title}</p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((bit) => (
          <Link key={bit.label} to={bit.href}>
            <Badge variant="outline" className="h-auto gap-1.5 whitespace-normal hover:bg-accent">
              {bit.label} <span className="tabular-nums text-muted-foreground">{n(bit.count)}</span>
            </Badge>
          </Link>
        ))}
        {more > 0 && <span className="self-center text-sm text-muted-foreground">and {more} more</span>}
      </div>
    </div>
  )
}
