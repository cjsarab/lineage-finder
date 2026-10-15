import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createApi, isLocalHost } from "./api.ts"
import { createAppServer, listen } from "./server.ts"

let distDir: string
const servers: http.Server[] = []

beforeEach(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "lineage-finder-dist-"))
  fs.writeFileSync(path.join(distDir, "index.html"), "<p>the app</p>")
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))))
  fs.rmSync(distDir, { recursive: true, force: true })
})

async function startApp(port = 0): Promise<number> {
  const api = createApi({ dataDir: path.join(distDir, "data"), defaultCatalog: path.join(distDir, "APICatalog") })
  const server = createAppServer(distDir, api.handle)
  servers.push(server)
  return listen(server, port)
}

/** GET with an explicit Host header (fetch won't let us set one). */
function get(port: number, urlPath: string, host = `localhost:${port}`) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: urlPath, headers: { host } }, (res) => {
        let body = ""
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
      })
      .on("error", reject)
  })
}

describe("app server", () => {
  it("answers the health check", async () => {
    const port = await startApp()
    const res = await get(port, "/api/health")
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, app: "Lineage Finder" })
  })

  it("returns 404 for unknown API addresses", async () => {
    const port = await startApp()
    expect((await get(port, "/api/nothing")).status).toBe(404)
  })

  it("returns the app for any page address, so refreshing works", async () => {
    const port = await startApp()
    const res = await get(port, "/second")
    expect(res.status).toBe(200)
    expect(res.body).toContain("the app")
  })

  it("listens on this computer only", async () => {
    const port = await startApp()
    const address = servers[0].address() as AddressInfo
    expect(address.address).toBe("127.0.0.1")
    expect(address.port).toBe(port)
  })

  it("refuses requests addressed to another site name", async () => {
    const port = await startApp()
    expect((await get(port, "/api/health", "evil.example")).status).toBe(403)
  })

  it("moves to the next port when the preferred one is busy", async () => {
    const busyPort = await startApp()
    const port = await startApp(busyPort)
    expect(port).toBeGreaterThan(busyPort)
  })
})

describe("isLocalHost", () => {
  it.each([
    ["localhost:4780", true],
    ["127.0.0.1:4780", true],
    ["[::1]:4780", true],
    ["LOCALHOST", true],
    ["evil.example:4780", false],
    ["localhost.evil.example", false],
    [undefined, false],
  ])("%s → %s", (host, expected) => {
    expect(isLocalHost(host)).toBe(expected)
  })
})
