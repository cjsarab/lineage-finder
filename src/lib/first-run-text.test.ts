import { describe, expect, it } from "vitest"
import { count, describeCheck, seconds, timeLeft } from "./first-run-text"

describe("timeLeft", () => {
  it("says nothing until about 5% is read", () => {
    expect(timeLeft(100, 4378, 1)).toBeNull()
    expect(timeLeft(0, 0, 0)).toBeNull()
  })

  it("guesses from the speed so far, rounded to 5 seconds", () => {
    // 1,000 of 4,000 in 10 s: 30 s left
    expect(timeLeft(1000, 4000, 10)).toBe("About 30 seconds left")
    expect(timeLeft(1000, 4000, 9)).toBe("About 25 seconds left")
  })

  it("says 'a few seconds' near the end and minutes when it's long", () => {
    expect(timeLeft(3900, 4000, 30)).toBe("A few seconds left")
    expect(timeLeft(400, 4000, 20)).toBe("About 3 minutes left")
  })
})

describe("seconds and count", () => {
  it("reads naturally", () => {
    expect(seconds(31.4)).toBe("31 seconds")
    expect(seconds(1)).toBe("1 second")
    expect(seconds(125)).toBe("2 min 5 s")
    expect(count(3645, "API", "APIs")).toBe("3,645 APIs")
    expect(count(1, "family", "families")).toBe("1 family")
  })
})

describe("describeCheck", () => {
  it("says what it found in the zips, and how many other zips it ignored", () => {
    expect(describeCheck({ kind: "ok", path: "C:\\c", families: 20, zips: 5, others: 0 })).toEqual({ ok: true, text: "Found 20 families in 5 zips" })
    expect(describeCheck({ kind: "ok", path: "C:\\c", families: 1, zips: 1, others: 2 }).text).toBe("Found 1 family in 1 zip (2 other zips ignored)")
  })

  it("tells you how to fill the app's own catalog-zips folder", () => {
    const want = "Put the five zips you downloaded from Ellucian into C:\\app\\catalog-zips, as they are (no need to unzip them), then press Check again."
    expect(describeCheck({ kind: "missing", path: "C:\\app\\catalog-zips" }, true).text).toBe(want)
    expect(describeCheck({ kind: "empty", path: "C:\\app\\catalog-zips", others: 0 }, true).text).toBe(want)
  })

  it("explains that the app now reads the zips, for a catalog that was unzipped", () => {
    expect(describeCheck({ kind: "unzipped", path: "D:\\APICatalog" }).text).toBe(
      "This looks like a catalog that was unzipped. The app now reads Ellucian's zip files as you download them: put the zips in a folder and choose that.",
    )
    expect(describeCheck({ kind: "unzipped", path: "C:\\app\\catalog-zips" }, true).text).toMatch(/unzipped.*put the five zips into C:\\app\\catalog-zips, as they are/)
  })

  it("names the zips for a family in two, and a damaged zip", () => {
    expect(describeCheck({ kind: "two-zips", path: "D:\\x", family: "BannerBusAPIs", zips: ["production_API_catalog_A_B (1).zip", "production_API_catalog_A_B.zip"] }).text).toBe(
      "BannerBusAPIs is in two zips: production_API_catalog_A_B (1).zip and production_API_catalog_A_B.zip. Keep only the newest download.",
    )
    expect(describeCheck({ kind: "damaged", path: "D:\\x", zip: "production_API_catalog_D.zip" }).text).toBe("production_API_catalog_D.zip can't be opened. Download it again.")
  })

  it("says whether a pasted folder has no zips, or only other zips", () => {
    expect(describeCheck({ kind: "empty", path: "D:\\Photos", others: 0 }).text).toMatch(/^There are no zip files in D:\\Photos\./)
    expect(describeCheck({ kind: "empty", path: "D:\\Downloads", others: 3 }).text).toMatch(/^None of the zips in D:\\Downloads hold an API catalog\./)
  })

  it("names the folder for a pasted path that doesn't work", () => {
    expect(describeCheck({ kind: "missing", path: "D:\\nope" }).text).toContain("D:\\nope")
    expect(describeCheck({ kind: "not-full-path", path: "nope" }).text).toMatch(/full path/)
  })
})
