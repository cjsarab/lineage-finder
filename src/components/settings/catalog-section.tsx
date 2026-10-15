// Settings → Your catalog: re-index, change folder, and where the index is kept / delete it. You keep using the
// current index while a re-index runs. A quiet line when the catalog has changed since it was read.
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { CatalogPicker } from "@/components/catalog-picker"
import { ReadingProgress, StopReadingButton } from "@/components/reading-progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { count } from "@/lib/first-run-text"
import { reindexNow } from "@/lib/catalog-update"
import { deleteIndex, stopReading, type Status } from "@/lib/server"
import { useStatus } from "@/lib/use-status"
import { SectionTitle } from "./settings-panel"

const Stacked = ({ children }: { children: ReactNode }) => <div className="space-y-4">{children}</div>
const ActionRow = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2 pt-4">{children}</div>

export function CatalogSection({ status, onDeleted }: { status: Status; onDeleted: () => void }) {
  const { refresh } = useStatus()
  const [changing, setChanging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (status.index.state !== "ready") {
    return (
      <section className="space-y-2">
        <SectionTitle>Your catalog</SectionTitle>
        <p className="text-muted-foreground">No index yet: choose your catalog on the main screen.</p>
      </section>
    )
  }

  const s = status.index.summary
  const built = new Date(s.builtAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

  async function reindex() {
    setProblem(null)
    const failed = await reindexNow(status)
    if (failed) setProblem(failed.replace(" in Settings", ""))
    else await refresh()
  }

  return (
    <section className="space-y-4">
      <SectionTitle>Your catalog</SectionTitle>
      <div className="space-y-1">
        <p className="font-names break-all">{s.catalog}</p>
        <p className="text-muted-foreground">
          {count(s.apis, "API", "APIs")}, indexed {built}
        </p>
      </div>

      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      {status.run ? (
        <div className="space-y-3">
          <p className="font-medium">Re-indexing</p>
          <ReadingProgress run={status.run} />
          <p className="text-muted-foreground">You can keep using the app: the current index stays until the new one is ready.</p>
          <StopReadingButton
            description="The current index stays as it is."
            onStop={() => {
              void stopReading().then(refresh)
            }}
          />
        </div>
      ) : changing ? (
        <div className="space-y-4">
          <p className="font-medium">Change folder</p>
          <CatalogPicker
            status={status}
            submitLabel="Read this folder"
            Body={Stacked}
            Actions={ActionRow}
            secondary={
              <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                Cancel
              </Button>
            }
            onStarted={() => {
              setChanging(false)
              void refresh()
            }}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* Stays until a re-index, unlike the landing page's notice. An icon and the normal text colour: grey text
              was almost unnoticeable next to the path and the buttons. */}
          {status.catalogCheck.state === "changed" && (
            <p className="flex w-full items-center gap-2">
              <FolderOpen className="size-4 shrink-0" /> Your catalog has changed since it was last read.
            </p>
          )}
          <Button onClick={() => void reindex()}>Re-index now</Button>
          <Button variant="outline" onClick={() => setChanging(true)}>
            Change folder
          </Button>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <p className="text-muted-foreground">The index is kept on this computer, in:</p>
        <p className="font-names break-all">{status.dataDir}</p>
        <DeleteIndexButton
          disabled={status.run != null}
          onDeleted={() => {
            onDeleted()
            void refresh()
          }}
        />
        {status.run && <p className="text-muted-foreground">You can delete it once the re-index has finished or been stopped.</p>}
      </div>
    </section>
  )
}

function DeleteIndexButton(props: { disabled: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" disabled={props.disabled} />}>Delete the index data</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the index data?</AlertDialogTitle>
          <AlertDialogDescription>
            The index and the remembered catalog folder are deleted, and the app goes back to the first-run screen.
            Reading your catalog again takes about 30 seconds. Your catalog itself isn't touched, and nor are your
            light/dark and colour choices.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <Alert variant="destructive">
            <AlertDescription>Couldn't delete it. Is a re-index running?</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setFailed(false)
              deleteIndex()
                .then(() => {
                  setOpen(false)
                  toast.success("Index data deleted", { description: "Choose your catalog to read it again." })
                  props.onDeleted()
                })
                .catch(() => setFailed(true))
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
