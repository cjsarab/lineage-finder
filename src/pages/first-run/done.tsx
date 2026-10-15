// Screen 4, "Your catalog is ready", and the "didn't finish" card. It's also the summary of a re-index, at /summary,
// with what changed since the read before.
import { ChevronRight, CircleCheck, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { count, seconds } from "@/lib/first-run-text"
import { groupFamilies } from "@/lib/families"
import type { Changes, FamilySummary, IndexSummary } from "@/lib/server"
import { ChangesSection } from "./changes-section"

export function Done(props: {
  summary: IndexSummary
  dataDir: string
  /** What changed since the read before; null for a first read. */
  changes: Changes | null
  /** "Your catalog is ready" after a first run; "Your catalog has been re-read" on the summary. */
  title?: string
  /** The footer's button: "Start browsing" after a first run. */
  continueLabel?: string
  onContinue: () => void
}) {
  const s = props.summary
  const careTotal = s.care.reduce((sum, c) => sum + c.count, 0)

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <h1 className="flex items-center gap-2 font-head text-2xl">
          <CircleCheck className="size-7 shrink-0" /> {props.title ?? "Your catalog is ready"}
        </h1>
      </CardHeader>

      <CardContent className="space-y-6 text-base">
        <p>
          {count(s.apis, "API", "APIs")} ({count(s.versions, "version", "versions")}) in{" "}
          {count(s.families.length, "family", "families")}, read in {seconds(s.seconds)}.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {groupFamilies(s.families).map((g) => (
            <FamilyList key={g.group} title={g.group} families={g.families} />
          ))}
        </div>

        <ChangesSection changes={props.changes} />

        {s.unreadable.length > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>{count(s.unreadable.length, "file couldn't be read", "files couldn't be read")}</AlertTitle>
            <AlertDescription className="space-y-2">
              <ul className="space-y-1">
                {s.unreadable.map((u) => (
                  <li key={u.file}>
                    <span className="font-names break-all text-foreground">{u.file}</span>: {u.reason}
                  </li>
                ))}
              </ul>
              <p>The rest of your catalog was read normally.</p>
            </AlertDescription>
          </Alert>
        )}

        {careTotal > 0 && (
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group -ml-3" />}>
              <ChevronRight className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
              Details: files that needed care ({careTotal})
            </CollapsibleTrigger>
            <CollapsibleContent className="text-sm">
              <ul className="list-disc space-y-1 pt-2 pl-8">
                {s.care.map((c) => (
                  <li key={c.text}>{c.text}</li>
                ))}
              </ul>
              <p className="pt-2 text-muted-foreground">All read; these just needed extra care. Nothing for you to do.</p>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>The index and the folder you chose are kept on this computer, in:</p>
          <p className="font-names break-all text-foreground">{props.dataDir}</p>
          <p>Nothing else is stored.</p>
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={props.onContinue} className="w-full sm:w-auto">
          {props.continueLabel ?? "Start browsing"}
        </Button>
      </CardFooter>
    </Card>
  )
}

function FamilyList(props: { title: string; families: FamilySummary[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-head text-lg">{props.title}</h2>
      <ul className="space-y-1 text-sm">
        {props.families.map((f) => (
          <li key={f.name} className="flex justify-between gap-4">
            {/* Folder name only, as in Settings: the product names took too much room. */}
            <span className="min-w-0 font-names break-all">{f.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{count(f.apis, "API", "APIs")}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Failed(props: { message: string; onRetry: () => void }) {
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <h1 className="font-head text-2xl">Reading didn't finish</h1>
      </CardHeader>
      <CardContent className="space-y-4 text-base">
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{props.message}</AlertDescription>
        </Alert>
        <p>Nothing was changed: any earlier index is untouched.</p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={props.onRetry} className="w-full sm:w-auto">
          Try again
        </Button>
      </CardFooter>
    </Card>
  )
}
