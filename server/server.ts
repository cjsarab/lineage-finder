import http from "node:http"
import type { AddressInfo } from "node:net"
import sirv from "sirv"
import { isLocalHost, type ApiHandler } from "./api.ts"

/** The server only listens on this computer: other machines can't reach it. */
export const HOST = "127.0.0.1"
export const DEFAULT_PORT = 4780

/** The app's server: the API addresses, then the built web page from `distDir`. */
export function createAppServer(distDir: string, handleApi: ApiHandler): http.Server {
  // `single: true` sends index.html for any other address, so refreshing a page like /tables/Banner/SWBWREQ works.
  const serveFiles = sirv(distDir, { single: true, etag: true })
  return http.createServer((req, res) => {
    if (!isLocalHost(req.headers.host)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
      res.end("Lineage Finder only answers requests from this computer.")
      return
    }
    handleApi(req, res, () => serveFiles(req, res))
  })
}

/**
 * Starts listening on this computer only. Tries `preferredPort`, then the next ones if they're in use
 * (for example when the app is already running). Returns the port actually used.
 */
export async function listen(server: http.Server, preferredPort = DEFAULT_PORT, attempts = 20): Promise<number> {
  for (let port = preferredPort; port < preferredPort + attempts; port++) {
    try {
      await listenOnce(server, port)
      return (server.address() as AddressInfo).port
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err
    }
  }
  throw new Error(`Ports ${preferredPort} to ${preferredPort + attempts - 1} are all in use.`)
}

function listenOnce(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening)
      reject(err)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, HOST)
  })
}
