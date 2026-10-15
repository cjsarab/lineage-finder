// "Where's your catalog?": the app's catalog-zips folder or a pasted path, checked before reading. Used by the
// first-run screen and by Settings' "Change folder".
import { CircleCheck, FolderOpen } from "lucide-react"
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { describeCheck } from "@/lib/first-run-text"
import { checkFolder, startReading, type FolderCheck, type Status } from "@/lib/server"

type Choice = "default" | "elsewhere"

const Plain = ({ children }: { children: ReactNode }) => <>{children}</>

export function CatalogPicker(props: {
  status: Status
  submitLabel: string
  onStarted: () => void
  /** Wrappers, so the first-run card can put the choices in its body and the button in its footer. */
  Body?: (p: { children: ReactNode }) => ReactNode
  Actions?: (p: { children: ReactNode }) => ReactNode
  /** Shown above the choices, e.g. "Reading stopped". */
  notice?: ReactNode
  /** Shown beside the submit button, e.g. Settings' "Cancel". */
  secondary?: ReactNode
}) {
  const { Body = Plain, Actions = Plain } = props
  const ids = useId()
  const { chosen, default: defaultPath } = props.status.catalog
  const [choice, setChoice] = useState<Choice>(chosen ? "elsewhere" : "default")
  const [typed, setTyped] = useState(chosen ?? "")
  const [defaultCheck, setDefaultCheck] = useState<FolderCheck | null>(null)
  const [typedCheck, setTypedCheck] = useState<FolderCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [unreachable, setUnreachable] = useState(false)

  const checkDefault = useCallback(async () => {
    setDefaultCheck(null)
    const check = await checkFolder(defaultPath)
    setDefaultCheck(check)
    return check
  }, [defaultPath])

  // Look in the default folder straight away. If there's no catalog there, offer "Somewhere else" instead.
  useEffect(() => {
    checkDefault()
      .then((check) => {
        if (check.kind !== "ok" && !chosen) setChoice("elsewhere")
      })
      .catch(() => setUnreachable(true))
  }, [checkDefault, chosen])

  async function read(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    try {
      const check = choice === "default" ? await checkDefault() : await checkFolder(typed)
      if (choice === "elsewhere") setTypedCheck(check)
      if (check.kind === "ok") {
        await startReading(check.path)
        props.onStarted()
      }
    } catch {
      setUnreachable(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={read} className="contents">
      <Body>
        {props.notice}
        {unreachable && (
          <Alert variant="destructive">
            <AlertDescription>Can't reach the app. Is it still running in the terminal?</AlertDescription>
          </Alert>
        )}

        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="gap-6">
          <div className="flex gap-3">
            <RadioGroupItem value="default" id={`${ids}-default`} className="mt-0.5" />
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={`${ids}-default`}>In the app's catalog-zips folder</Label>
              <p className="font-names text-sm break-all">{defaultPath}</p>
              {defaultCheck === null ? (
                <p className="flex items-center gap-2 text-sm">
                  <Spinner /> Looking…
                </p>
              ) : (
                <FolderResult check={defaultCheck} isDefault>
                  {defaultCheck.kind !== "ok" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setChoice("default")
                        void checkDefault().catch(() => setUnreachable(true))
                      }}
                    >
                      Check again
                    </Button>
                  )}
                </FolderResult>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <RadioGroupItem value="elsewhere" id={`${ids}-elsewhere`} className="mt-0.5" />
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={`${ids}-elsewhere`}>Somewhere else on this computer</Label>
              <Field>
                <Input
                  aria-label="Catalog folder"
                  placeholder="Paste the folder's path here"
                  className="font-names"
                  value={typed}
                  onFocus={() => setChoice("elsewhere")}
                  onChange={(e) => {
                    setChoice("elsewhere")
                    setTyped(e.target.value)
                    setTypedCheck(null)
                  }}
                />
                <FieldDescription>Tip: in File Explorer, right-click the folder and choose "Copy as path".</FieldDescription>
              </Field>
              {typedCheck && choice === "elsewhere" && <FolderResult check={typedCheck} />}
            </div>
          </div>
        </RadioGroup>
      </Body>

      <Actions>
        <Button type="submit" disabled={busy || (choice === "elsewhere" && !typed.trim())} className="w-full sm:w-auto">
          {busy && <Spinner />} {props.submitLabel}
        </Button>
        {props.secondary}
      </Actions>
    </form>
  )
}

/** What the check found: a tick, or what to do about it. */
function FolderResult(props: { check: FolderCheck; isDefault?: boolean; children?: ReactNode }) {
  const message = describeCheck(props.check, props.isDefault)
  if (message.ok) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CircleCheck className="size-4" /> {message.text}
      </p>
    )
  }
  return (
    <Alert>
      <FolderOpen />
      <AlertDescription className="space-y-2">
        <p>{message.text}</p>
        {props.children && <div className="flex flex-wrap gap-2">{props.children}</div>}
      </AlertDescription>
    </Alert>
  )
}
