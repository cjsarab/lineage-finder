// Options for `npm run index` (see cli.ts).
export type Args =
  | { mode: "index"; catalog: string | null; threads: number | null }
  | { mode: "check" }
  | { mode: "show"; name: string }
  | { error: string }

export function parseArgs(argv: string[]): Args {
  let catalog: string | null = null
  let threads: number | null = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--check") return { mode: "check" }
    if (a === "--show") {
      const name = argv[i + 1]
      return name ? { mode: "show", name } : { error: "--show needs an API name, e.g. --show gadget-codes" }
    }
    if (a === "--threads") {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1) return { error: "--threads needs a whole number of 1 or more" }
      threads = n
    } else if (a.startsWith("--")) return { error: `Unknown option: ${a}` }
    else catalog = a
  }
  return { mode: "index", catalog, threads }
}
