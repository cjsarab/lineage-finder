// The forms list and a form's page: what's shown once "Families shown" (Settings) has taken out
// hidden families. The list's filters and modules are the tables list's (src/lib/tables.ts).
import { prepareName } from "@/lib/search"
import type { FormApi, FormDetail, FormSummary } from "@/lib/server"
import { moduleOf, splitApiId, type Listed } from "@/lib/tables"

export const formPath = (product: string, code: string) => `/forms/${encodeURIComponent(product)}/${encodeURIComponent(code)}`

export interface ListForm extends Listed {
  /** The form's code (`name`, for the shared list) and title. */
  title: string | null
  apis: number
  /** A table has the same name. */
  table: boolean
}

/** The list as shown: hidden families' APIs left out of the counts, and forms only they use left out altogether. */
export function toListForms(forms: readonly FormSummary[], hidden: readonly string[]): ListForm[] {
  const out: ListForm[] = []
  for (const f of forms) {
    const apis = f.apis.filter((id) => !hidden.includes(splitApiId(id).family)).length
    if (apis === 0) continue
    out.push({
      product: f.product,
      name: f.code,
      // The name box matches the code and the title.
      key: `${prepareName(f.code)}\n${prepareName(f.title ?? "")}`,
      module: moduleOf(f.product, f.code),
      title: f.title,
      apis,
      table: f.table === true,
    })
  }
  return out
}

/** A form's APIs without hidden families'. */
export const shownFormApis = (form: FormDetail, hidden: readonly string[]): FormApi[] =>
  form.apis.filter((a) => !hidden.includes(splitApiId(a.id).family))
