// One API's parameters or fields and lineage, asked for
// when its page opens and again after a re-index. They're kept out of the list's data, as only this page uses them.
import { useEffect, useState } from "react"
import { getApiChangesWas, getApiFields, getApiParameters, type MethodParameters, type VersionFields, type VersionWas } from "@/lib/server"
import { useStatus } from "@/lib/use-status"

type Loaded<T> = { key: string; versions: Record<string, T> | null; error: boolean }

function useApiData<T>(get: (family: string, name: string) => Promise<Record<string, T>>, family: string, name: string) {
  const { status } = useStatus()
  const builtAt = status?.index.state === "ready" ? status.index.summary.builtAt : null
  const key = `${builtAt} ${family}/${name}`
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: "", versions: null, error: false })

  useEffect(() => {
    if (builtAt === null) return
    let cancelled = false
    get(family, name)
      .then((versions) => !cancelled && setLoaded({ key, versions, error: false }))
      .catch(() => !cancelled && setLoaded({ key, versions: null, error: true }))
    return () => {
      cancelled = true
    }
  }, [get, key, builtAt, family, name])

  // Until the new ones arrive after a re-index, the previous answer for the same API stays on show.
  const sameApi = loaded.key.endsWith(` ${family}/${name}`)
  return { versions: sameApi ? loaded.versions : null, error: loaded.key === key && loaded.error }
}

/** By version folder; null while loading. */
export const useApiParameters = (family: string, name: string) => useApiData<MethodParameters[]>(getApiParameters, family, name)

/** By version folder; null while loading. */
export const useApiFields = (family: string, name: string) => useApiData<VersionFields>(getApiFields, family, name)

/** By version folder, each changed version as it was at the read before; null while loading. */
export const useApiChangesWas = (family: string, name: string) => useApiData<VersionWas>(getApiChangesWas, family, name)
