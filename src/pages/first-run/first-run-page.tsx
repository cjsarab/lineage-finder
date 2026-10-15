// The first-run flow at /setup: choose → check → read → done.
import { useEffect, useState } from "react"
import { Navigate, useNavigate } from "react-router"
import { useChanges } from "@/lib/catalog-update"
import { stopReading } from "@/lib/server"
import { useStatus } from "@/lib/use-status"
import { ChooseCatalog } from "./choose-catalog"
import { Done, Failed } from "./done"
import { Reading } from "./reading"

export function FirstRunPage() {
  const { status, refresh } = useStatus()
  const navigate = useNavigate()
  // A first read has none; a re-read here (after an app update asked for one) can.
  const { changes } = useChanges()
  // True once this page has seen a reading start, so it shows how that reading ended. A reload after the end
  // starts afresh instead.
  const [watching, setWatching] = useState(false)

  const running = status?.run != null
  useEffect(() => {
    if (running) setWatching(true)
  }, [running])

  if (!status) return null
  if (status.run) {
    return (
      <Reading
        run={status.run}
        onStop={() => {
          void stopReading().then(refresh)
        }}
      />
    )
  }

  const last = watching ? status.last : null
  if (last?.outcome === "done") {
    return <Done summary={last.summary} dataDir={status.dataDir} changes={changes} onContinue={() => navigate("/")} />
  }
  if (status.index.state === "ready") return <Navigate to="/" replace />
  if (last?.outcome === "failed") return <Failed message={last.message} onRetry={() => setWatching(false)} />
  return (
    <ChooseCatalog
      status={status}
      stopped={last?.outcome === "stopped"}
      onStarted={() => {
        setWatching(true)
        void refresh()
      }}
    />
  )
}
