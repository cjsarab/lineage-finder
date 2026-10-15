// Reads one spec file's text. Every spec in the catalog can be read, but only with care:
// 1 has a repeated key (later value wins) and 18 need a second reader for a "\" line break inside a $ref.
import YAML from "yaml"
import jsYaml from "js-yaml"

export type Spec = Record<string, unknown>

export type ReadResult =
  | { status: "ok" | "repeated-key" | "second-reader"; data: Spec }
  | { status: "unreadable"; reason: string }

const notASpec = { status: "unreadable", reason: "not a spec (no top-level fields)" } as const

const isMapping = (v: unknown): v is Spec => v != null && typeof v === "object" && !Array.isArray(v)

const firstLine = (message: string) => message.split("\n")[0]

export function readSpecText(text: string): ReadResult {
  if (text.trim() === "") return { status: "unreadable", reason: "empty file" }

  const options = { uniqueKeys: true, maxAliasCount: -1 }
  let doc = YAML.parseDocument(text, options)
  let status: "ok" | "repeated-key" = "ok"

  if (doc.errors.length && doc.errors.every((e) => e.code === "DUPLICATE_KEY")) {
    doc = YAML.parseDocument(text, { ...options, uniqueKeys: false })
    status = "repeated-key"
  }

  if (doc.errors.length) {
    // js-yaml 4 (pinned: version 5 refuses the same files). CORE_SCHEMA keeps dates as written, like `yaml`.
    try {
      const data = jsYaml.load(text, { schema: jsYaml.CORE_SCHEMA })
      return isMapping(data) ? { status: "second-reader", data } : notASpec
    } catch (e) {
      return { status: "unreadable", reason: firstLine(doc.errors[0].message) + " / " + firstLine(String((e as Error).message)) }
    }
  }

  const data = doc.toJS({ maxAliasCount: -1 })
  return isMapping(data) ? { status, data } : notASpec
}
