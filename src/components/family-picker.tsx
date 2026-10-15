// Families grouped by product, with a tick for each group (a dash when only some of it is ticked) and an ▸ to
// open it. Used by Settings' "Families shown" and the API list's family filter, so choosing
// families looks the same everywhere.
import { ChevronRight } from "lucide-react"
import { useId, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { groupFamilies } from "@/lib/families"
import { cn } from "@/lib/utils"

interface Family {
  name: string
  group: string
}

interface PickerProps<F extends Family> {
  /** In display order. */
  families: readonly F[]
  ticked: (name: string) => boolean
  onTick: (names: string[], ticked: boolean) => void
  groupLabel: (group: string, families: F[]) => ReactNode
  /** Shown at the right of a group's line, e.g. a count. */
  groupNote?: (group: string, families: F[]) => ReactNode
  familyNote: (family: F) => ReactNode
  /** Greyed out (and, unless ticked, not tickable): e.g. a filter option that would give nothing. */
  dimmed?: (names: string[]) => boolean
}

export function FamilyPicker<F extends Family>(props: PickerProps<F>) {
  return (
    <ul className="space-y-1">
      {groupFamilies(props.families).map((g) => (
        <GroupRow key={g.group} group={g.group} families={g.families} picker={props} />
      ))}
    </ul>
  )
}

function GroupRow<F extends Family>({ group, families, picker }: { group: string; families: F[]; picker: PickerProps<F> }) {
  const id = useId()
  const names = families.map((f) => f.name)
  const ticked = names.filter((n) => picker.ticked(n)).length
  const dimmed = picker.dimmed?.(names) ?? false
  return (
    <li>
      <Collapsible>
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={ticked === names.length}
            indeterminate={ticked > 0 && ticked < names.length}
            disabled={dimmed && ticked === 0}
            onCheckedChange={(checked) => picker.onTick(names, checked)}
          />
          <Label htmlFor={id} className={cn("flex min-w-0 flex-1 justify-between gap-3 font-normal", dimmed && "text-muted-foreground")}>
            <span>{picker.groupLabel(group, families)}</span>
            {picker.groupNote && <span className="shrink-0 text-muted-foreground tabular-nums">{picker.groupNote(group, families)}</span>}
          </Label>
          <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" className="group" aria-label={`Show the ${group} families`} />}>
            <ChevronRight className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul className="space-y-1 py-1 pl-7">
            {families.map((f) => (
              <FamilyRow key={f.name} family={f} picker={picker} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function FamilyRow<F extends Family>({ family: f, picker }: { family: F; picker: PickerProps<F> }) {
  const id = useId()
  const ticked = picker.ticked(f.name)
  const dimmed = picker.dimmed?.([f.name]) ?? false
  return (
    <li className="flex items-center gap-2">
      <Checkbox id={id} checked={ticked} disabled={dimmed && !ticked} onCheckedChange={(checked) => picker.onTick([f.name], checked)} />
      <Label htmlFor={id} className={cn("flex min-w-0 flex-1 justify-between gap-3 font-normal", dimmed && "text-muted-foreground")}>
        {/* Folder name only, even under "Other products": the product names took too much room. */}
        <span className="min-w-0 font-names break-all">{f.name}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{picker.familyNote(f)}</span>
      </Label>
    </li>
  )
}
