// A list on the compare page that folds when long: a plain heading with its changes counted beside it, then one
// control where the list goes, a dashed "▸ Show 27 rows" while folded and a quiet "▾ Hide 27 rows" once open.
import { ChevronRight } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { count } from "@/lib/first-run-text"

/** A list starts folded when it has more rows than this. */
export const FOLD_OVER = 10

/** A section's (`h2`) or a method's (`h3`) heading, with its changes counted beside it. */
export function CountedHeading(props: { level: "h2" | "h3"; heading: ReactNode; counts: string }) {
  const H = props.level
  const big = H === "h2"
  return (
    <H className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${big ? "font-head text-xl" : ""}`}>
      {props.heading}
      <span className={`font-sans font-normal text-muted-foreground ${big ? "text-base" : "text-sm"}`}>{props.counts}</span>
    </H>
  )
}

export function Fold(props: { level: "h2" | "h3"; heading: ReactNode; counts: string; rows: number; children: ReactNode }) {
  const [open, setOpen] = useState(props.rows <= FOLD_OVER)
  const rows = count(props.rows, "row", "rows")
  const body = (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CountedHeading level={props.level} heading={props.heading} counts={props.counts} />
      <CollapsibleTrigger render={<Button variant={open ? "ghost" : "dashed"} size="sm" className={`group ${open ? "-ml-3" : "w-full max-w-3xl justify-start"}`} />}>
        <ChevronRight className="transition-transform group-data-[panel-open]:rotate-90" />
        {open ? `Hide ${rows}` : `Show ${rows}`}
      </CollapsibleTrigger>
      <CollapsibleContent className={props.level === "h2" ? "space-y-4" : "space-y-1"}>{props.children}</CollapsibleContent>
    </Collapsible>
  )
  return props.level === "h2" ? <section>{body}</section> : body
}
