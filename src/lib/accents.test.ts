import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ACCENTS, DEFAULT_ACCENT } from "./accents"

const theme = fs.readFileSync(path.join(import.meta.dirname, "..", "theme.css"), "utf8")

describe("accent presets", () => {
  it("theme.css has one block per preset, with the same colour as the list", () => {
    const blocks = [...theme.matchAll(/:root\[data-accent="([a-z]+)"\] \{ --primary: (#[0-9a-f]{6}); \}/g)].map((m) => [m[1], m[2]])
    expect(blocks).toEqual(ACCENTS.map((a) => [a.id, a.hex]))
  })

  it("the theme's default colour is the default preset's", () => {
    const fallback = theme.match(/:root \{[^}]*--primary: (#[0-9a-f]{6})/)?.[1]
    expect(fallback).toBe(ACCENTS.find((a) => a.id === DEFAULT_ACCENT)?.hex)
  })

  it("hover tints follow the accent in both modes, never a fixed colour", () => {
    expect(theme).toContain("--accent: color-mix(in srgb, var(--primary) 45%, white);")
    expect(theme).toContain("--accent: color-mix(in srgb, var(--primary) 25%, var(--card));")
  })
})
