// The Favourites panel: saved APIs (by version), tables, columns and forms,
// A–Z by kind, then
// the last 10 viewed. Built like Settings (src/components/settings/settings-panel.tsx). Clicking a row's ★ removes
// it, but the row stays (☆) until the panel closes, so a second click puts it back. The rows are shared with the
// landing page (favourite-rows.tsx), which opens the panel through `useFavouritesOpen`.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { SectionTitle } from "@/components/settings/settings-panel"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { useHiddenFamilies } from "@/lib/families"
import { clearRecent, favouriteKey, setFavourite, shownRecent, sortFavourites, useFavourites, useRecent, type Favourite } from "@/lib/favourites"
import { useApis } from "@/lib/use-apis"
import { useForms, useTables } from "@/lib/use-tables"
import { FavouriteRow, RecentRow } from "./favourite-rows"
import { FavouriteStar } from "./star-button"

const OpenContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null)

/** Whether the panel is open. Shared, so the landing page's "and 3 more in Favourites" can open it too. */
export function FavouritesOpenProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <OpenContext value={{ open, setOpen }}>{children}</OpenContext>
}

export function useFavouritesOpen() {
  const value = useContext(OpenContext)
  if (!value) throw new Error("useFavouritesOpen needs a FavouritesOpenProvider around it")
  return value
}

export function FavouritesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // A fresh start each time it opens, so rows removed last time are gone.
  const [opening, setOpening] = useState(0)
  useEffect(() => {
    if (open) setOpening((n) => n + 1)
  }, [open])
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-[30rem]">
        <SheetHeader>
          <SheetTitle className="text-xl">Favourites</SheetTitle>
          <SheetDescription className="sr-only">The APIs, tables, columns and forms you've starred, and what you looked at recently.</SheetDescription>
        </SheetHeader>
        <PanelBody key={opening} close={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function PanelBody({ close }: { close: () => void }) {
  const { apis, error: apisError } = useApis()
  const { tables, error: tablesError } = useTables()
  const { forms, error: formsError } = useForms()
  const hidden = useHiddenFamilies()
  const saved = useFavourites()
  const recent = useRecent()
  // Removed while the panel is open: still listed, with an empty star.
  const [removed, setRemoved] = useState<Favourite[]>([])

  if (apisError || tablesError || formsError) {
    return <p className="px-4 text-sm">Couldn't load your catalog's index. Is the app still running in the terminal?</p>
  }
  if (!apis || !tables || !forms) {
    return (
      <p className="flex items-center gap-2 px-4 text-sm">
        <Spinner /> Loading…
      </p>
    )
  }

  const savedKeys = new Set(saved.map(favouriteKey))
  const rows = sortFavourites([...saved, ...removed.filter((f) => !savedKeys.has(favouriteKey(f)))])
  const toggle = (f: Favourite) => {
    if (savedKeys.has(favouriteKey(f))) {
      setFavourite(f, false)
      setRemoved((r) => [...r, f])
    } else setFavourite(f, true)
  }
  const removeForGood = (f: Favourite) => {
    setFavourite(f, false)
    setRemoved((r) => r.filter((x) => favouriteKey(x) !== favouriteKey(f)))
  }
  const row = (f: Favourite) => (
    <FavouriteRow
      key={favouriteKey(f)}
      f={f}
      lists={{ apis, tables, forms }}
      hidden={hidden}
      close={close}
      editing={{ on: savedKeys.has(favouriteKey(f)), onToggle: () => toggle(f), onRemove: () => removeForGood(f) }}
    />
  )
  const groups = [
    { title: "APIs", items: rows.filter((f) => f.kind === "api") },
    { title: "Tables", items: rows.filter((f) => f.kind === "table") },
    { title: "Columns", items: rows.filter((f) => f.kind === "column") },
    { title: "Forms", items: rows.filter((f) => f.kind === "form") },
  ].filter((g) => g.items.length > 0)
  const recentRows = shownRecent(recent, apis, tables, hidden, forms)

  return (
    <div className="space-y-6 px-4 pb-8 text-sm">
      {groups.length === 0 ? (
        <p>
          Nothing here yet. Use <FavouriteStar on={false} className="inline align-text-bottom" /> on an API, table, column or form page.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="space-y-2">
            <SectionTitle>{g.title}</SectionTitle>
            <ul className="space-y-2">{g.items.map(row)}</ul>
          </section>
        ))
      )}
      <Separator />
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Recently viewed</SectionTitle>
          {recent.length > 0 && (
            <Button variant="outline" size="xs" onClick={clearRecent}>
              Clear
            </Button>
          )}
        </div>
        {recentRows.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentRows.map(({ item, path }) => (
              <RecentRow key={path} item={item} path={path} close={close} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
