import type { ReactNode } from "react"

/** A plain boxed message with an optional action, e.g. "No APIs match these filters." [Clear filters]. */
export function Notice(props: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-4 border-2 border-border bg-card p-6 shadow-md">
      <p className="font-head text-lg break-all">{props.title}</p>
      {props.children}
    </div>
  )
}
