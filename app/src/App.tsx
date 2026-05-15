import { Loader2 } from "lucide-react";
import { Suspense, lazy, useEffect } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { useDataset } from "./lib/data";
import { ROUTE_TITLE, useRoute } from "./lib/router";

// Code-split heavy pages so MapLibre / Recharts / TanStack Table only download
// when their route is actually visited. About is small enough to bundle eagerly.
const Findings = lazy(() => import("./pages/Findings").then((m) => ({ default: m.Findings })));
const Leaderboard = lazy(() =>
  import("./pages/Leaderboard").then((m) => ({ default: m.Leaderboard })),
);
const Insights = lazy(() => import("./pages/Insights").then((m) => ({ default: m.Insights })));
const MapView = lazy(() => import("./pages/MapView").then((m) => ({ default: m.MapView })));
const Papers = lazy(() => import("./pages/Papers").then((m) => ({ default: m.Papers })));
const UmapView = lazy(() => import("./pages/UmapView").then((m) => ({ default: m.UmapView })));
const NetworkView = lazy(() =>
  import("./pages/NetworkView").then((m) => ({ default: m.NetworkView })),
);
import { About } from "./pages/About";

function PageSkeleton() {
  return (
    <div className="grid place-items-center py-24 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-xs">Loading view…</span>
    </div>
  );
}

export function App() {
  const { route } = useRoute();
  const { data, loading, error } = useDataset();

  useEffect(() => {
    document.title = `State of GeoFMs · ${ROUTE_TITLE[route]}`;
  }, [route]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {loading ? (
        <div className="flex-1 grid place-items-center text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading corpus…</span>
        </div>
      ) : error ? (
        <div className="container py-12">
          <h2 className="text-lg font-semibold">Failed to load data</h2>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      ) : data ? (
        <>
          {route === "findings" ? <Hero data={data} /> : null}
          <main className="flex-1 container py-8 md:py-10">
            <Suspense fallback={<PageSkeleton />}>
              {route === "findings" && <Findings data={data} />}
              {route === "leaderboard" && <Leaderboard data={data} />}
              {route === "insights" && <Insights data={data} />}
              {route === "map" && <MapView data={data} />}
              {route === "papers" && <Papers data={data} />}
              {route === "umap" && <UmapView data={data} />}
              {route === "network" && <NetworkView data={data} />}
              {route === "about" && <About data={data} />}
            </Suspense>
          </main>
          <footer className="border-t border-border">
            <div className="container py-6 text-2xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                {data.manifest.n_papers} papers · {data.manifest.n_results.toLocaleString()} results
              </span>
              <span>
                Exported{" "}
                <span className="font-mono">
                  {new Date(data.manifest.exported_at).toLocaleDateString()}
                </span>
              </span>
              <span className="ml-auto">© Taylor Geospatial</span>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  );
}
