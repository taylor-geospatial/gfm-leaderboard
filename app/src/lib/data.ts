import Papa from "papaparse";
import { useEffect, useState } from "react";
import type {
  BenchmarkHeatmap,
  CitationNetwork,
  Critique,
  Manifest,
  Paper,
  ResultRow,
  Scorecards,
  UmapPoint,
} from "./types";
import { dataUrl } from "./utils";

export interface Dataset {
  papers: Paper[];
  results: ResultRow[];
  critique: Critique;
  umap: UmapPoint[];
  network: CitationNetwork | null;
  heatmap: BenchmarkHeatmap | null;
  manifest: Manifest;
  scorecards: Scorecards;
  byPaperId: Map<string, Paper>;
}

let cache: Promise<Dataset> | null = null;

export function loadDataset(): Promise<Dataset> {
  if (cache) return cache;
  cache = (async () => {
    const [papers, manifest, critique, results, umap, network, heatmap, scorecards] = await Promise.all([
      fetch(dataUrl("papers.json")).then((r) => r.json() as Promise<Paper[]>),
      fetch(dataUrl("manifest.json")).then((r) => r.json() as Promise<Manifest>),
      fetch(dataUrl("meta/critique.json")).then((r) => r.json() as Promise<Critique>),
      fetch(dataUrl("results.csv"))
        .then((r) => r.text())
        .then(
          (txt) =>
            new Promise<ResultRow[]>((resolve, reject) => {
              Papa.parse<ResultRow>(txt, {
                header: true,
                skipEmptyLines: true,
                complete: (res) => resolve(res.data),
                error: reject,
              });
            }),
        ),
      fetch(dataUrl("meta/umap.json"))
        .then((r) => (r.ok ? (r.json() as Promise<UmapPoint[]>) : []))
        .catch(() => [] as UmapPoint[]),
      fetch(dataUrl("meta/citation_network.json"))
        .then((r) => (r.ok ? (r.json() as Promise<CitationNetwork>) : null))
        .catch(() => null),
      fetch(dataUrl("meta/benchmark_heatmap.json"))
        .then((r) => (r.ok ? (r.json() as Promise<BenchmarkHeatmap>) : null))
        .catch(() => null),
      fetch(dataUrl("scorecards.json"))
        .then((r) => (r.ok ? (r.json() as Promise<Scorecards>) : ({} as Scorecards)))
        .catch(() => ({}) as Scorecards),
    ]);
    const byPaperId = new Map(papers.map((p) => [p.id, p]));
    return {
      papers,
      results,
      critique,
      umap,
      network,
      heatmap,
      manifest,
      scorecards,
      byPaperId,
    };
  })();
  return cache;
}

export function useDataset() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let mounted = true;
    loadDataset()
      .then((d) => mounted && setData(d))
      .catch((e: unknown) => mounted && setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      mounted = false;
    };
  }, []);
  return { data, error, loading: !data && !error };
}
