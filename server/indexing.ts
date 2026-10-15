// Runs the indexer inside the app and keeps track of it, so the page can show progress.
// One reading at a time. It belongs to the server, not the page: closing the browser tab doesn't stop it.
import { runIndex as realRunIndex, type IndexInfo, type RunOptions } from "../indexer/run-index.ts"
import type { RunStatus } from "./api-types.ts"

export type Outcome = { outcome: "done"; info: IndexInfo } | { outcome: "stopped" } | { outcome: "failed"; message: string }

export interface Indexing {
  /** The reading in progress, or null. */
  current(): RunStatus | null
  /** How the most recent reading ended, or null if none has finished since the app started. */
  last(): Outcome | null
  /** Starts reading `catalog`. False if a reading is already running. */
  start(catalog: string): boolean
  stop(): void
}

interface Running {
  status: RunStatus
  readingStarted: number | null
  controller: AbortController
}

export function createIndexing(options: {
  dataDir: string
  runIndex?: (options: RunOptions) => Promise<IndexInfo>
  onDone?: (info: IndexInfo, catalog: string) => void
}): Indexing {
  const runIndex = options.runIndex ?? realRunIndex
  let run: Running | null = null
  let last: Outcome | null = null

  return {
    current() {
      if (!run) return null
      const seconds = run.readingStarted == null ? 0 : (performance.now() - run.readingStarted) / 1000
      return { ...run.status, readingSeconds: seconds }
    },
    last: () => last,
    start(catalog) {
      if (run) return false
      const mine: Running = (run = {
        status: { catalog, stage: "finding", done: 0, total: 0, readingSeconds: 0 },
        readingStarted: null,
        controller: new AbortController(),
      })
      last = null
      runIndex({
        catalog,
        dataDir: options.dataDir,
        signal: mine.controller.signal,
        onStage: (stage) => {
          mine.status.stage = stage
          if (stage === "reading") mine.readingStarted = performance.now()
        },
        onProgress: (done, total) => {
          mine.status.done = done
          mine.status.total = total
        },
      })
        .then((info) => {
          last = { outcome: "done", info }
          options.onDone?.(info, catalog)
        })
        .catch((e: Error) => {
          last = mine.controller.signal.aborted ? { outcome: "stopped" } : { outcome: "failed", message: e.message }
        })
        .finally(() => {
          if (run === mine) run = null
        })
      return true
    },
    stop() {
      run?.controller.abort()
    },
  }
}
