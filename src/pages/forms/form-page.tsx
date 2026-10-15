// A form's page: its title, module and every API built on it, with each API's versions and base
// tables. A form that shares its name with a table links to the table. Laid out like a table's page, with
// the same Details box, filter box and pages (src/components/page-parts.tsx). "Families shown" (Settings) is honoured.
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router"
import { StarButton } from "@/components/favourites/star-button"
import { Notice } from "@/components/notice"
import { BackToList, DetailsList, FamilyCounts, FilterBox, Paged } from "@/components/page-parts"
import { useSettingsOpen } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useHiddenFamilies } from "@/lib/families"
import { recordRecent } from "@/lib/favourites"
import { n } from "@/lib/first-run-text"
import { shownFormApis } from "@/lib/forms"
import { matchesQuery } from "@/lib/search"
import type { FormApi, FormDetail } from "@/lib/server"
import { moduleLabel, moduleOf, splitApiId, tablePath, writeTableFilters } from "@/lib/tables"
import { useForm, useForms } from "@/lib/use-tables"
import { apiPath } from "@/pages/apis/api-list-page"
import { BaseTables, baseTableLabel, NamesAsWritten } from "@/pages/apis/lineage-parts"

export function FormPage() {
  const params = useParams()
  const product = params.product ?? ""
  const code = params.code ?? ""
  const { form, error } = useForm(product, code)
  const hidden = useHiddenFamilies()
  const { openAt: openSettingsAt } = useSettingsOpen()
  const apis = useMemo(() => (form ? shownFormApis(form, hidden) : null), [form, hidden])
  // Recently viewed: not a form that isn't there or that only hidden families use.
  const seen = form && apis && apis.length > 0
  const seenProduct = form?.product ?? ""
  const seenCode = form?.code ?? ""
  useEffect(() => {
    if (seen) recordRecent({ kind: "form", product: seenProduct, code: seenCode })
  }, [seen, seenProduct, seenCode])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load this form</AlertTitle>
        <AlertDescription>Is the app still running in the terminal?</AlertDescription>
      </Alert>
    )
  }
  if (form === undefined) {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Loading the form…
      </p>
    )
  }
  if (form === null || !apis) {
    return (
      <Notice title={`No ${product} form called ${code} in the index.`}>
        <Button variant="outline" nativeButton={false} render={<Link to="/forms" />}>
          See every form
        </Button>
      </Notice>
    )
  }
  if (apis.length === 0) {
    return (
      <Notice title={`${form.code} is only used by families hidden in Settings.`}>
        <Button variant="outline" onClick={() => openSettingsAt("families")}>
          Open Settings
        </Button>
      </Notice>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BackToList to="/forms" all="All forms" />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-names text-2xl font-semibold break-all">{form.code}</span>
            {form.title && <span className="font-head text-xl">{form.title}</span>}
          </h1>
          <StarButton favourite={{ kind: "form", product: form.product, code: form.code }} what={form.code} />
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="font-head text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <FormDetails form={form} apis={apis} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-head text-xl">APIs built on this form</h2>
        <Apis form={form} apis={apis} />
      </section>
    </div>
  )
}

function FormDetails({ form, apis }: { form: FormDetail; apis: FormApi[] }) {
  const module = moduleOf(form.product, form.code)
  const older = apis.filter((a) => a.older).length
  const families = new Set(apis.map((a) => splitApiId(a.id).family))
  const rows: [string, ReactNode][] = [["Product", form.product]]
  if (module) {
    rows.push([
      "Module",
      <Link to={`/forms?${writeTableFilters({ product: null, modules: [module], name: "", page: 1 })}`} className="underline">
        {moduleLabel(module)}
      </Link>,
    ])
  }
  rows.push(["APIs", `${n(apis.length)}${older > 0 ? ` (${n(older)} in older versions only)` : ""}`])
  rows.push([families.size > 1 ? "Families" : "Family", <FamilyCounts apis={apis} />])
  if (form.table) {
    rows.push([
      "Also a table",
      <Link to={tablePath(form.product, form.code)} className="font-names underline">
        {form.code}
      </Link>,
    ])
  }
  if (form.titles.length > 0) {
    rows.push([
      "Other titles",
      <ul>
        {form.titles.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>,
    ])
  }
  return <DetailsList rows={rows} />
}

function Apis({ form, apis }: { form: FormDetail; apis: FormApi[] }) {
  const [query, setQuery] = useState("")
  const matched = useMemo(() => apis.filter((a) => matchesQuery(query, splitApiId(a.id).name)), [apis, query])
  return (
    <Paged
      items={matched}
      things={["API", "APIs"]}
      filter={<FilterBox label="Filter by API name" value={query} onChange={setQuery} />}
      showFilter={apis.length > 5}
      empty="No APIs match."
      render={(shown) => (
        <ul className="border-2 border-border bg-card shadow-md">
          {shown.map((api) => (
            <ApiRow key={api.id} api={api} form={form} />
          ))}
        </ul>
      )}
    />
  )
}

/** One API: its name, family and versions, then its base tables, or for a Banner ERP API its source value as written. */
function ApiRow({ api, form }: { api: FormApi; form: FormDetail }) {
  const { family, name } = splitApiId(api.id)
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border/30 px-3 py-3 last:border-b-0">
      <Link to={apiPath({ family, name })} className="font-names font-semibold [overflow-wrap:anywhere] underline">
        {name}
      </Link>
      <span className="font-names text-sm text-muted-foreground">{family}</span>
      <span className="text-sm tabular-nums">{api.versions.join(", ")}</span>
      {api.older && <span className="text-sm text-muted-foreground">older versions only</span>}
      {api.source ? (
        <span className="text-sm">
          <span className="text-muted-foreground">Also names </span>
          <ErpNames text={api.source} form={form} />
        </span>
      ) : (
        api.baseTables.length > 0 && (
          <span className="text-sm">
            <span className="text-muted-foreground">{baseTableLabel(api.baseTables.length)} </span>
            <BaseTables tables={api.baseTables} product={form.product} />
          </span>
        )
      )}
    </li>
  )
}

/** An ERP API's value, with the other forms in it linked (the forms list tells which names are forms). */
function ErpNames({ text, form }: { text: string; form: FormDetail }) {
  const { forms } = useForms()
  const codes = useMemo(() => new Set((forms ?? []).filter((f) => f.product === form.product).map((f) => f.code)), [forms, form.product])
  return <NamesAsWritten text={text} product={form.product} forms={codes} self={form.code} />
}
