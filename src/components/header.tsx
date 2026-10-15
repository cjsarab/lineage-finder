import { Settings } from "lucide-react"
import { Link, NavLink } from "react-router"
import { FavouritesPanel, useFavouritesOpen } from "@/components/favourites/favourites-panel"
import { FavouriteStar } from "@/components/favourites/star-button"
import { percentRead } from "@/components/reading-progress"
import { SettingsPanel, useSettingsOpen } from "@/components/settings/settings-panel"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useStatus } from "@/lib/use-status"

export function Header() {
  const { open, setOpen } = useSettingsOpen()
  const { status } = useStatus()
  // Shared with the landing page, whose "and 3 more in Favourites" opens it too.
  const { open: favouritesOpen, setOpen: setFavouritesOpen } = useFavouritesOpen()
  // A re-index (there's an index already) with Settings closed: show how far it's got, and reopen Settings.
  const reindexing = status?.run && status.index.state === "ready" && !open ? status.run : null

  return (
    <header className="border-b-2 border-border bg-card">
      {/* Below 768 px the links have a row of their own, under the name and the buttons; one row from 768 px. Below
          768 the name-and-links box steps aside (`contents`), so
          the three can be ordered: name, buttons, then links. If a row is ever too full (e.g. "Re-indexing 49%" at
          800 px), the buttons wrap under it rather than run into the links. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="contents md:flex md:min-w-0 md:items-baseline md:gap-6">
          {/* The name alone, no logo. One line from 640 px wide; on a phone it may wrap. */}
          <Link
            to="/"
            className="order-1 min-w-0 flex-1 font-head text-lg leading-tight tracking-tight sm:text-xl sm:whitespace-nowrap md:flex-none lg:text-2xl"
          >
            Lineage Finder
          </Link>
          {/* Plain links, no sidebar; Search beside them. */}
          <nav aria-label="Pages" className="order-3 flex basis-full gap-4 font-head md:basis-auto">
            <NavLink to="/apis" className={({ isActive }) => (isActive ? "underline decoration-2 underline-offset-4" : "hover:underline")}>
              APIs
            </NavLink>
            <NavLink to="/tables" className={({ isActive }) => (isActive ? "underline decoration-2 underline-offset-4" : "hover:underline")}>
              Tables
            </NavLink>
            {/* After Tables. */}
            <NavLink to="/forms" className={({ isActive }) => (isActive ? "underline decoration-2 underline-offset-4" : "hover:underline")}>
              Forms
            </NavLink>
            <NavLink to="/search" className={({ isActive }) => (isActive ? "underline decoration-2 underline-offset-4" : "hover:underline")}>
              Search
            </NavLink>
          </nav>
        </div>
        <div className="order-2 ml-auto flex shrink-0 items-center gap-2">
          {reindexing && (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Spinner /> Re-indexing {percentRead(reindexing)}%
            </Button>
          )}
          <Button variant="outline" size="icon" aria-label="Favourites" title="Favourites" onClick={() => setFavouritesOpen(true)}>
            {/* Black like the other icons here; grey elsewhere. */}
            <FavouriteStar on={false} className="text-foreground" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Settings" title="Settings" onClick={() => setOpen(true)}>
            <Settings />
          </Button>
          <ThemeToggle />
        </div>
      </div>
      <SettingsPanel />
      <FavouritesPanel open={favouritesOpen} onOpenChange={setFavouritesOpen} />
    </header>
  )
}
