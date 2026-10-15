import path from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { createApi } from "./server/api.ts"
import { CATALOG_ZIPS_FOLDER } from "./server/settings.ts"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // `npm run dev`: answer the app's /api/ addresses the same way the real server does.
    {
      name: "lineage-finder-api",
      configureServer(server) {
        const api = createApi({
          dataDir: path.join(import.meta.dirname, "data"),
          defaultCatalog: path.join(import.meta.dirname, CATALOG_ZIPS_FOLDER),
        })
        server.middlewares.use((req, res, next) => api.handle(req, res, next))
      },
    },
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { host: "127.0.0.1" },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts", "indexer/**/*.test.ts", "scripts/**/*.test.ts"],
    // The first test in a page's file sets up the simulated browser and takes 1–2 s alone, some 3–4 s; on a busy
    // machine they passed the default 5 s, and the rest of that file then failed with them (found by
    // running two suites at once). Long enough not to, short
    // enough to still catch a test that hangs.
    testTimeout: 30_000,
  },
})
