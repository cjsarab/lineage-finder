import { describe, expect, it } from "vitest"
import { ELLUCIAN_DOWNLOAD_PAGE } from "../src/lib/first-run-text.ts"
import { catalogZipsReadme, howToRun, problemsIn, releasePackageJson, RUNTIME_PACKAGES, runtimePackageDirs, shipped, zipName } from "./release.ts"

describe("runtimePackageDirs", () => {
  const lock = {
    "": {},
    "node_modules/app-dep": { version: "1.0.0", dependencies: { shared: "^1", "@scope/util": "^2" } },
    "node_modules/shared": { version: "1.5.0" },
    "node_modules/@scope/util": { version: "2.0.0", dependencies: { shared: "^2" } },
    // @scope/util needs shared 2, so npm put its own copy inside it.
    "node_modules/@scope/util/node_modules/shared": { version: "2.0.0" },
    "node_modules/other": { version: "1.0.0", optionalDependencies: { "not-installed": "^1" } },
    "node_modules/unused": { version: "1.0.0", dev: true },
  }

  it("follows dependencies, finding a nested copy before the top-level one, as Node does", () => {
    expect(runtimePackageDirs(lock, ["app-dep"])).toEqual([
      "node_modules/@scope/util",
      "node_modules/@scope/util/node_modules/shared",
      "node_modules/app-dep",
      "node_modules/shared",
    ])
  })

  it("leaves out packages nothing asked for, and skips an optional one that isn't installed", () => {
    expect(runtimePackageDirs(lock, ["other"])).toEqual(["node_modules/other"])
  })

  it("stops with a clear message when a needed package isn't in the lock file", () => {
    expect(() => runtimePackageDirs(lock, ["missing"])).toThrow(/package-lock.json has no missing/)
  })
})

describe("shipped", () => {
  it("takes the built page, the server and the indexer", () => {
    for (const f of ["dist/index.html", "dist/assets/index-abc.js", "server/start.js", "server/main.ts", "indexer/run-index.ts", "indexer/worker.ts"]) {
      expect(shipped(f)).toBe(true)
    }
  })

  it("leaves out tests and their helpers, the made-up test catalog, the source and everything else", () => {
    for (const f of [
      "server/build.test.ts",
      "indexer/lineage.test.ts",
      "indexer/test-catalog/BannerWidgetAPIs/widgets-1.0.0/widgets.yaml",
      "indexer/test-support/zip-catalog.ts",
      "catalog-zips/production_API_catalog_A_B.zip",
      "src/main.tsx",
      "research/forms.md",
      "design/plan.md",
      "playground/spike-12a/SPIKE.md",
      "APICatalog/BannerBusAPIs/x-1.0.0/x.yaml",
      "data/index/apis.json",
      "package-lock.json",
    ]) {
      expect(shipped(f)).toBe(false)
    }
  })
})

describe("problemsIn", () => {
  const good = [
    "dist/index.html",
    "server/start.js",
    "indexer/run-index.ts",
    "node_modules/sirv/index.js",
    "package.json",
    "HOW-TO-RUN.txt",
    "LICENSE",
    "THIRD-PARTY-NOTICES.txt",
    "catalog-zips/README.txt",
  ]

  it("finds nothing wrong with a proper release", () => {
    expect(problemsIn(good)).toEqual([])
  })

  it("refuses native files, catalog files and folders, and index data", () => {
    const problems = problemsIn([
      ...good,
      "node_modules/x/binding.win32-x64-msvc.node",
      "indexer/widgets.yaml",
      "server/notes.pdf",
      "BannerBusAPIs/widgets-1.0.0/widgets.json",
      "data/settings.json",
    ])
    expect(problems).toHaveLength(5) // one each: .node, .yaml, .pdf, the catalog family folder, data/
    expect(problems.join("\n")).toMatch(/native file.*\.node/)
    expect(problems.join("\n")).toMatch(/catalog-shaped file: indexer\/widgets\.yaml/)
    expect(problems.join("\n")).toMatch(/catalog folder: BannerBusAPIs/)
    expect(problems.join("\n")).toMatch(/index or settings data: data\/settings\.json/)
  })

  it("refuses zips, and anything but the README in the catalog-zips folder", () => {
    expect(problemsIn([...good, "catalog-zips/production_API_catalog_A_B.zip", "catalog-zips/notes.txt", "dist/x.ZIP"])).toEqual([
      "zip file (could be the catalog): catalog-zips/production_API_catalog_A_B.zip",
      "in the catalog folder: catalog-zips/production_API_catalog_A_B.zip",
      "in the catalog folder: catalog-zips/notes.txt",
      "zip file (could be the catalog): dist/x.ZIP",
    ])
  })

  it("refuses a release without its page or one of its parts", () => {
    expect(problemsIn(good.filter((f) => f !== "dist/index.html"))).toEqual(["the built page (dist/index.html) is missing", "dist is missing"])
    expect(problemsIn(good.filter((f) => !f.startsWith("node_modules/")))).toEqual(["node_modules is missing"])
    expect(problemsIn(good.filter((f) => !f.startsWith("catalog-zips/")))).toEqual(["catalog-zips is missing"])
  })

  it("refuses a release without its licence or the notices", () => {
    expect(problemsIn(good.filter((f) => f !== "LICENSE"))).toEqual(["LICENSE is missing"])
    expect(problemsIn(good.filter((f) => f !== "THIRD-PARTY-NOTICES.txt"))).toEqual(["THIRD-PARTY-NOTICES.txt is missing"])
  })
})

describe("the release's package.json and guide", () => {
  const pkg = {
    name: "lineage-finder",
    version: "0.13.0",
    description: "Unofficial…",
    license: "MIT",
    type: "module",
    engines: { node: ">=24" },
    dependencies: { fflate: "^0.8.3", "js-yaml": "4.3.2", open: "^11.0.4", react: "^19.3.0", sirv: "^3.0.2", vite: "^8.3.3", yaml: "^2.9.1" },
  }

  it("keeps only start and the runtime packages", () => {
    const out = releasePackageJson(pkg) as { scripts: object; dependencies: object; type: string; version: string }
    expect(out.scripts).toEqual({ start: "node server/start.js" })
    expect(Object.keys(out.dependencies)).toEqual(RUNTIME_PACKAGES)
    expect(out).toMatchObject({ type: "module", version: "0.13.0", license: "MIT", private: true })
  })

  it("names the zip and the guide after the version", () => {
    expect(zipName("0.13.0")).toBe("lineage-finder-0.13.0.zip")
    expect(howToRun("0.13.0")).toMatch(/^Lineage Finder 0\.13\.0/)
    expect(howToRun("0.13.0")).toMatch(/Move the "data" folder/)
    expect(howToRun("0.13.0")).toMatch(/Not affiliated with or endorsed by Ellucian/)
  })

  it("says where the zips go, and to move them with a new release", () => {
    expect(howToRun("0.13.0")).toMatch(/into the "catalog-zips" folder\. No need to unzip them/)
    expect(howToRun("0.13.0")).toMatch(/move them into the new one's "catalog-zips" too/)
    expect(catalogZipsReadme()).toMatch(/^Put the five zips you download from Ellucian here, as they are/)
  })

  it("gives Ellucian's download page, help with Node.js, and what to do with a new catalog", () => {
    expect(howToRun("0.13.0")).toContain(ELLUCIAN_DOWNLOAD_PAGE)
    expect(howToRun("0.13.0")).toMatch(/ask your IT team to install it/)
    expect(howToRun("0.13.0")).toMatch(/WHEN ELLUCIAN PUBLISH A NEW CATALOG\nDelete the old zips/)
  })
})
