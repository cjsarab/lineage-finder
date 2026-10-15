// The app's status (is there an index? is a reading running?), shared by every page. While a reading runs it
// asks the server again twice a second, so progress moves, and likewise while the server checks whether the catalog
// has changed.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { getStatus, type Status } from "@/lib/server"

export const POLL_MS = 500

interface StatusValue {
  status: Status | null
  /** Set if the server can't be reached. */
  error: boolean
  refresh: () => Promise<void>
}

const StatusContext = createContext<StatusValue | null>(null)

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getStatus())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const running = status?.run != null || status?.catalogCheck.state === "checking"
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [running, refresh])

  return <StatusContext value={{ status, error, refresh }}>{children}</StatusContext>
}

export function useStatus(): StatusValue {
  const value = useContext(StatusContext)
  if (!value) throw new Error("useStatus needs a StatusProvider around it")
  return value
}
