// Screen 1, "Where's your catalog?" (Ellucian's zips), with the folder check.
import { CatalogPicker } from "@/components/catalog-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { ELLUCIAN_DOWNLOAD_PAGE } from "@/lib/first-run-text"
import type { Status } from "@/lib/server"
import type { ReactNode } from "react"

// Fixed components (not written inline), so the path box keeps its focus while you type.
const CardBody = ({ children }: { children: ReactNode }) => <CardContent className="space-y-6">{children}</CardContent>
const CardActions = ({ children }: { children: ReactNode }) => <CardFooter className="justify-end">{children}</CardFooter>

export function ChooseCatalog(props: { status: Status; stopped: boolean; onStarted: () => void }) {
  const outdated = props.status.index.state === "outdated"
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <h1 className="font-head text-2xl">
          {outdated ? "Lineage Finder has been updated and needs to re-read your catalog" : "Welcome. First, where's your API catalog?"}
        </h1>
        {/* The link is underlined text with no
            icon or arrow, like the app's other in-text links (the family links in components/page-parts.tsx). */}
        <CardDescription className="space-y-2 text-base">
          <p>
            Lineage Finder uses the API catalog that Ellucian provides as five zip files. Put the zips in a
            folder, point the app at it, and it builds an index on this computer. Nothing leaves your computer. This takes
            a minute or so, once.
          </p>
          <p>
            <a href={ELLUCIAN_DOWNLOAD_PAGE} target="_blank" rel="noopener noreferrer" className="underline">
              Download the zips from Ellucian
            </a>{" "}
            (you'll need your Ellucian login)
          </p>
        </CardDescription>
      </CardHeader>

      <CatalogPicker
        status={props.status}
        submitLabel="Read my catalog"
        onStarted={props.onStarted}
        Body={CardBody}
        Actions={CardActions}
        notice={
          props.stopped && (
            <Alert>
              <AlertDescription>Reading stopped. Nothing was changed; you can start again.</AlertDescription>
            </Alert>
          )
        }
      />
    </Card>
  )
}
