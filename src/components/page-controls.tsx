// The compact page controls shown above a long list: ‹ 2 of 37 › and
// "Show [20] per page". Used by the API list and, for very long parameter lists, the API page.
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { PaginationLink } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { n } from "@/lib/first-run-text"
import { PAGE_SIZES, type PageSize } from "@/lib/page-size"

/** The compact page control at the top: ‹ 2 of 37 ›. */
export function PageStepper(props: { page: number; pages: number; hrefFor: (page: number) => string; onGo: (page: number) => void }) {
  const { page, pages } = props
  const step = (p: number, label: string, icon: ReactNode) =>
    p >= 1 && p <= pages ? (
      <PaginationLink size="icon-sm" href={props.hrefFor(p)} aria-label={label} onClick={(e) => {
          e.preventDefault()
          props.onGo(p)
        }}>
        {icon}
      </PaginationLink>
    ) : (
      <PaginationLink size="icon-sm" aria-label={label} aria-disabled className="pointer-events-none opacity-50">
        {icon}
      </PaginationLink>
    )
  return (
    <nav aria-label="Turn the page" className="flex items-center gap-1">
      {step(page - 1, "Previous page", <ChevronLeft />)}
      <span className="px-1 tabular-nums">
        {page} of {n(pages)}
      </span>
      {step(page + 1, "Next page", <ChevronRight />)}
    </nav>
  )
}

/** "Show [20] per page" (20, 50 or 100, remembered in this browser). */
export function PageSizePicker(props: { size: PageSize; onChange: (size: PageSize) => void; things: string }) {
  const items = PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))
  return (
    <span className="flex items-center gap-2">
      Show
      <Select value={String(props.size)} items={items} onValueChange={(v) => props.onChange(Number(v) as PageSize)}>
        <SelectTrigger size="sm" aria-label={`${props.things} per page`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      per page
    </span>
  )
}
