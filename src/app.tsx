import { lazy, Suspense, type ReactNode } from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import { FavouritesOpenProvider } from "@/components/favourites/favourites-panel"
import { Header } from "@/components/header"
import { IndexGate } from "@/components/index-gate"
import { ReindexToasts } from "@/components/reindex-toasts"
import { SettingsOpenProvider } from "@/components/settings/settings-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { useFollowSystemTheme } from "@/lib/theme"
import { ApisProvider } from "@/lib/use-apis"
import { SearchProvider } from "@/lib/use-search"
import { TablesProvider } from "@/lib/use-tables"
import { StatusProvider, useStatus } from "@/lib/use-status"
import { FirstRunPage } from "@/pages/first-run/first-run-page"
import { SummaryPage } from "@/pages/first-run/summary-page"
import { FormListPage } from "@/pages/forms/form-list-page"
import { FormPage } from "@/pages/forms/form-page"
import { ApiListPage } from "@/pages/apis/api-list-page"
import { ApiPage } from "@/pages/apis/api-page"
import { ChangesPage } from "@/pages/apis/changes-page"
import { ComparePage } from "@/pages/apis/compare-page"
import { HomePage } from "@/pages/home"
import { NotFoundPage } from "@/pages/not-found"
import { SearchPage } from "@/pages/search/search-page"
import { TableListPage } from "@/pages/tables/table-list-page"
import { TablePage } from "@/pages/tables/table-page"

// Development-only component gallery. `import.meta.env.DEV` is false in the built app, so
// the gallery is left out of what `npm start` serves.
const ComponentsPage = import.meta.env.DEV ? lazy(() => import("@/dev/components-page")) : null

export function App() {
  useFollowSystemTheme()
  // The router normally applies address changes as low-priority work, so a box whose text lives in the address (Search,
  // the APIs and Tables lists) fell behind and dropped letters typed during a slow search: it applies them at once.
  return (
    <BrowserRouter useTransitions={false}>
      <StatusProvider>
        <ApisProvider>
          <TablesProvider>
            <SearchProvider>
              <SettingsOpenProvider>
                <FavouritesOpenProvider>
                  <Header />
                  <main className="mx-auto max-w-6xl px-4 py-8">
                    <WhenServerReady>
                      <Routes>
                        <Route path="/setup" element={<FirstRunPage />} />
                        {ComponentsPage && (
                          <Route
                            path="/dev/components"
                            element={
                              <Suspense fallback={<p>Loading…</p>}>
                                <ComponentsPage />
                              </Suspense>
                            }
                          />
                        )}
                        <Route element={<IndexGate />}>
                          <Route path="/" element={<HomePage />} />
                          <Route path="/apis" element={<ApiListPage />} />
                          <Route path="/apis/:family/:name" element={<ApiPage />} />
                          <Route path="/apis/:family/:name/compare" element={<ComparePage />} />
                          <Route path="/apis/:family/:name/changes" element={<ChangesPage />} />
                          <Route path="/summary" element={<SummaryPage />} />
                          <Route path="/tables" element={<TableListPage />} />
                          <Route path="/tables/:product/:name" element={<TablePage />} />
                          <Route path="/tables/:product/:name/:column" element={<TablePage />} />
                          <Route path="/forms" element={<FormListPage />} />
                          <Route path="/forms/:product/:code" element={<FormPage />} />
                          <Route path="/search" element={<SearchPage />} />
                          <Route path="*" element={<NotFoundPage />} />
                        </Route>
                      </Routes>
                    </WhenServerReady>
                  </main>
                  <ReindexToasts />
                  <Toaster />
                </FavouritesOpenProvider>
              </SettingsOpenProvider>
            </SearchProvider>
          </TablesProvider>
        </ApisProvider>
      </StatusProvider>
    </BrowserRouter>
  )
}

/** Waits for the app's first status; says so plainly if the server can't be reached. */
function WhenServerReady({ children }: { children: ReactNode }) {
  const { status, error } = useStatus()
  if (error && !status) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-3xl">
        <AlertTitle>Can't reach Lineage Finder</AlertTitle>
        <AlertDescription>
          Is it still running in the terminal? Start it with npm start, then refresh this page.
        </AlertDescription>
      </Alert>
    )
  }
  if (!status) {
    return (
      <p className="flex items-center gap-2">
        <Spinner /> Starting…
      </p>
    )
  }
  return children
}
