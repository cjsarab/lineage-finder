// The API named in the address (`/apis/:family/:name`, and its compare page), or why it can't be shown: still loading,
// not in the catalog, or its family hidden in Settings. Shared by the API page and the compare
// page.
import type { ReactNode } from "react"
import { Link, useParams } from "react-router"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { setHiddenFamilies, useHiddenFamilies } from "@/lib/families"
import type { Api } from "@/lib/server"
import { useApis } from "@/lib/use-apis"

export function ApiGate({ children }: { children: (api: Api, apis: Api[], hidden: readonly string[]) => ReactNode }) {
  const { family = "", name = "" } = useParams()
  const { apis, error } = useApis()
  const hidden = useHiddenFamilies()

  if (error) return <Notice title="Couldn't load the APIs. Is the app still running in the terminal?" />
  if (!apis) {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Loading…
      </p>
    )
  }

  const api = apis.find((a) => a.family === family && a.name === name)
  if (!api) {
    return (
      <Notice title="No API by that name in your catalog.">
        <p>
          <span className="font-names break-all">
            {family}/{name}
          </span>{" "}
          isn't in the index. <Link to="/apis" className="underline">See every API</Link>.
        </p>
      </Notice>
    )
  }

  if (hidden.includes(family)) {
    return (
      <Notice title={api.name}>
        <p>
          This API's family (<span className="font-names">{family}</span>) is hidden in Settings.
        </p>
        <Button variant="outline" onClick={() => setHiddenFamilies(hidden.filter((h) => h !== family))}>
          Show it
        </Button>
      </Notice>
    )
  }

  return children(api, apis, hidden)
}
