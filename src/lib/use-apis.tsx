// Every API in the index, loaded once the first time a browsing page asks, then kept.
// After a re-index (the index's "built at" time changes) the new list is loaded; the old one stays on show until
// it arrives.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { getApis, type Api } from "@/lib/server"
import { useStatus } from "@/lib/use-status"

interface Loaded {
  builtAt: string | null
  apis: Api[] | null
  error: boolean
}

interface ApisValue {
  apis: Api[] | null
  error: boolean
  /** Ask for the APIs (a browsing page is showing), or ask again after an error. */
  load: () => void
}

const ApisContext = createContext<ApisValue | null>(null)

export function ApisProvider({ children }: { children: ReactNode }) {
  const { status } = useStatus()
  const builtAt = status?.index.state === "ready" ? status.index.summary.builtAt : null
  const [wanted, setWanted] = useState(0)
  const [loaded, setLoaded] = useState<Loaded>({ builtAt: null, apis: null, error: false })
  const upToDate = loaded.builtAt === builtAt && !loaded.error

  useEffect(() => {
    if (wanted === 0 || builtAt === null || upToDate) return
    let cancelled = false
    getApis()
      .then((apis) => !cancelled && setLoaded({ builtAt, apis, error: false }))
      .catch(() => !cancelled && setLoaded((l) => ({ ...l, builtAt, error: true })))
    return () => {
      cancelled = true
    }
  }, [wanted, builtAt, upToDate])

  const load = useCallback(() => setWanted((w) => w + 1), [])
  return <ApisContext value={{ apis: loaded.apis, error: loaded.error, load }}>{children}</ApisContext>
}

/** The index's APIs, or null while they load. */
export function useApis(): { apis: Api[] | null; error: boolean; retry: () => void } {
  const value = useContext(ApisContext)
  if (!value) throw new Error("useApis needs an ApisProvider around it")
  const { load } = value
  useEffect(() => load(), [load])
  return { apis: value.apis, error: value.error, retry: load }
}
