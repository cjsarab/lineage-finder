// The forms list: every form an API works through, one product at a time, A–Z, with the tables
// list's module filter and a name box that matches the code and the title. The list itself is shared with the tables
// list (src/components/product-list.tsx).
import { Link } from "react-router"
import { ProductList } from "@/components/product-list"
import { Badge } from "@/components/ui/badge"
import { Item } from "@/components/ui/item"
import { count } from "@/lib/first-run-text"
import { formPath, toListForms, type ListForm } from "@/lib/forms"
import { useForms } from "@/lib/use-tables"

export function FormListPage() {
  const { forms, error, retry } = useForms()
  return (
    <ProductList
      title="Forms"
      thing={["form", "forms"]}
      loaded={{ items: forms, error, retry }}
      toList={toListForms}
      nameLabel="Filter by form code or title"
      moduleNote="By the form code's first letter; smaller modules are under Other."
      noneAtAll="No forms: no API in the families shown works through one."
      headings={
        <>
          <span className="flex-1">Form</span>
          <span className="w-20 text-right">APIs</span>
        </>
      }
      row={(f) => <FormRow form={f} />}
    />
  )
}

function FormRow({ form }: { form: ListForm }) {
  return (
    <Item size="xs" className="rounded-none border-0 sm:flex-nowrap" render={<Link to={formPath(form.product, form.name)} state={{ fromList: true }} />}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-names break-all">{form.name}</span>
        {form.title ? <span>{form.title}</span> : <span className="text-sm text-muted-foreground">no title in the catalog</span>}
        {form.table && <Badge variant="outline">also a table</Badge>}
      </span>
      <span className="w-full text-muted-foreground tabular-nums sm:w-20 sm:text-right">{count(form.apis, "API", "APIs")}</span>
    </Item>
  )
}
