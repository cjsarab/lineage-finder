// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { THEME_KEY, chooseTheme, initialTheme, storedTheme } from "./theme"

function fakeSystemSetting(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  vi.unstubAllGlobals()
})

describe("theme", () => {
  it("follows the computer's setting until the user chooses", () => {
    fakeSystemSetting(true)
    expect(storedTheme()).toBeNull()
    expect(initialTheme()).toBe("dark")
    fakeSystemSetting(false)
    expect(initialTheme()).toBe("light")
  })

  it("switches the page to dark and back", () => {
    chooseTheme("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    chooseTheme("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("remembers the choice, so it survives a reload", () => {
    fakeSystemSetting(false)
    chooseTheme("dark")
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")
    expect(initialTheme()).toBe("dark")
  })

  it("ignores a stored value it doesn't recognise", () => {
    fakeSystemSetting(false)
    localStorage.setItem(THEME_KEY, "purple")
    expect(initialTheme()).toBe("light")
  })
})
