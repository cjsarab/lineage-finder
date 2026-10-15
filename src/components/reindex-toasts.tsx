// Says how a re-index ended, wherever you are in the app. Only for a re-index: the first run shows its own Done
// screen. "See the summary" opens it at /summary; you keep browsing unless you click it.
import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { count } from "@/lib/first-run-text"
import { useStatus } from "@/lib/use-status"

export function ReindexToasts() {
  const { status } = useStatus()
  const running = useRef<{ hadIndex: boolean } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!status) return
    if (status.run) {
      running.current ??= { hadIndex: status.index.state === "ready" }
      return
    }
    const ended = running.current
    running.current = null
    if (!ended?.hadIndex || !status.last) return
    const last = status.last
    if (last.outcome === "done") {
      toast.success("Re-index finished", {
        description: `${count(last.summary.apis, "API", "APIs")} read.`,
        action: { label: "See the summary", onClick: () => navigate("/summary") },
      })
    }
    else if (last.outcome === "stopped") toast.info("Re-index stopped", { description: "Your index is as it was." })
    else toast.error("Re-index failed", { description: `${last.message} Your index is as it was.` })
  }, [status, navigate])

  return null
}
