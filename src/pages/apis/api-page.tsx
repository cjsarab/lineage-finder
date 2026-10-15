// One API's page: heading, version buttons, About and Details, the fields and their
// lineage, methods with permissions, query parameters (in pages when there are very many) and a line of headers;
// the base table in Details, and each query parameter's lineage. Everything follows the chosen version.
import { ArrowLeft, GitCompareArrows, Info, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { CopyText } from "@/components/copy-text"
import { StarButton } from "@/components/favourites/star-button"
import { Notice } from "@/components/notice"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { NOT_STATED, tidyDomains } from "@/lib/api-list"
import {
  chooseVersion,
  headersLine,
  parameterGroups,
  releaseText,
  sameNameElsewhere,
  sortMethods,
  isErpFamily,
  KEY_BLOCK_NOTE,
  sourcePage,
  sourcePageLabel,
  titleIfDifferent,
  versionKey,
  versionLabel,
} from "@/lib/api-page"
import { comparePath, startingPair } from "@/lib/compare"
import { recordRecent } from "@/lib/favourites"
import { n } from "@/lib/first-run-text"
import { formPath } from "@/lib/forms"
import { choosePageSize, usePageSize } from "@/lib/page-size"
import { RichText } from "@/lib/rich-text"
import type { Api, ApiVersion, MethodParameters } from "@/lib/server"
import { useApiParameters } from "@/lib/use-api-data"
import { useStatus } from "@/lib/use-status"
import { ApiGate } from "./api-gate"
import { apiPath } from "./api-list-page"
import { FieldsSection } from "./fields-section"
import { BaseTables, baseTableLabel, NamesAsWritten, ParameterLineage, useProductOf } from "./lineage-parts"

export function ApiPage() {
  return <ApiGate>{(api, apis, hidden) => <ApiDetail api={api} apis={apis} hidden={hidden} />}</ApiGate>
}

function ApiDetail({ api, apis, hidden }: { api: Api; apis: Api[]; hidden: readonly string[] }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useStatus()
  const { version, newest, unknown } = chooseVersion(api, params.get("version"))
  const d = version.details
  const isNewest = version === newest
  const group = status?.index.state === "ready" ? status.index.summary.families.find((f) => f.name === api.family)?.group : undefined
  const title = titleIfDifferent(d?.title ?? null, api.name)
  const elsewhere = sameNameElsewhere(apis, api)
  const shownKey = versionKey(version)
  const newestKey = versionKey(newest)

  // Recently viewed: one entry per API, keeping the version last looked at.
  useEffect(() => recordRecent({ kind: "api", family: api.family, name: api.name, version: shownKey }), [api.family, api.name, shownKey])

  // Switching versions replaces the address rather than adding to it, so Back still returns to the list.
  const pick = (key: string) => {
    const next = new URLSearchParams(params)
    if (key === versionKey(newest)) next.delete("version")
    else next.set("version", key)
    setParams(next, { replace: true, state: location.state })
  }

  return (
    <div className="space-y-6">
      <BackToList />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-names text-2xl break-all">{api.name}</h1>
          {/* Saves the version on show, so a version can be pinned. */}
          <StarButton favourite={{ kind: "api", family: api.family, name: api.name, version: shownKey, newest: newestKey }} what={`${api.name} ${shownKey}`} />
          {d?.beta && <Badge variant="outline">beta</Badge>}
          {d?.deprecatedOn && <Badge variant="destructive">deprecated</Badge>}
        </div>
        {title && <p className="text-lg">{title}</p>}
        <p className="text-muted-foreground">
          <Link to={`/apis?family=${encodeURIComponent(api.family)}`} className="font-names underline">
            {api.family}
          </Link>
          {group && ` · ${group}`}
          {elsewhere.length > 0 && (
            <>
              {" · Also in "}
              {elsewhere.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <Link to={apiPath(a)} className="font-names underline">
                    {a.family}
                  </Link>
                  {hidden.includes(a.family) && " (hidden in Settings)"}
                </span>
              ))}
            </>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-head">Version</span>
        {api.versions.length > 1 ? (
          <ToggleGroup
            aria-label="Version"
            value={[versionKey(version)]}
            onValueChange={(value: string[]) => value[0] && pick(value[0])}
            className="w-auto flex-wrap"
          >
            {api.versions.map((v) => (
              <ToggleGroupItem key={v.folder} value={versionKey(v)} className="h-auto min-h-8 py-1">
                <span className="font-names">{versionKey(v)}</span>
                {versionLabel(v) && <span className="text-xs opacity-80"> {versionLabel(v)}</span>}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <span className="font-names">{versionKey(version)}</span>
        )}
        {/* Compare versions: outlined and set apart by a line. */}
        {api.versions.length > 1 && (
          <>
            <Separator orientation="vertical" className="mx-1 data-vertical:h-8 data-vertical:w-0.5 data-vertical:self-center" />
            <Button variant="outline" size="sm" onClick={() => navigate(comparePath(api, ...startingPair(api, version)), { state: { fromApi: true } })}>
              <GitCompareArrows /> Compare versions
            </Button>
          </>
        )}
      </div>

      <Notices api={api} version={version} newest={newest} isNewest={isNewest} unknown={unknown} />

      {d ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="font-head text-lg">About</CardTitle>
            </CardHeader>
            <CardContent className="text-base">
              {d.description ? <RichText text={d.description} /> : <p className="text-muted-foreground">No description in the catalog.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-head text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Details api={api} apis={apis} version={version} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Notice title="This version's spec couldn't be read.">
          <p>{version.problem ?? "The folder has no spec file."}</p>
        </Notice>
      )}

      {d && <FieldsSection api={api} version={version} />}

      {d && <Methods version={version} />}
      {d && <Parameters api={api} version={version} />}
    </div>
  )
}


function Notices(props: { api: Api; version: ApiVersion; newest: ApiVersion; isNewest: boolean; unknown: string | null }) {
  const { version, newest, isNewest, unknown } = props
  const location = useLocation()
  const d = version.details
  const toNewest = (
    <Link to={{ pathname: location.pathname }} replace state={location.state} className="font-names">
      {versionKey(newest)}
    </Link>
  )
  const notices: ReactNode[] = []

  if (unknown) {
    notices.push(
      <Alert key="unknown">
        <Info />
        <AlertTitle>
          This API has no version <span className="font-names">{unknown}</span>. Showing the newest.
        </AlertTitle>
      </Alert>,
    )
  }
  if (d?.deprecatedOn) {
    notices.push(
      <Alert key="deprecated" status="warning">
        <TriangleAlert />
        <AlertTitle>
          Version <span className="font-names">{versionKey(version)}</span> is deprecated (since {d.deprecatedOn})
          {d.sunsetOn ? ` and sunsets on ${d.sunsetOn}.` : "."}
        </AlertTitle>
        {!isNewest && <AlertDescription><p>The newest is {toNewest}.</p></AlertDescription>}
      </Alert>,
    )
  } else if (!isNewest) {
    notices.push(
      <Alert key="older">
        <Info />
        <AlertTitle>You're looking at an older version.</AlertTitle>
        <AlertDescription>
          <p>The newest is {toNewest}.</p>
        </AlertDescription>
      </Alert>,
    )
  }
  if (d?.beta) {
    notices.push(
      <Alert key="beta" status="info">
        <Info />
        <AlertTitle>This is a beta version.</AlertTitle>
      </Alert>,
    )
  }
  return notices.length ? <div className="space-y-3">{notices}</div> : null
}

function Details({ api, apis, version }: { api: Api; apis: Api[]; version: ApiVersion }) {
  const d = version.details!
  // The same tidying as the list's domain filter, so the link lands on the right option.
  const tidy = useMemo(() => tidyDomains(apis.map((a) => a.versions.at(-1)?.details?.sourceDomain ?? null)), [apis])
  const domain = d.sourceDomain ? tidy(d.sourceDomain) : null
  const page = sourcePage(d.sourceTitle, d.sourceName)
  const product = useProductOf(api.family)

  const rows: [string, ReactNode][] = [
    [
      "Version",
      <>
        <span className="font-names">{versionKey(version)}</span>
        {d.versionDiffers && d.specVersion && (
          <>
            {" "}
            (spec says <span className="font-names">{d.specVersion}</span>)
          </>
        )}
      </>,
    ],
  ]
  if (version.baseTables.length > 0) {
    rows.push([baseTableLabel(version.baseTables.length), <BaseTables tables={version.baseTables} product={product} lines />])
  }
  if (d.sourceDomain) {
    rows.push([
      "Domain",
      domain && domain !== NOT_STATED ? (
        <Link to={`/apis?domain=${encodeURIComponent(domain)}`} className="underline">
          {d.sourceDomain}
        </Link>
      ) : (
        d.sourceDomain
      ),
    ])
  }
  if (d.apiType) rows.push(["Type", <span className="font-names">{d.apiType}</span>])
  rows.push(["Status", releaseText(d.releaseStatus, d.beta)])
  // A Business API's form, linked to its page; a Banner ERP API's value as written, its forms and tables linked.
  if (version.forms.length > 0 && !isErpFamily(api.family)) {
    const code = version.forms[0]
    const link = (
      <Link to={formPath(product, code)} className="font-names underline">
        {code}
      </Link>
    )
    rows.push(["Form", d.sourceTitle ? <>{d.sourceTitle} ({link})</> : link])
  } else if (isErpFamily(api.family) && d.sourceName) {
    rows.push(["Source", <NamesAsWritten text={d.sourceName} product={product} forms={new Set(version.forms)} />])
  } else if (page) rows.push([sourcePageLabel(api.family), page])
  if (d.mediaTypes.length) {
    rows.push([
      d.mediaTypes.length > 1 ? "Media types" : "Media type",
      <ul>
        {d.mediaTypes.map((m) => (
          <li key={m}>
            <CopyText value={m} />
          </li>
        ))}
      </ul>,
    ])
  }
  // The path inside the catalog, without the zip's own folders, then the zip.
  const inCatalog = version.specFile ? `${version.relDir}/${version.specFile}` : version.relDir
  rows.push(["In your catalog", <span className="font-names break-all">{`${inCatalog}, in ${version.zip}`}</span>])

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

// On a narrow window each row becomes a little stack: method and path, then the summary, then the permissions.
const STACK = "max-md:block max-md:px-3 max-md:py-1"

function Methods({ version }: { version: ApiVersion }) {
  const methods = sortMethods(version.details?.methods ?? [])
  return (
    <section className="space-y-3">
      <h2 className="font-head text-xl">Methods ({methods.length})</h2>
      {methods.length === 0 ? (
        <p className="text-muted-foreground">No methods in the catalog for this version.</p>
      ) : (
        <Table className="max-md:block">
          <TableHeader className="max-md:hidden">
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Permissions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-md:block">
            {methods.map((m) => (
              <TableRow key={`${m.method} ${m.path}`} className="align-top max-md:block max-md:py-2">
                <TableCell className={`${STACK} max-md:inline-block max-md:pr-0`}>
                  <Badge variant="outline" className="font-names">
                    {m.method}
                  </Badge>
                </TableCell>
                <TableCell className={`${STACK} max-md:inline font-names whitespace-normal break-all`}>{m.path}</TableCell>
                <TableCell className={`${STACK} whitespace-normal`}>{m.summary}</TableCell>
                <TableCell className={`${STACK} whitespace-normal`}>
                  <Permissions list={m.permissions} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

function Permissions({ list }: { list: string[] }) {
  if (list.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((p) => (
        <Badge key={p} variant="secondary" className="h-auto font-names whitespace-normal break-all">
          {p}
        </Badge>
      ))}
    </span>
  )
}

function Parameters({ api, version }: { api: Api; version: ApiVersion }) {
  const { versions, error } = useApiParameters(api.family, api.name)
  const methods = versions?.[version.folder] ?? []
  const groups = parameterGroups(methods)
  const headers = headersLine(methods, version.details?.methods ?? [])
  const product = useProductOf(api.family)

  return (
    <section className="space-y-3">
      <h2 className="font-head text-xl">Query parameters</h2>
      {error ? (
        <p className="text-muted-foreground">Couldn't load the parameters. Is the app still running in the terminal?</p>
      ) : !versions ? (
        <p className="flex items-center gap-2">
          <Spinner /> Loading…
        </p>
      ) : (
        <>
          {groups.length === 0 && <p className="text-muted-foreground">No query parameters in the catalog for this version.</p>}
          {groups.map((m) => (
            // Keyed by version too, so a long list starts again at page 1 when you switch versions.
            <ParameterList key={`${version.folder} ${m.method} ${m.path}`} method={m} product={product} />
          ))}
          {headers && (
            <p>
              <span className="font-head">Headers:</span> <span className="font-names break-words">{headers}</span>
            </p>
          )}
        </>
      )}
    </section>
  )
}

// Most methods have a handful; a few Banner ones have hundreds (365 at most, measured). Lists longer than this get
// the API list's page controls above them.
const LONG_LIST = 50

function ParameterList({ method, product }: { method: MethodParameters; product: string }) {
  const size = usePageSize()
  const [page, setPage] = useState(1)
  const all = method.parameters
  const paged = all.length > LONG_LIST
  const pages = paged ? Math.max(1, Math.ceil(all.length / size)) : 1
  const current = Math.min(page, pages)
  const first = (current - 1) * size
  const shown = paged ? all.slice(first, first + size) : all

  return (
    <div className="space-y-1">
      <h3 className="font-names break-all">
        {method.method} {method.path}
      </h3>
      {paged && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1 text-sm">
          <p>
            {pages > 1 ? `${n(first + 1)}–${n(Math.min(first + size, all.length))} of ` : ""}
            {n(all.length)} parameters
          </p>
          {pages > 1 && <PageStepper page={current} pages={pages} hrefFor={() => "#"} onGo={setPage} />}
          <PageSizePicker
            size={size}
            things="Parameters"
            onChange={(next) => {
              choosePageSize(next)
              setPage(Math.floor(first / next) + 1) // keep the first one you were looking at on the page
            }}
          />
        </div>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-l-2 border-border pl-4 max-md:grid-cols-1">
        {shown.map((p) => (
          <div key={`${p.in} ${p.name}`} className="contents">
            <dt className="flex flex-wrap items-center gap-2 max-md:mt-1">
              <span className="font-names break-all">{p.name}</span>
              {p.in === "path" && <Badge variant="outline">in the path</Badge>}
              {p.required && <Badge variant="outline">required</Badge>}
              {p.formKey && (
                <Badge variant="outline" title={KEY_BLOCK_NOTE}>
                  key block
                </Badge>
              )}
              {p.values && <ParameterLineage values={p.values} product={product} />}
            </dt>
            <dd className="min-w-0">{p.description ? <RichText text={p.description} /> : <span className="text-muted-foreground">No description.</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Back to the list as you left it (filters, page and place), or to the full list if you came from elsewhere. */
function BackToList() {
  const navigate = useNavigate()
  const fromList = (useLocation().state as { fromList?: boolean } | null)?.fromList === true
  return fromList ? (
    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
      <ArrowLeft /> Back to the list
    </Button>
  ) : (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/apis" />}>
      <ArrowLeft /> All APIs
    </Button>
  )
}
