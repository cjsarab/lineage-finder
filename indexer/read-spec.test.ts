import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { readSpecText } from "./read-spec.ts"

const spec = (relPath: string) =>
  fs.readFileSync(path.join(import.meta.dirname, "test-catalog", "BannerWidgetAPIs", relPath), "utf8")

describe("readSpecText", () => {
  it("reads a normal spec with the main reader", () => {
    const r = readSpecText(spec("widgets-1.2.0/widgets.yaml"))
    expect(r.status).toBe("ok")
    expect(r.status !== "unreadable" && r.data.info).toMatchObject({ title: "widgets", version: "1.2.0" })
  })

  it("reads a repeated key with the later value winning", () => {
    const r = readSpecText(spec("ratchets-1.0.0/ratchets.yaml"))
    expect(r.status).toBe("repeated-key")
    expect(r.status !== "unreadable" && r.data.info).toMatchObject({ description: "Second description, which wins." })
  })

  it("falls back to the second reader for the \\ line break the main reader refuses", () => {
    const r = readSpecText(spec("pulleys-1.0.0/pulleys.yaml"))
    expect(r.status).toBe("second-reader")
    expect(r.status !== "unreadable" && r.data.info).toMatchObject({ title: "pulleys" })
  })

  it("keeps dates as written when the second reader is used", () => {
    const r = readSpecText(spec("pulleys-1.0.0/pulleys.yaml"))
    expect(r.status !== "unreadable" && r.data.info).toMatchObject({ "x-deprecated-on": "2019-06-30" })
  })

  it("reports an empty file as unreadable", () => {
    expect(readSpecText("")).toEqual({ status: "unreadable", reason: "empty file" })
    expect(readSpecText("  \n")).toEqual({ status: "unreadable", reason: "empty file" })
  })

  it("reports a file neither reader accepts as unreadable, with the reason", () => {
    const r = readSpecText(spec("broken-1.0.0/broken.yaml"))
    expect(r.status).toBe("unreadable")
    expect(r.status === "unreadable" && r.reason).toMatch(/\S/)
  })

  it("reports YAML that isn't a spec (not a mapping) as unreadable", () => {
    expect(readSpecText("just a sentence")).toEqual({ status: "unreadable", reason: "not a spec (no top-level fields)" })
    expect(readSpecText("- a\n- list")).toEqual({ status: "unreadable", reason: "not a spec (no top-level fields)" })
  })
})
