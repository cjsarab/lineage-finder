// The rows of Favourites and Recently viewed, with their "no longer in your catalog" and "hidden in Settings" notes,
// shared by the Favourites panel and the landing page, so the
// two never disagree. The panel adds the star and Remove; the landing page adds what each one is at the right.
import type { ReactNode } from "react"
import { Link } from "react-router"
import { useSettingsOpen } from "@/components/settings/settings-panel"
import { Button } from "@/components/ui/button"
import { apiState, columnState, formState, tableState, type Favourite, type PlaceState, type Recent } from "@/lib/favourites"
import type { Api, FormSummary, TableSummary } from "@/lib/server"
import { useTable } from "@/lib/use-tables"
import { StarToggle } from "./star-button"

/** The index's lists, to check each row against; null while they load (the rows show their names as saved). */
export type Lists = { apis: Api[]; tables: TableSummary[]; forms: FormSummary[] } | null

/** The panel's star (removing, putting back) and Remove. */
export type Editing = { on: boolean; onToggle: () => void; onRemove: () => void }

type RowProps = { hidden: readonly string[]; close: () => void; editing?: Editing; kind?: string }

export const favouriteKind = (f: Favourite) => (f.kind === "api" ? "API" : f.kind === "table" ? "Table" : f.kind === "column" ? "Column" : "Form")

export function FavouriteRow({ f, lists, ...p }: RowProps & { f: Favourite; lists: Lists }) {
  if (f.kind === "api") return <ApiRow f={f} apis={lists?.apis ?? null} {...p} />
  if (f.kind === "table") return <PlaceRow {...p} name={f.name} product={f.product} state={lists && tableState(f, lists.tables, p.hidden)} />
  if (f.kind === "form") return <PlaceRow {...p} name={f.code} product={f.product} state={lists && formState(f, lists.forms, p.hidden)} />
  return <ColumnRow f={f} {...p} />
}

function ApiRow({ f, apis, ...p }: RowProps & { f: Extract<Favourite, { kind: "api" }>; apis: Api[] | null }) {
  const s = apis && apiState(f, apis, p.hidden)
  return (
    <Row
      {...p}
      what={`${f.name} ${f.version}`}
      name={f.name}
      path={s?.kind === "ok" ? s.path : null}
      extra={<span className="font-names text-muted-foreground">{f.version}</span>}
      below={<div className="font-names text-xs text-muted-foreground">{f.family}</div>}
    >
      {s?.kind === "ok" && s.newer && (
        <div className="text-xs">
          Newer version:{" "}
          <Link to={s.newer.path} onClick={p.close} className="font-names underline">
            {s.newer.version}
          </Link>
        </div>
      )}
      {s?.kind === "versionGone" && (
        <Gone onRemove={p.editing?.onRemove}>
          Version <span className="font-names">{f.version}</span> is no longer in your catalog.{" "}
          <Link to={s.newestPath} onClick={p.close} className="underline">
            Open the newest
          </Link>
        </Gone>
      )}
      {s?.kind === "hidden" && <Hidden close={p.close} />}
      {s?.kind === "gone" && <Gone onRemove={p.editing?.onRemove}>No longer in your catalog</Gone>}
    </Row>
  )
}

function ColumnRow({ f, ...p }: RowProps & { f: Extract<Favourite, { kind: "column" }> }) {
  // Column names are only in the table's own page, so ask for it (a quick local request).
  const { table } = useTable(f.product, f.table)
  const name = `${f.table}.${f.column}`
  // While it loads, the name shows without a link.
  const state = table === undefined ? null : columnState(f, table, p.hidden)
  return <PlaceRow {...p} name={name} product={f.product} state={state} />
}

function PlaceRow(p: RowProps & { name: string; product: string; state: PlaceState | null }) {
  const { state } = p
  return (
    <Row {...p} what={p.name} path={state?.kind === "ok" ? state.path : null} extra={<span className="text-xs text-muted-foreground">{p.product}</span>}>
      {state?.kind === "hidden" && <Hidden close={p.close} />}
      {state?.kind === "gone" && <Gone onRemove={p.editing?.onRemove}>No longer in your catalog</Gone>}
    </Row>
  )
}

function Row(p: RowProps & { what: string; name: string; path: string | null; extra: ReactNode; below?: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      {p.editing && <StarToggle on={p.editing.on} onToggle={p.editing.onToggle} what={p.what} className="-mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {p.path ? (
            <Link to={p.path} onClick={p.close} className="font-names break-all hover:underline">
              {p.name}
            </Link>
          ) : (
            <span className="font-names break-all">{p.name}</span>
          )}
          {p.extra}
        </div>
        {p.below}
        {p.children}
      </div>
      {p.kind && <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{p.kind}</span>}
    </li>
  )
}

function Hidden({ close }: { close: () => void }) {
  const { openAt } = useSettingsOpen()
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Hidden in Settings
      <Button
        variant="outline"
        size="xs"
        onClick={() => {
          close()
          openAt("families")
        }}
      >
        Open Settings
      </Button>
    </div>
  )
}

function Gone({ onRemove, children }: { onRemove?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{children}</span>
      {onRemove && (
        <Button variant="outline" size="xs" onClick={onRemove}>
          Remove
        </Button>
      )}
    </div>
  )
}

/** A Recently viewed row; `path` is null while the lists load (the name shows without a link). */
export function RecentRow({ item, path, close }: { item: Recent; path: string | null; close: () => void }) {
  const name = (
    <>
      <span className="font-names break-all">
        {item.kind === "form" ? item.code : item.kind === "table" && item.column ? `${item.name}.${item.column}` : item.name}
      </span>
      {item.kind === "api" && <span className="ml-2 font-names text-muted-foreground">{item.version}</span>}
    </>
  )
  return (
    <li className="flex items-baseline justify-between gap-3">
      {path ? (
        <Link to={path} onClick={close} className="min-w-0 hover:underline">
          {name}
        </Link>
      ) : (
        <span className="min-w-0">{name}</span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">{item.kind === "api" ? "API" : item.kind === "form" ? "Form" : item.column ? "Column" : "Table"}</span>
    </li>
  )
}
