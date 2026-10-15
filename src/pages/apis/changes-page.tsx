// What changed in one version since the last read, at
// `/apis/<family>/<name>/changes?version=`: Compare versions' comparison, the version as it was at the last read (kept with the
// index) against the version now. Reached from the summary's "See what changed".
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { chooseVersion, versionKey } from "@/lib/api-page"
import { readAt, useChanges } from "@/lib/catalog-update"
import { useCompareLayout } from "@/lib/compare-layout"
import type { Api } from "@/lib/server"
import { useApiChangesWas, useApiFields, useApiParameters } from "@/lib/use-api-data"
import { ApiGate } from "./api-gate"
import { apiPath } from "./api-list-page"
import { Comparison, type Show } from "./compare-page"
import { useProductOf } from "./lineage-parts"

export function ChangesPage() {
  return <ApiGate>{(api) => <Changes api={api} />}</ApiGate>
}

function Changes({ api }: { api: Api }) {
  const [params] = useSearchParams()
  const { version: now } = chooseVersion(api, params.get("version"))
  const [show, setShow] = useState<Show>("changes")
  const layout = useCompareLayout()
  const product = useProductOf(api.family)
  const was = useApiChangesWas(api.family, api.name)
  const p = useApiParameters(api.family, api.name)
  const f = useApiFields(api.family, api.name)
  const { changes } = useChanges()
  const then = was.versions?.[now.folder]
  const lastRead = changes && "lastRead" in changes && changes.lastRead ? readAt(changes.lastRead.builtAt) : null

  return (
    <div className="space-y-6">
      <BackToSummary />
      <header className="space-y-2">
        <h1 className="font-head text-2xl">
          What changed in <span className="font-names break-all">{api.name}</span> {versionKey(now)}
        </h1>
        <p className="text-muted-foreground">
          <Link to={`/apis?family=${encodeURIComponent(api.family)}`} className="font-names underline">
            {api.family}
          </Link>
          {lastRead && <> · since your last read ({lastRead})</>}
        </p>
      </header>

      {was.error || p.error || f.error ? (
        <p className="text-muted-foreground">Couldn't load the changes. Is the app still running in the terminal?</p>
      ) : !was.versions || !p.versions || !f.versions ? (
        <p className="flex items-center gap-2">
          <Spinner /> Loading…
        </p>
      ) : !then ? (
        // An old bookmark, or a later re-index that found nothing new here.
        <Notice title={`No changes to show for version ${versionKey(now)} since your last read.`}>
          <Button variant="outline" nativeButton={false} render={<Link to={`${apiPath(api)}?${new URLSearchParams({ version: versionKey(now) })}`} />}>
            Open {api.name} {versionKey(now)}
          </Button>
        </Notice>
      ) : (
        <Comparison
          from={then.version}
          to={now}
          params={[then.parameters, p.versions[now.folder] ?? []]}
          fields={[then.fields ?? undefined, f.versions[now.folder]]}
          show={show}
          setShow={setShow}
          layout={layout}
          product={product}
          labels={{ from: "Last read", to: "Now" }}
          intro={[
            ["Version", <span className="font-names">{versionKey(now)}</span>],
            ["Compared", lastRead ? `Your last read (${lastRead}) with now` : "Your last read with now"],
          ]}
        />
      )}
    </div>
  )
}

/** Back to the summary as you left it, or open it when this page was opened directly. */
function BackToSummary() {
  const navigate = useNavigate()
  const opened = useLocation().key === "default"
  const label = (
    <>
      <ArrowLeft /> Back to the summary
    </>
  )
  return opened ? (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/summary" />}>
      {label}
    </Button>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
      {label}
    </Button>
  )
}
