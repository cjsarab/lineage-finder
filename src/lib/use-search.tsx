// Search's data: the search file, loaded the first time Search opens and kept, like the APIs
// (src/lib/use-apis.tsx); made ready to search once, after the page has had a moment to say "Preparing search…".
// The fields' descriptions are loaded only when the Descriptions switch is first turned on. A re-index (the index's
// "built at" time changes) loads both afresh.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { buildSearchIndex, descriptionsInOrder, prepareDescriptions, type SearchIndex } from "@/lib/search"
import { getSearch, getSearchDescriptions, type Api, type FormSummary, type SearchApi, type SearchTable } from "@/lib/server"
import { useStatus } from "@/lib/use-status"

type SearchFile = { apis: SearchApi[]; tables: SearchTable[]; forms?: FormSummary[] }

interface Loaded<T> {
  builtAt: string | null
  data: T | null
  error: boolean
}

interface SearchValue {
  file: Loaded<SearchFile>
  descriptions: Loaded<Record<string, (string | null)[]>>
  /** The descriptions made ready to search, in the prepared index's order of fields. */
  readyDescriptions: string[] | null
  prepared: { file: SearchFile; apis: readonly Api[]; index: SearchIndex } | null
  setPrepared: (p: SearchValue["prepared"]) => void
  loadFile: () => void
  loadDescriptions: () => void
}

const SearchContext = createContext<SearchValue | null>(null)

/** Loads `get` once wanted and whenever the index is rebuilt; again after an error if asked. */
function useLoaded<T>(builtAt: string | null, get: () => Promise<T>) {
  const [wanted, setWanted] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<T>>({ builtAt: null, data: null, error: false })
  const upToDate = loaded.builtAt === builtAt && !loaded.error

  useEffect(() => {
    if (wanted === 0 || builtAt === null || upToDate) return
    let cancelled = false
    get()
      .then((data) => !cancelled && setLoaded({ builtAt, data, error: false }))
      .catch(() => !cancelled && setLoaded((l) => ({ ...l, builtAt, error: true })))
    return () => {
      cancelled = true
    }
  }, [wanted, builtAt, upToDate, get])

  const load = useCallback(() => setWanted((w) => w + 1), [])
  // After a re-index the old data isn't shown: positions in it no longer match the new APIs.
  return { loaded: loaded.builtAt === builtAt ? loaded : { builtAt, data: null, error: false }, load }
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const { status } = useStatus()
  const builtAt = status?.index.state === "ready" ? status.index.summary.builtAt : null
  const file = useLoaded(builtAt, getSearch)
  const descriptions = useLoaded(builtAt, getSearchDescriptions)
  const [prepared, setPrepared] = useState<SearchValue["prepared"]>(null)
  const descriptionsData = descriptions.loaded.data
  const byApi = useMemo(() => (descriptionsData ? prepareDescriptions(descriptionsData) : null), [descriptionsData])
  const preparedIndex = prepared?.index
  const readyDescriptions = useMemo(() => (byApi && preparedIndex ? descriptionsInOrder(preparedIndex, byApi) : null), [byApi, preparedIndex])
  return (
    <SearchContext
      value={{
        file: file.loaded,
        descriptions: descriptions.loaded,
        readyDescriptions,
        prepared,
        setPrepared,
        loadFile: file.load,
        loadDescriptions: descriptions.load,
      }}
    >
      {children}
    </SearchContext>
  )
}

/**
 * The search index for these APIs, or null while it loads and is made ready. `withDescriptions` asks for the fields'
 * descriptions too; `descriptions` is null until they arrive.
 */
export function useSearchIndex(
  apis: readonly Api[] | null,
  withDescriptions: boolean,
): { index: SearchIndex | null; descriptions: string[] | null; error: boolean; descriptionsError: boolean; retry: () => void } {
  const value = useContext(SearchContext)
  if (!value) throw new Error("useSearchIndex needs a SearchProvider around it")
  const { file, descriptions, readyDescriptions, prepared, setPrepared, loadFile, loadDescriptions } = value

  useEffect(() => loadFile(), [loadFile])
  useEffect(() => {
    if (withDescriptions) loadDescriptions()
  }, [withDescriptions, loadDescriptions])

  const ready = prepared && prepared.file === file.data && prepared.apis === apis ? prepared.index : null
  useEffect(() => {
    if (ready || !file.data || !apis) return
    const data = file.data
    // A moment's pause first, so "Preparing search…" is on screen while the work is done.
    const t = setTimeout(() => setPrepared({ file: data, apis, index: buildSearchIndex(apis, data) }), 0)
    return () => clearTimeout(t)
  }, [ready, file.data, apis, setPrepared])

  const retry = useCallback(() => {
    loadFile()
    if (withDescriptions) loadDescriptions()
  }, [loadFile, loadDescriptions, withDescriptions])
  return { index: ready, descriptions: ready ? readyDescriptions : null, error: file.error, descriptionsError: descriptions.error, retry }
}
