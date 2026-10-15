// The tables and forms. Each list is loaded the first time a page asks,
// then kept until a re-index (like the APIs, src/lib/use-apis.tsx); a table's or form's page is asked for when it opens.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { getForm, getForms, getTable, getTables, type FormDetail, type FormSummary, type TableDetail, type TableSummary } from "@/lib/server"
import { useStatus } from "@/lib/use-status"

interface ListValue<T> {
  items: T[] | null
  error: boolean
  load: () => void
}

/** A list from the index, loaded once asked for and kept until a re-index. */
function indexList<T>(fetchList: () => Promise<T[]>, what: string) {
  const Context = createContext<ListValue<T> | null>(null)

  function Provider({ children }: { children: ReactNode }) {
    const { status } = useStatus()
    const builtAt = status?.index.state === "ready" ? status.index.summary.builtAt : null
    const [wanted, setWanted] = useState(0)
    const [loaded, setLoaded] = useState<{ builtAt: string | null; items: T[] | null; error: boolean }>({ builtAt: null, items: null, error: false })
    const upToDate = loaded.builtAt === builtAt && !loaded.error

    useEffect(() => {
      if (wanted === 0 || builtAt === null || upToDate) return
      let cancelled = false
      fetchList()
        .then((items) => !cancelled && setLoaded({ builtAt, items, error: false }))
        .catch(() => !cancelled && setLoaded((l) => ({ ...l, builtAt, error: true })))
      return () => {
        cancelled = true
      }
    }, [wanted, builtAt, upToDate])

    const load = useCallback(() => setWanted((w) => w + 1), [])
    return <Context value={{ items: loaded.items, error: loaded.error, load }}>{children}</Context>
  }

  function useList(): { items: T[] | null; error: boolean; retry: () => void } {
    const value = useContext(Context)
    if (!value) throw new Error(`The ${what} need their provider around them`)
    const { load } = value
    useEffect(() => load(), [load])
    return { items: value.items, error: value.error, retry: load }
  }

  return { Provider, useList }
}

/** One page from the index: `undefined` while loading, null if the index has no such thing. */
function useIndexPage<T>(fetchOne: (product: string, name: string) => Promise<T | null>, product: string, name: string) {
  const { status } = useStatus()
  const builtAt = status?.index.state === "ready" ? status.index.summary.builtAt : null
  const key = `${builtAt} ${product}/${name}`
  const [loaded, setLoaded] = useState<{ key: string; item: T | null; error: boolean }>({ key: "", item: null, error: false })

  useEffect(() => {
    if (builtAt === null) return
    let cancelled = false
    fetchOne(product, name)
      .then((item) => !cancelled && setLoaded({ key, item, error: false }))
      .catch(() => !cancelled && setLoaded({ key, item: null, error: true }))
    return () => {
      cancelled = true
    }
  }, [key, builtAt, product, name, fetchOne])

  // Until the new one arrives after a re-index, the previous answer for the same page stays on show.
  const same = loaded.key.endsWith(` ${product}/${name}`)
  return { item: same && !loaded.error ? loaded.item : undefined, error: loaded.key === key && loaded.error }
}

const tables = indexList<TableSummary>(getTables, "tables")
const forms = indexList<FormSummary>(getForms, "forms")

export function TablesProvider({ children }: { children: ReactNode }) {
  return (
    <tables.Provider>
      <forms.Provider>{children}</forms.Provider>
    </tables.Provider>
  )
}

/** Every table in the index, or null while they load. */
export function useTables(): { tables: TableSummary[] | null; error: boolean; retry: () => void } {
  const { items, error, retry } = tables.useList()
  return { tables: items, error, retry }
}

/** Every form in the index, or null while they load. */
export function useForms(): { forms: FormSummary[] | null; error: boolean; retry: () => void } {
  const { items, error, retry } = forms.useList()
  return { forms: items, error, retry }
}

/** One table's page: `undefined` while loading, null if the index has no such table. */
export function useTable(product: string, name: string): { table: TableDetail | null | undefined; error: boolean } {
  const { item, error } = useIndexPage(getTable, product, name)
  return { table: item, error }
}

/** One form's page: `undefined` while loading, null if the index has no such form. */
export function useForm(product: string, code: string): { form: FormDetail | null | undefined; error: boolean } {
  const { item, error } = useIndexPage(getForm, product, code)
  return { form: item, error }
}
