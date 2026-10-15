// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ComponentsPage from "./components-page"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
const errors: unknown[] = []

beforeEach(() => {
  // Browser features jsdom lacks, which some components expect.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.getAnimations ??= () => []
  vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args))
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  errors.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("component gallery", () => {
  it("draws every section without errors", async () => {
    await act(async () => root.render(<ComponentsPage />))
    const sections = [...container.querySelectorAll("section[data-gallery-section]")].map((s) => s.getAttribute("aria-label"))
    expect(sections).toEqual([
      "Buttons, badges, little things",
      "Cards and lists",
      "Fields with lineage (50 rows)",
      "API detail parts",
      "Search",
      "Notices, progress, messages",
      "Settings panel and dialogs",
    ])
    expect(container.querySelectorAll("tbody tr")).toHaveLength(50)
    expect(errors).toEqual([])
  })
})
