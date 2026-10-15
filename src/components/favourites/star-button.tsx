// The Favourites star: icon only, a grey
// outline until chosen, then solid amber (with a black edge in light mode).
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { setFavourite, useIsFavourite, type Favourite } from "@/lib/favourites"

/** The star drawn on its own (the header's button and the panel's empty message use it too). */
export function FavouriteStar({ on, className }: { on: boolean; className?: string }) {
  return <Star aria-hidden className={cn("size-4 shrink-0", on ? "fill-favourite text-favourite-edge" : "text-muted-foreground", className)} />
}

/** A star that saves or removes `favourite`. `what` names it for screen readers, e.g. "SWBWIDG_CODE". */
export function StarButton({ favourite, what, className }: { favourite: Favourite; what?: string; className?: string }) {
  const on = useIsFavourite(favourite)
  return <StarToggle on={on} onToggle={() => setFavourite(favourite, !on)} what={what} className={className} />
}

/** The star as a button, for a state kept elsewhere (the panel keeps removed rows until it closes). */
export function StarToggle(props: { on: boolean; onToggle: () => void; what?: string; className?: string }) {
  const { on, onToggle, what, className } = props
  const title = on ? "Remove from Favourites" : "Add to Favourites"
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={what ? `${title}: ${what}` : title}
      title={title}
      onClick={onToggle}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <FavouriteStar on={on} />
    </button>
  )
}
