import { describe, expect, it } from "vitest"
import { parseArgs } from "./cli-args.ts"

describe("parseArgs", () => {
  it("indexes the default catalog with no arguments", () => {
    expect(parseArgs([])).toEqual({ mode: "index", catalog: null, threads: null })
  })

  it("takes another catalog folder", () => {
    expect(parseArgs(["D:\\catalogs\\2026"])).toEqual({ mode: "index", catalog: "D:\\catalogs\\2026", threads: null })
  })

  it("takes a number of threads", () => {
    expect(parseArgs(["--threads", "4"])).toEqual({ mode: "index", catalog: null, threads: 4 })
    expect(parseArgs(["--threads", "0"])).toEqual({ error: "--threads needs a whole number of 1 or more" })
  })

  it("checks the index against the survey", () => {
    expect(parseArgs(["--check"])).toEqual({ mode: "check" })
  })

  it("shows an API by name", () => {
    expect(parseArgs(["--show", "widgets"])).toEqual({ mode: "show", name: "widgets" })
    expect(parseArgs(["--show"])).toEqual({ error: "--show needs an API name, e.g. --show gadget-codes" })
  })

  it("rejects anything it doesn't know", () => {
    expect(parseArgs(["--frobnicate"])).toEqual({ error: "Unknown option: --frobnicate" })
  })
})
