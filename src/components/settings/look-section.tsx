// Settings → Look: light/dark and the accent colour, saved in this browser.
import { useId } from "react"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ACCENTS, chooseAccent, useAccent, type AccentId } from "@/lib/accents"
import { chooseTheme, useThemeChoice, type ThemeChoice } from "@/lib/theme"
import { SectionTitle } from "./settings-panel"

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Same as my computer" },
]

export function LookSection() {
  const ids = useId()
  const theme = useThemeChoice()
  const accent = useAccent()

  return (
    <section className="space-y-4">
      <SectionTitle>Look</SectionTitle>

      <div className="space-y-2">
        <Label id={`${ids}-theme`}>Light or dark</Label>
        <RadioGroup
          aria-labelledby={`${ids}-theme`}
          value={theme}
          onValueChange={(v) => chooseTheme(v as ThemeChoice)}
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          {THEMES.map((t) => (
            <div key={t.value} className="flex items-center gap-2">
              <RadioGroupItem value={t.value} id={`${ids}-theme-${t.value}`} />
              <Label htmlFor={`${ids}-theme-${t.value}`} className="font-normal">
                {t.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label id={`${ids}-accent`}>Accent colour</Label>
        <RadioGroup
          aria-labelledby={`${ids}-accent`}
          value={accent}
          onValueChange={(v) => chooseAccent(v as AccentId)}
          className="grid grid-cols-2 gap-2"
        >
          {ACCENTS.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <RadioGroupItem value={a.id} id={`${ids}-accent-${a.id}`} />
              <span className="size-4 shrink-0 border-2 border-black" style={{ backgroundColor: a.hex }} />
              <Label htmlFor={`${ids}-accent-${a.id}`} className="font-normal">
                {a.name}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <p className="text-muted-foreground">Saved in this browser.</p>
    </section>
  )
}
