// The tables list: every table the lineage names, one product at a time, A–Z, with a module
// filter for Banner and a name box; 20, 50 or 100 to a page. The list itself is shared with the forms list
// (src/components/product-list.tsx). Tables only lookups name are listed too, marked.
import { Link } from "react-router"
import { ProductList } from "@/components/product-list"
import { Badge } from "@/components/ui/badge"
import { Item } from "@/components/ui/item"
import { count } from "@/lib/first-run-text"
import { tablePath, toListTables, type ListTable } from "@/lib/tables"
import { useTables } from "@/lib/use-tables"
import { Typos } from "@/pages/apis/lineage-parts"
import { LOOKUPS_ONLY_NOTE } from "./table-page"

export function TableListPage() {
  const { tables, error, retry } = useTables()
  return (
    <ProductList
      title="Tables"
      thing={["table", "tables"]}
      loaded={{ items: tables, error, retry }}
      toList={toListTables}
      nameLabel="Filter by table name"
      moduleNote="By the table name's first letter; smaller modules are under Other."
      noneAtAll="No tables: the lineage in the families shown names none."
      headings={
        <>
          <span className="flex-1">Table</span>
          <span className="w-28 text-right">Columns</span>
          <span className="w-20 text-right">APIs</span>
        </>
      }
      row={(t) => <TableRow table={t} />}
    />
  )
}

function TableRow({ table }: { table: ListTable }) {
  return (
    <Item size="xs" className="rounded-none border-0 sm:flex-nowrap" render={<Link to={tablePath(table.product, table.name)} state={{ fromList: true }} />}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="font-names break-all">{table.name}</span>
        {table.probable && <Badge variant="outline">probable</Badge>}
        {table.lookupsOnly && (
          <Badge variant="outline" title={LOOKUPS_ONLY_NOTE}>
            named only in lookups
          </Badge>
        )}
        <Typos text={table.name} product={table.product} linked={false} />
        {table.columns === 0 && !table.lookupsOnly && <span className="text-sm text-muted-foreground">no columns named</span>}
      </span>
      {/* Narrow: one line under the name. Wide: two columns of numbers. */}
      <span className="flex w-full gap-x-2 text-muted-foreground tabular-nums sm:w-auto">
        <span className="sm:w-28 sm:text-right">{table.columns > 0 ? count(table.columns, "column", "columns") : ""}</span>
        {table.columns > 0 && <span className="sm:hidden">·</span>}
        <span className="sm:w-20 sm:text-right">{count(table.apis, "API", "APIs")}</span>
      </span>
    </Item>
  )
}
