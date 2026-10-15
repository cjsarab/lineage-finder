// Progress of a reading, and its Stop button. Used by the first-run screen
// and by Settings while re-indexing.
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { timeLeft } from "@/lib/first-run-text"
import type { RunStatus } from "@/lib/server"

const n = (x: number) => x.toLocaleString("en-GB")

/** Whole-number percentage read, for the header's "Re-indexing 49%". */
export const percentRead = (run: RunStatus) =>
  run.stage === "writing" || run.stage === "comparing" ? 100 : run.total ? Math.floor((100 * run.done) / run.total) : 0

export function ReadingProgress({ run }: { run: RunStatus }) {
  const left = run.stage === "reading" ? timeLeft(run.done, run.total, run.readingSeconds) : null
  if (run.stage === "finding") {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Opening the zips…
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-between gap-x-4">
        <span>
          {run.stage === "reading"
            ? "Reading spec files"
            : // A re-index compares with the last read before writing.
              run.stage === "comparing"
              ? "Comparing with your last read…"
              : "Writing the index…"}
        </span>
        <span className="tabular-nums">
          {n(run.done)} of {n(run.total)}
        </span>
      </div>
      <Progress value={run.total ? (100 * run.done) / run.total : 0} aria-label="Spec files read" />
      <p className="min-h-6 text-sm text-muted-foreground">{left ?? ""}</p>
    </div>
  )
}

/** "Stop", with a "Stop reading?" check first. */
export function StopReadingButton(props: { onStop: () => void; description?: string }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogTrigger render={<Button variant="outline" className="w-full sm:w-auto" />}>Stop</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop reading?</AlertDialogTitle>
          <AlertDialogDescription>{props.description ?? "Nothing is lost; you can start again."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep reading</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirming(false)
              props.onStop()
            }}
          >
            Stop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
