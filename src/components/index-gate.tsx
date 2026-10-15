import { Navigate, Outlet } from "react-router"
import { useStatus } from "@/lib/use-status"

/** Every page needs an index: until there's a usable one, go to the first run. A re-index doesn't count:
 * the current index stays usable meanwhile. */
export function IndexGate() {
  const { status } = useStatus()
  if (!status) return null
  if (status.index.state !== "ready") return <Navigate to="/setup" replace />
  return <Outlet />
}
