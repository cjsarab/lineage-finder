// The "Fields and lineage" section of an API's page: every field the API sends and
// returns, with the table and column behind it, folded under parents, with a filter, "Only fields with lineage",
// Open all, and pages when the top level has more fields than the page size (from 20). The version's base table sits
// above the fields as well as in Details.
import { ChevronRight } from "lucide-react"
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { PageSizePicker, PageStepper } from "@/components/page-controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { allParents, buildTree, coverageText, fieldWords, filterTree, type FieldNode } from "@/lib/fields"
import { count, n } from "@/lib/first-run-text"
import { choosePageSize, usePageSize } from "@/lib/page-size"
import type { Api, ApiVersion, Field } from "@/lib/server"
import { useApiFields } from "@/lib/use-api-data"
import { AsWritten, BaseTables, baseTableLabel, ColumnLink, Name, TableLink, useProductOf } from "./lineage-parts"

export function FieldsSection({ api, version }: { api: Api; version: ApiVersion }) {
  const { versions, error } = useApiFields(api.family, api.name)
  const data = versions?.[version.folder]
  // A search result opens the page with the filter set to its field: `?field=owner.title`, and
  // `&schema=` for a field in a schema no method uses.
  const [params] = useSearchParams()
  const field = params.get("field") ?? ""
  const schema = params.get("schema")
  const section = useRef<HTMLElement>(null)
  const arrived = field !== "" && data !== undefined
  useEffect(() => {
    if (arrived) section.current?.scrollIntoView?.({ block: "start" })
  }, [arrived])
  const product = useProductOf(api.family)
  const base = version.baseTables

  return (
    <section ref={section} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-head text-xl">Fields and lineage</h2>
        <p className="text-muted-foreground">{coverageText(version.lineage)}</p>
      </div>
      {base.length > 0 && (
        <p>
          <span className="font-head">{baseTableLabel(base.length)}:</span> <BaseTables tables={base} product={product} />
        </p>
      )}
      {error ? (
        <p className="text-muted-foreground">Couldn't load the fields. Is the app still running in the terminal?</p>
      ) : !versions ? (
        <p className="flex items-center gap-2">
          <Spinner /> Loading…
        </p>
      ) : (
        <>
          {/* Keyed by version, so switching version starts afresh (page 1, nothing open). */}
          {data && data.fields.length > 0 && <FieldsTable key={version.folder} fields={data.fields} product={product} initialQuery={schema ? "" : field} />}
          {data && data.other.length > 0 && (
            <Collapsible className="space-y-3 pt-2" defaultOpen={schema !== null && data.other.some((o) => o.schema === schema)}>
              <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group -ml-3" />}>
                <ChevronRight className="transition-transform group-data-[panel-open]:rotate-90" />
                Other schemas in the spec, not used by any method ({data.other.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4">
                {data.other.map((o) => (
                  <div key={o.schema} className="space-y-2">
                    <h3 className="font-names break-all">{o.schema}</h3>
                    <FieldsTable key={`${version.folder} ${o.schema}`} fields={o.fields} product={product} initialQuery={o.schema === schema ? field : ""} />
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </section>
  )
}

function FieldsTable({ fields, product, initialQuery = "" }: { fields: Field[]; product: string; initialQuery?: string }) {
  const tree = useMemo(() => buildTree(fields), [fields])
  const [query, setQuery] = useState(initialQuery)
  const [onlyLineage, setOnlyLineage] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const size = usePageSize()
  const onlyId = useId()

  const { nodes, open: openForQuery } = useMemo(() => filterTree(tree, query, onlyLineage), [tree, query, onlyLineage])
  const parents = useMemo(() => allParents(tree), [tree])
  const isOpen = (path: string) => opened.has(path)
  const allOpen = parents.length > 0 && parents.every((p) => opened.has(p))
  useEffect(() => setPage(1), [query, onlyLineage])
  // The parents of what the filter matches open, and can then be closed like any other.
  useEffect(() => {
    if (openForQuery.size) setOpened((o) => new Set([...o, ...openForQuery]))
  }, [openForQuery])

  const pages = Math.max(1, Math.ceil(nodes.length / size))
  const current = Math.min(page, pages)
  const first = (current - 1) * size
  const shown = nodes.length > size ? nodes.slice(first, first + size) : nodes
  const toggle = (path: string) =>
    setOpened((o) => {
      const next = new Set(o)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Input
          type="search"
          aria-label="Filter by field or lineage"
          placeholder="Filter by field or lineage…"
          className="w-64 max-w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="flex items-center gap-2">
          <Checkbox id={onlyId} checked={onlyLineage} onCheckedChange={(c) => setOnlyLineage(c === true)} />
          <Label htmlFor={onlyId} className="font-normal">
            Only fields with lineage
          </Label>
        </span>
        {parents.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setOpened(allOpen ? new Set() : new Set(parents))}>
            {allOpen ? "Close all" : "Open all"}
          </Button>
        )}
      </div>
      {nodes.length > size && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <p>
            {n(first + 1)}–{n(Math.min(first + size, nodes.length))} of {count(nodes.length, "top-level field", "top-level fields")}
          </p>
          <PageStepper page={current} pages={pages} hrefFor={() => "#"} onGo={setPage} />
          <PageSizePicker
            size={size}
            things="Fields"
            onChange={(next) => {
              choosePageSize(next)
              setPage(Math.floor(first / next) + 1)
            }}
          />
        </div>
      )}
      {nodes.length === 0 ? (
        <p className="text-muted-foreground">{query.trim() ? "No fields match." : "No fields with lineage."}</p>
      ) : (
        <Table className="max-md:block">
          <TableHeader className="max-md:hidden">
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Column</TableHead>
              <TableHead>As written in the catalog</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-md:block">
            {shown.map((node) => (
              <Rows key={node.path} node={node} product={product} isOpen={isOpen} toggle={toggle} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

// On a narrow window each row becomes a little stack: the field, then table and column, then the catalog's text.
const STACK = "max-md:block max-md:px-3 max-md:py-0.5"

function Rows({ node, product, isOpen, toggle }: { node: FieldNode; product: string; isOpen: (path: string) => boolean; toggle: (path: string) => void }) {
  const { field } = node
  const parent = node.children.length > 0
  const open = parent && isOpen(node.path)
  const words = parent && !field.values ? null : fieldWords(field)
  const places = (field.values ?? []).flatMap((v) => v.places ?? [])

  return (
    <Fragment>
      <TableRow className="align-top max-md:block max-md:py-2">
        <TableCell className={`${STACK} whitespace-normal`}>
          <span className="flex items-start gap-1" style={{ paddingLeft: `${field.depth * 1.25}rem` }}>
            {parent ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-expanded={open}
                aria-label={`${open ? "Close" : "Open"} ${node.path}`}
                onClick={() => toggle(node.path)}
                className="-ml-1"
              >
                <ChevronRight className={open ? "rotate-90 transition-transform" : "transition-transform"} />
              </Button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span>
              <Name text={field.name} title={node.path} />
              {field.list && <span className="text-muted-foreground md:whitespace-nowrap"> (list)</span>}
            </span>
          </span>
        </TableCell>
        {words !== null ? (
          <TableCell colSpan={2} className={`${STACK} whitespace-normal ${words === "nothing published" ? "text-muted-foreground" : ""}`}>
            {words}
          </TableCell>
        ) : (
          <>
            <TableCell className={`${STACK} whitespace-normal`}>
              {places.map((p, i) => (
                <span key={i} className="block">
                  <TableLink product={product} table={p.table} />
                </span>
              ))}
            </TableCell>
            <TableCell className={`${STACK} whitespace-normal`}>
              {places.map((p, i) => (
                <span key={i} className="flex flex-wrap items-center gap-2">
                  {p.column && <ColumnLink product={product} table={p.table} column={p.column} />}
                  {p.probable && <Badge variant="outline">probable</Badge>}
                </span>
              ))}
            </TableCell>
          </>
        )}
        <TableCell className={`${STACK} whitespace-normal`}>
          {(field.values ?? []).map((v, i) => (
            <AsWritten key={i} value={v} product={product} />
          ))}
          {parent && (
            <span className="block text-sm text-muted-foreground">
              {count(node.leaves, "field", "fields")}, {n(node.leavesWithLineage)} with lineage
            </span>
          )}
        </TableCell>
      </TableRow>
      {open && node.children.map((c) => <Rows key={c.path} node={c} product={product} isOpen={isOpen} toggle={toggle} />)}
    </Fragment>
  )
}
