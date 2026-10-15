// Pieces shared by the table page and the form page: a Details box, the
// families an item's APIs come from, the way back to the list, and a list with a filter box and pages.
import { ArrowLeft } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { count, n } from "@/lib/first-run-text"
import { choosePageSize, usePageSize } from "@/lib/page-size"
import { splitApiId } from "@/lib/tables"

/** Label and value rows, laid out like the API page's Details. */
export function DetailsList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-base">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Each family the APIs come from, most APIs first, linked to the APIs list narrowed to it. */
export function FamilyCounts({ apis }: { apis: readonly { id: string }[] }) {
  const families = new Map<string, number>()
  for (const a of apis) {
    const { family } = splitApiId(a.id)
    families.set(family, (families.get(family) ?? 0) + 1)
  }
  return (
    <ul>
      {[...families].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([family, count_]) => (
        <li key={family} className="flex flex-wrap justify-between gap-x-3">
          <Link to={`/apis?family=${encodeURIComponent(family)}`} className="font-names break-all underline">
            {family}
          </Link>
          <span className="text-muted-foreground tabular-nums">{count(count_, "API", "APIs")}</span>
        </li>
      ))}
    </ul>
  )
}

/** Back to the list as you left it, or to the full list if you came from elsewhere (as on the API page). */
export function BackToList({ to, all }: { to: string; all: string }) {
  const navigate = useNavigate()
  const fromList = (useLocation().state as { fromList?: boolean } | null)?.fromList === true
  return fromList ? (
    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
      <ArrowLeft /> Back to the list
    </Button>
  ) : (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={to} />}>
      <ArrowLeft /> {all}
    </Button>
  )
}

/** A filter box; its words say what it looks at, as each box does. */
export function FilterBox(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="search"
      aria-label={props.label}
      placeholder={`${props.label}…`}
      className="w-96 max-w-full font-names"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

/** A list with an optional filter above it and pages once it passes the page size (as the fields on the API page). */
export function Paged<T>(props: {
  items: T[]
  /** An item to open the list on the page of (such as a chosen column), or -1. */
  focus?: number
  things: [string, string]
  filter: ReactNode
  showFilter: boolean
  empty: string
  render: (shown: T[]) => ReactNode
}) {
  const size = usePageSize()
  const { items, focus = -1 } = props
  const pageOf = (i: number) => (i >= 0 ? Math.floor(i / size) + 1 : 1)
  const [page, setPage] = useState(() => pageOf(focus))
  // A new list (filtered, or another table) or a newly chosen item: the first page, or the item's page. Not on a new
  // page size: the size picker sets the page itself.
  useEffect(() => setPage(pageOf(focus)), [items, focus])
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pages)
  const first = (current - 1) * size
  return (
    <div className="space-y-3">
      {props.showFilter && props.filter}
      {items.length > size && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <p>
            {n(first + 1)}–{n(Math.min(first + size, items.length))} of {count(items.length, ...props.things)}
          </p>
          <PageStepper page={current} pages={pages} hrefFor={() => "#"} onGo={setPage} />
          <PageSizePicker
            size={size}
            things={props.things[1][0].toUpperCase() + props.things[1].slice(1)}
            onChange={(next) => {
              choosePageSize(next)
              setPage(Math.floor(first / next) + 1)
            }}
          />
        </div>
      )}
      {items.length === 0 ? <p className="text-muted-foreground">{props.empty}</p> : props.render(items.slice(first, first + size))}
    </div>
  )
}
