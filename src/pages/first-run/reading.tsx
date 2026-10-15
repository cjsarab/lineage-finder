// Screen 3, "Reading your catalog": progress, time left, Stop.
import { ReadingProgress, StopReadingButton } from "@/components/reading-progress"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import type { RunStatus } from "@/lib/server"

export function Reading(props: { run: RunStatus; onStop: () => void }) {
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <h1 className="font-head text-2xl">Reading your catalog</h1>
        <CardDescription className="font-names break-all">{props.run.catalog}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-base">
        <ReadingProgress run={props.run} />
        <p className="text-sm text-muted-foreground">
          You can close this tab; reading carries on. Reopen the app's address to come back here.
        </p>
      </CardContent>

      <CardFooter className="justify-end">
        <StopReadingButton onStop={props.onStop} />
      </CardFooter>
    </Card>
  )
}
