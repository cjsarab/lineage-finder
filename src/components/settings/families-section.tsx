// Settings → Families shown: hide whole products or single families, grouped by product. Saved in this browser.
import { useEffect, useRef, useState } from "react"
import { FamilyPicker } from "@/components/family-picker"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { count } from "@/lib/first-run-text"
import { setHiddenFamilies, useHiddenFamilies } from "@/lib/families"
import type { Status } from "@/lib/server"
import { SectionTitle, useSettingsOpen } from "./settings-panel"

export function FamiliesSection({ status }: { status: Status }) {
  const hidden = useHiddenFamilies()
  const { section } = useSettingsOpen()
  const [choosing, setChoosing] = useState(section === "families")
  const sectionRef = useRef<HTMLElement>(null)

  // Opened from "N families hidden in Settings" (the API list): go straight to the list of families.
  useEffect(() => {
    if (section !== "families") return
    setChoosing(true)
    sectionRef.current?.scrollIntoView?.({ block: "start" })
  }, [section])

  if (status.index.state !== "ready") {
    return (
      <section className="space-y-2">
        <SectionTitle>Families shown</SectionTitle>
        <p className="text-muted-foreground">No index yet: choose your catalog on the main screen.</p>
      </section>
    )
  }

  const families = status.index.summary.families
  const shown = families.filter((f) => !hidden.includes(f.name)).length

  // Keeps any hidden names not in this index (e.g. a family a newer download dropped) as they were.
  const setShown = (names: string[], show: boolean) => {
    const next = new Set(hidden)
    for (const name of names) {
      if (show) next.delete(name)
      else next.add(name)
    }
    setHiddenFamilies(next)
  }

  return (
    <section ref={sectionRef} className="space-y-3">
      <SectionTitle>Families shown</SectionTitle>
      <Collapsible open={choosing} onOpenChange={setChoosing} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p>
            {shown} of {families.length} shown
          </p>
          <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>{choosing ? "Done" : "Choose…"}</CollapsibleTrigger>
        </div>
        {/* The panel hides anything outside it; the margin and padding leave room for the buttons' hover lift and shadow. */}
        <CollapsibleContent className="-m-1 space-y-3 p-1">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setHiddenFamilies([])}>
              Show all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHiddenFamilies(families.filter((f) => f.group !== "Banner").map((f) => f.name))}
            >
              Banner only
            </Button>
          </div>
          <FamilyPicker
            families={families}
            ticked={(name) => !hidden.includes(name)}
            onTick={setShown}
            groupLabel={(group, fs) => `${group} (${count(fs.length, "family", "families")})`}
            familyNote={(f) => count(f.apis, "API", "APIs")}
          />
          {shown === 0 && <p className="text-muted-foreground">Every family is hidden: the app will have nothing to show.</p>}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
