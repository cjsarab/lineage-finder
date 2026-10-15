// The API list's filters: family (grouped by product, as in Settings), domain, status and
// lineage.
// Each option shows how many APIs ticking it would give with the other filters as they are.
import { useId, type ReactNode } from "react"
import { FamilyPicker } from "@/components/family-picker"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LINEAGE_OPTIONS, STATUS_OPTIONS, type Filters, type optionCounts } from "@/lib/api-list"
import { n } from "@/lib/first-run-text"
import type { FamilySummary } from "@/lib/server"
import { cn } from "@/lib/utils"

type Counts = ReturnType<typeof optionCounts>

export function FilterGroups(props: {
  filters: Filters
  families: readonly FamilySummary[]
  domains: readonly string[]
  counts: Counts
  onChange: (change: Partial<Filters>) => void
}) {
  const { filters, counts } = props
  const familyCount = (names: string[]) => names.reduce((sum, name) => sum + (counts.family.get(name) ?? 0), 0)

  return (
    <div className="space-y-6 text-sm">
      <FilterSection title="Family">
        <FamilyPicker
          families={props.families}
          ticked={(name) => filters.families.includes(name)}
          onTick={(names, ticked) => props.onChange({ families: toggle(filters.families, names, ticked) })}
          groupLabel={(group) => group}
          groupNote={(_, fs) => n(familyCount(fs.map((f) => f.name)))}
          familyNote={(f) => n(counts.family.get(f.name) ?? 0)}
          dimmed={(names) => familyCount(names) === 0}
        />
      </FilterSection>
      <FilterSection title="Domain">
        <Options
          options={props.domains.map((d) => ({ value: d, label: d }))}
          selected={filters.domains}
          counts={counts.domain}
          onChange={(domains) => props.onChange({ domains })}
        />
      </FilterSection>
      <FilterSection title="Status">
        <Options
          options={STATUS_OPTIONS.filter((o) => o.value !== "not-stated" || (counts.status.get(o.value) ?? 0) > 0 || filters.statuses.includes(o.value))}
          selected={filters.statuses}
          counts={counts.status}
          onChange={(statuses) => props.onChange({ statuses })}
        />
      </FilterSection>
      <FilterSection title="Lineage">
        <Options options={[...LINEAGE_OPTIONS]} selected={filters.lineage} counts={counts.lineage} onChange={(lineage) => props.onChange({ lineage })} />
      </FilterSection>
    </div>
  )
}

/** "Filter by API name": narrows as you type, matching as search does (src/lib/search.ts). */
export function NameBox(props: { value: string; onChange: (name: string) => void; className?: string }) {
  return (
    <Input
      type="search"
      aria-label="Filter by API name"
      placeholder="Filter by API name…"
      className={cn("font-names", props.className)}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

function FilterSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-head text-sm tracking-wide uppercase">{props.title}</h2>
      {props.children}
    </section>
  )
}

function Options(props: {
  options: readonly { value: string; label: string }[]
  selected: readonly string[]
  counts: Map<string, number>
  onChange: (selected: string[]) => void
}) {
  const ids = useId()
  return (
    <ul className="space-y-1">
      {props.options.map((o, i) => {
        const id = `${ids}-${i}`
        const ticked = props.selected.includes(o.value)
        const count = props.counts.get(o.value) ?? 0
        return (
          <li key={o.value} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={ticked}
              disabled={count === 0 && !ticked}
              onCheckedChange={(checked) => props.onChange(toggle(props.selected, [o.value], checked))}
            />
            <Label htmlFor={id} className={cn("flex min-w-0 flex-1 justify-between gap-3 font-normal", count === 0 && "text-muted-foreground")}>
              <span>{o.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{n(count)}</span>
            </Label>
          </li>
        )
      })}
    </ul>
  )
}

function toggle(list: readonly string[], values: string[], on: boolean): string[] {
  const set = new Set(list)
  for (const v of values) {
    if (on) set.add(v)
    else set.delete(v)
  }
  return [...set]
}
