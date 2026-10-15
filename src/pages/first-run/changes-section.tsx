// "Changes since your last read" on the summary screen: the headline counts, then
// each list folding when it's longer than 10, as on the compare page. Hidden families' changes are a count, with Show.
import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { versionKey } from "@/lib/api-page"
import { comparePath } from "@/lib/compare"
import { countsText, headline, readAt, visibleChanges } from "@/lib/catalog-update"
import { useHiddenFamilies } from "@/lib/families"
import { count } from "@/lib/first-run-text"
import type { Api, Changes, VersionRef } from "@/lib/server"
import { useApis } from "@/lib/use-apis"
import { apiPath } from "@/pages/apis/api-list-page"
import { Fold } from "@/pages/apis/fold"

export function ChangesSection({ changes }: { changes: Changes | null }) {
  // A first read has nothing to compare with: no section at all.
  if (!changes) return null
  return (
    <section className="space-y-4">
      <h2 className="font-head text-xl">
        Changes since your last read{"lastRead" in changes && changes.lastRead ? ` (${readAt(changes.lastRead.builtAt)})` : ""}
      </h2>
      {changes.outcome === "compared" ? (
        <Compared changes={changes} />
      ) : changes.outcome === "different-catalog" ? (
        // Too different to list (another catalog altogether): just says so.
        <p>This is a different catalog from your last read, so changes aren't shown.</p>
      ) : changes.outcome === "not-comparable" ? (
        <p>Changes can't be shown this time: this version of the app keeps its index differently. The next re-index compares as normal.</p>
      ) : (
        <p>Changes couldn't be worked out this time. Your catalog was read normally.</p>
      )}
    </section>
  )
}

function Compared({ changes }: { changes: Extract<Changes, { outcome: "compared" }> }) {
  const hidden = useHiddenFamilies()
  const [showHidden, setShowHidden] = useState(false)
  const { apis } = useApis()
  const { shown, inHidden } = visibleChanges(changes, showHidden ? [] : hidden)
  const line = headline(shown)

  return (
    <div className="space-y-6">
      <p>{line ?? (inHidden ? "None in the families shown." : "None: everything is as it was.")}</p>

      {shown.families.added.map((f) => (
        <Fold key={`+${f.name}`} level="h3" heading={<span>New family: <span className="font-names">{f.name}</span></span>} counts={count(f.apis.length, "API", "APIs")} rows={f.apis.length}>
          <Names items={f.apis.map((name) => ({ family: f.name, name }))} linked />
        </Fold>
      ))}
      {shown.families.removed.map((f) => (
        <Fold key={`-${f.name}`} level="h3" heading={<span>No longer in your catalog: <span className="font-names">{f.name}</span></span>} counts={count(f.apis.length, "API", "APIs")} rows={f.apis.length}>
          <Names items={f.apis.map((name) => ({ family: f.name, name }))} />
        </Fold>
      ))}
      {shown.apis.added.length > 0 && (
        <Fold level="h3" heading="New APIs" counts={String(shown.apis.added.length)} rows={shown.apis.added.length}>
          <Names items={shown.apis.added} linked />
        </Fold>
      )}
      {shown.apis.removed.length > 0 && (
        <Fold level="h3" heading="APIs no longer in your catalog" counts={String(shown.apis.removed.length)} rows={shown.apis.removed.length}>
          <Names items={shown.apis.removed} />
        </Fold>
      )}
      {shown.versions.added.length > 0 && (
        <Fold level="h3" heading="New versions" counts={String(shown.versions.added.length)} rows={shown.versions.added.length}>
          <Rows>
            {shown.versions.added.map((v) => (
              <NewVersion key={`${v.family}/${v.name} ${v.version}`} v={v} apis={apis} />
            ))}
          </Rows>
        </Fold>
      )}
      {shown.versions.removed.length > 0 && (
        <Fold level="h3" heading="Versions no longer in your catalog" counts={String(shown.versions.removed.length)} rows={shown.versions.removed.length}>
          <Rows>
            {shown.versions.removed.map((v) => (
              <li key={`${v.family}/${v.name} ${v.version}`}>
                <ApiName v={v} linked /> {v.version}
              </li>
            ))}
          </Rows>
        </Fold>
      )}
      {shown.changed.length > 0 && (
        <Fold level="h3" heading="Changed since your last read" counts={count(shown.changed.length, "version", "versions")} rows={shown.changed.length}>
          <Rows>
            {shown.changed.map((v) => (
              <li key={`${v.family}/${v.name} ${v.folder}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span>
                  <ApiName v={v} linked /> {v.version}
                </span>
                <span className="text-muted-foreground">{countsText(v.counts)}</span>
                <Link to={changesPath(v)} className="underline">
                  See what changed
                </Link>
              </li>
            ))}
          </Rows>
        </Fold>
      )}

      {!showHidden && inHidden > 0 && (
        <p className="flex flex-wrap items-center gap-3">
          {`And ${count(inHidden, "change in hidden families", "changes in hidden families")}.`}
          {/* On this screen only: Settings stays as it is. */}
          <Button size="sm" variant="outline" onClick={() => setShowHidden(true)}>
            Show
          </Button>
        </p>
      )}
    </div>
  )
}

/** A changed version's own page: Compare versions' comparison, the last read against now. */
export const changesPath = (v: VersionRef) => `${apiPath(v)}/changes?${new URLSearchParams({ version: v.version })}`

const Rows = ({ children }: { children: ReactNode }) => <ul className="space-y-1">{children}</ul>

function Names({ items, linked = false }: { items: { family: string; name: string }[]; linked?: boolean }) {
  return (
    <Rows>
      {items.map((a) => (
        <li key={`${a.family}/${a.name}`}>
          <ApiName v={a} linked={linked} />
          <span className="text-muted-foreground"> · {a.family}</span>
        </li>
      ))}
    </Rows>
  )
}

/** Gone APIs aren't links: their pages have gone too. */
function ApiName({ v, linked = false }: { v: { family: string; name: string }; linked?: boolean }) {
  return linked ? (
    <Link to={apiPath(v)} className="font-names break-all underline">
      {v.name}
    </Link>
  ) : (
    <span className="font-names break-all">{v.name}</span>
  )
}

/** A new version, linked to its page, and to Compare versions with the version before it when there is one. */
function NewVersion({ v, apis }: { v: VersionRef; apis: Api[] | null }) {
  const api = apis?.find((a) => a.family === v.family && a.name === v.name)
  const i = api ? api.versions.findIndex((x) => versionKey(x) === v.version) : -1
  const before = api && i > 0 ? versionKey(api.versions[i - 1]) : null
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span>
        <Link to={`${apiPath(v)}?${new URLSearchParams({ version: v.version })}`} className="font-names break-all underline">
          {v.name}
        </Link>{" "}
        {v.version}
      </span>
      {before && (
        <Link to={comparePath(v, before, v.version)} className="underline">
          Compare with {before}
        </Link>
      )}
    </li>
  )
}
