// The working-out behind one API's page. Made-up APIs only.
import { describe, expect, it } from "vitest"
import { fakeApi } from "@/test-support/fake-app"
import { chooseVersion, headersLine, parameterGroups, releaseText, sameNameElsewhere, sortMethods, sourcePage, sourcePageLabel, titleIfDifferent } from "./api-page"
import type { MethodParameters } from "./server"

describe("chooseVersion", () => {
  const api = fakeApi("BannerWidgetAPIs", "widgets", { versions: ["1.0.0", "1.10.0", "2.0.0"] })

  it("shows the newest unless the address asks for another", () => {
    expect(chooseVersion(api, null).version.version).toBe("2.0.0")
    expect(chooseVersion(api, "1.10.0")).toMatchObject({ version: { version: "1.10.0" }, newest: { version: "2.0.0" }, unknown: null })
  })

  it("shows the newest, and says so, when asked for a version it doesn't have", () => {
    expect(chooseVersion(api, "9.0.0")).toMatchObject({ version: { version: "2.0.0" }, unknown: "9.0.0" })
  })
})

describe("the heading and Details", () => {
  it("shows the title only when it says more than the name", () => {
    expect(titleIfDifferent("Widget Requests", "widget-requests")).toBeNull()
    expect(titleIfDifferent("Widget Request Holds", "widget-requests")).toBe("Widget Request Holds")
    expect(titleIfDifferent(null, "widgets")).toBeNull()
  })

  it("finds the same name in other families", () => {
    const a = fakeApi("BannerWidgetAPIs", "widgets")
    const b = fakeApi("ColleagueWidgetAPIs", "widgets")
    const c = fakeApi("ColleagueWidgetAPIs", "gadgets")
    expect(sameNameElsewhere([a, b, c], a)).toEqual([b])
  })

  it("names the release status in plain words", () => {
    expect(releaseText("ga", false)).toBe("Released")
    expect(releaseText("ga", true)).toBe("Beta")
    expect(releaseText(null, false)).toBe("Not stated")
    expect(releaseText("preview", false)).toBe("preview")
  })

  it("says which page the API mirrors", () => {
    expect(sourcePage("Widget Maintenance", "SWAWIDG")).toBe("Widget Maintenance (SWAWIDG)")
    expect(sourcePage(null, "SWAWIDG")).toBe("SWAWIDG")
    expect(sourcePage(null, null)).toBeNull()
    expect(sourcePageLabel("BannerWidgetAPIs")).toBe("Banner page")
    expect(sourcePageLabel("ColleagueWidgetAPIs")).toBe("Source page")
  })
})

describe("methods and parameters", () => {
  const m = (method: string, path: string, ...headers: string[]): MethodParameters => ({
    path,
    method,
    parameters: headers.map((name) => ({ name, in: "header", required: false, description: null })),
  })

  it("orders methods by path, then GET, POST, PUT, PATCH, DELETE, then anything else", () => {
    const order = sortMethods([m("DELETE", "/a/{id}"), m("OPTIONS", "/a"), m("PUT", "/a"), m("GET", "/a"), m("PATCH", "/a"), m("POST", "/a")])
    expect(order.map((x) => `${x.method} ${x.path}`)).toEqual(["GET /a", "POST /a", "PUT /a", "PATCH /a", "OPTIONS /a", "DELETE /a/{id}"])
  })

  it("keeps headers out of the parameter groups", () => {
    const withQuery: MethodParameters = { path: "/a", method: "GET", parameters: [{ name: "limit", in: "query", required: false, description: null }, ...m("GET", "/a", "Accept").parameters] }
    expect(parameterGroups([m("POST", "/a", "Content-Type"), withQuery])).toEqual([{ ...withQuery, parameters: [withQuery.parameters[0]] }])
  })

  it("sums up the headers in one line, by method", () => {
    const all = [{ method: "GET" }, { method: "POST" }, { method: "PUT" }]
    expect(headersLine([m("GET", "/a", "Accept", "X-SDE-Expand"), m("PUT", "/a", "Accept", "X-SDE-Expand"), m("POST", "/a", "Content-Type")], all)).toBe(
      "Accept, X-SDE-Expand (GET, PUT) · Content-Type (POST)",
    )
  })

  it("gives just the names when every method sends the same, and says which methods when some send none", () => {
    expect(headersLine([m("GET", "/a", "Accept"), m("GET", "/a/{id}", "Accept"), m("POST", "/a", "Accept")], [{ method: "GET" }, { method: "POST" }])).toBe("Accept")
    expect(headersLine([m("GET", "/a", "Accept")], [{ method: "GET" }, { method: "POST" }])).toBe("Accept (GET)")
    expect(headersLine([], [{ method: "GET" }])).toBeNull()
  })
})
