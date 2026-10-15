// The summary of the last read, at /summary: the first run's Done screen with what
// changed since the read before. Reached from the "Re-index finished" toast and the landing page.
import { useLocation, useNavigate } from "react-router"
import { useChanges } from "@/lib/catalog-update"
import { useStatus } from "@/lib/use-status"
import { Done } from "./done"

export function SummaryPage() {
  const { status } = useStatus()
  const { changes, loaded } = useChanges()
  const navigate = useNavigate()
  const location = useLocation()
  if (status?.index.state !== "ready" || !loaded) return null
  return (
    <Done
      summary={status.index.summary}
      dataDir={status.dataDir}
      changes={changes}
      title={changes ? "Your catalog has been re-read" : "Your catalog is ready"}
      continueLabel="Back"
      // Back where you came from, or the landing page when this was opened directly.
      onContinue={() => (location.key === "default" ? navigate("/") : navigate(-1))}
    />
  )
}
