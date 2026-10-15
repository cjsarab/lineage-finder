// One reading thread. The main thread sends it one spec at a time, as text unpacked from its zip; it sends back only
// the small details it extracted, never the whole parsed spec (keeps memory down: holding them all peaked at ~715 MB).
import { parentPort } from "node:worker_threads"
import { extractDetails, extractParameters, type Details, type MethodParameters } from "./extract.ts"
import { extractFields, type RawFields } from "./lineage.ts"
import { readSpecText, type ReadResult } from "./read-spec.ts"

export interface Job {
  id: number
  text: string
  folderVersion: string | null
}

export interface JobResult {
  id: number
  read: ReadResult["status"]
  problem: string | null
  details: Details | null
  parameters: MethodParameters[]
  /** The fields with their lineage as written; tables are worked out once every spec is read. */
  fields: RawFields | null
}

export function readOne(job: Job): JobResult {
  const r = readSpecText(job.text)
  if (r.status === "unreadable") return { id: job.id, read: r.status, problem: r.reason, details: null, parameters: [], fields: null }
  return { id: job.id, read: r.status, problem: null, details: extractDetails(r.data, job.folderVersion), parameters: extractParameters(r.data),
    fields: extractFields(r.data),
  }
}

parentPort?.on("message", (job: Job) => parentPort?.postMessage(readOne(job)))
