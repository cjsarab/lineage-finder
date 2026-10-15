// The Settings panel: Look, Families shown, Your catalog, About.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useStatus } from "@/lib/use-status"
import { AboutSection } from "./about-section"
import { CatalogSection } from "./catalog-section"
import { FamiliesSection } from "./families-section"
import { LookSection } from "./look-section"

/** A part of Settings to open at, e.g. "families": Families shown, with its list open. */
export type SettingsSection = "families"

const OpenContext = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  /** The section asked for when Settings was opened, if any. */
  section: SettingsSection | null
  openAt: (section: SettingsSection) => void
} | null>(null)

/** Whether Settings is open. Shared, so the header's "Re-indexing 49%" button can open it too. */
export function SettingsOpenProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const [section, setSection] = useState<SettingsSection | null>(null)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    setSection(null)
  }, [])
  const openAt = useCallback((next: SettingsSection) => {
    setOpenState(true)
    setSection(next)
  }, [])
  return <OpenContext value={{ open, setOpen, section, openAt }}>{children}</OpenContext>
}

export function useSettingsOpen() {
  const value = useContext(OpenContext)
  if (!value) throw new Error("useSettingsOpen needs a SettingsOpenProvider around it")
  return value
}

export function SettingsPanel() {
  const { open, setOpen } = useSettingsOpen()
  const { status } = useStatus()
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* A quarter wider than the toolkit's default, so long family names fit. */}
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-[30rem]">
        <SheetHeader>
          <SheetTitle className="text-xl">Settings</SheetTitle>
          <SheetDescription className="sr-only">The look of the app, which families it shows, and your catalog.</SheetDescription>
        </SheetHeader>
        {status && (
          <div className="space-y-6 px-4 pb-8 text-sm">
            <LookSection />
            <Separator />
            <FamiliesSection status={status} />
            <Separator />
            <CatalogSection status={status} onDeleted={() => setOpen(false)} />
            <Separator />
            <AboutSection status={status} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-head text-base tracking-wide uppercase">{children}</h2>
}
