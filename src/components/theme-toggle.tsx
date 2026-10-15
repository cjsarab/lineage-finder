import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { chooseTheme, type Theme } from "@/lib/theme"
import { useCurrentTheme } from "@/lib/use-theme"

export function ThemeToggle() {
  const theme = useCurrentTheme()
  const next: Theme = theme === "dark" ? "light" : "dark"
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => chooseTheme(next)}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  )
}
