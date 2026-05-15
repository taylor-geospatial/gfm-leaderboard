import { useEffect, useState } from "react";

export type Route =
  | "findings"
  | "leaderboard"
  | "insights"
  | "map"
  | "papers"
  | "umap"
  | "network"
  | "about";

const VALID = new Set<Route>([
  "findings",
  "leaderboard",
  "insights",
  "map",
  "papers",
  "umap",
  "network",
  "about",
]);

export const ROUTE_TITLE: Record<Route, string> = {
  findings: "Findings",
  leaderboard: "Reported numbers",
  insights: "Insights",
  map: "Map",
  papers: "Papers",
  umap: "UMAP",
  network: "Network",
  about: "About",
};

function parseHash(): { route: Route; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const route = (VALID.has(path as Route) ? path : "findings") as Route;
  return { route, params: new URLSearchParams(query) };
}

export function useRoute() {
  const [state, setState] = useState(parseHash());
  useEffect(() => {
    const onHash = () => setState(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return state;
}

export function navigate(route: Route, params?: Record<string, string>) {
  let hash = `#/${route}`;
  if (params && Object.keys(params).length) {
    const q = new URLSearchParams(params).toString();
    hash += `?${q}`;
  }
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    // force re-render via dispatching event
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}
