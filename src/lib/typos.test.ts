// Probable typos: marked, never corrected.
import { describe, expect, it } from "vitest"
import { TYPOS, typoNote, typosIn } from "@/lib/typos"

describe("typosIn", () => {
  it("finds the listed names anywhere in a value, whatever the case, each once", () => {
    expect(typosIn("SMARPLE_DESC").map((t) => t.probably)).toEqual(["SMAPRLE"])
    expect(typosIn("smarple or SMARPLE").map((t) => t.name)).toEqual(["SMARPLE"])
    expect(typosIn("GTVFLST_CODE(GTVFLST)").map((t) => t.probably)).toEqual(["GTVLFST"])
    expect(typosIn("SMRPRLE_PROGRAM_DESC")).toEqual([])
  })

  it("finds a name with a separator in it as written, and not its parts alone", () => {
    expect(typosIn("V,TIMEZONE_NAMES").map((t) => t.probably)).toEqual(["V$TIMEZONE_NAMES"])
    expect(typosIn("TIMEZONE_NAMES")).toEqual([])
    expect(typosIn("V$TIMEZONE_NAMES")).toEqual([])
  })
})

describe("the list", () => {
  it("holds the six, with how each was checked", () => {
    expect(Object.keys(TYPOS).sort()).toEqual(["FTVFTPY", "GTVFLST", "SBPPERS", "SLBREDF", "SMARPLE", "V,TIMEZONE_NAMES"])
    expect(typoNote(TYPOS.SBPPERS)).toBe("Not a table or form in a Banner database checked on 12 Oct 2026.")
    expect(typoNote(TYPOS.FTVFTPY)).toContain("Very likely")
    // SMARPLE is the form SMAPRLE with two letters swapped; the note names its table too.
    expect(TYPOS.SMARPLE).toMatchObject({ probably: "SMAPRLE", kind: "form" })
    expect(typoNote(TYPOS.SMARPLE)).toBe(
      "Not a table or form in a Banner database checked on 12 Oct 2026. The form SMAPRLE sits on the table SMRPRLE.",
    )
    expect(TYPOS.GTVFLST.kind).toBe("table")
    // Oracle's own list of time zones, assumed.
    expect(TYPOS["V,TIMEZONE_NAMES"]).toMatchObject({ probably: "V$TIMEZONE_NAMES", kind: "oracle", confirmed: false })
    expect(typoNote(TYPOS["V,TIMEZONE_NAMES"])).toContain("Assumed, not checked")
  })
})
