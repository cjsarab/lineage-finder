// A value you copy by clicking it, e.g. a media type to paste into an Accept header. Says so in a toast either way.
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function CopyText({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Copied", { description: value })
    } catch {
      toast.error("Couldn't copy", { description: "Select the text and press Ctrl+C instead." })
    }
  }
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={copy}
      title="Copy"
      aria-label={`Copy ${value}`}
      className="-mx-2 h-auto justify-start gap-1.5 text-left font-names text-base font-normal break-all whitespace-normal"
    >
      <span>{value}</span>
      <Copy className="size-4 opacity-60 group-hover/button:opacity-100" />
    </Button>
  )
}
