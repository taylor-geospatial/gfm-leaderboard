import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Dataset } from "@/lib/data";
import type { Paper } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";
import { ExternalLink, Globe, Layers, MapPin, Satellite } from "lucide-react";

// Sensor family palette (mirrors tailwind chart-N tokens)

type SensorFamily = "sentinel-2" | "sentinel-1" | "landsat" | "aerial" | "worldview" | "mixed";

const SENSOR_COLOR: Record<SensorFamily, string> = {
  "sentinel-2": "#2A9D90", // chart-3
  "sentinel-1": "#4A6B6F", // chart-5
  landsat: "#C8803E", // chart-4
  aerial: "#3B1E1C", // chart-2
  worldview: "#FF4F2C", // chart-1
  mixed: "#8E5BCB", // chart-6
};

const SENSOR_LABEL: Record<SensorFamily, string> = {
  "sentinel-2": "Sentinel-2",
  "sentinel-1": "Sentinel-1",
  landsat: "Landsat",
  aerial: "Aerial / NAIP",
  worldview: "WorldView",
  mixed: "Mixed",
};

// Hard-coded dataset registry

interface DatasetEntry {
  canonical: string;
  aliases: string[]; // normalized
  lat: number;
  lon: number;
  family: SensorFamily;
  scope: "regional" | "global";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const RAW_REGISTRY: Array<{
  canonical: string;
  aliases: string[];
  lat: number;
  lon: number;
  family: SensorFamily;
  scope: "regional" | "global";
}> = [
  {
    canonical: "FMoW",
    aliases: ["fmow", "functional map of the world", "fmow rgb", "fmow sentinel"],
    lat: 0,
    lon: 0,
    family: "mixed",
    scope: "global",
  },
  {
    canonical: "BigEarthNet",
    aliases: ["bigearthnet", "ben", "big earth net"],
    lat: 50.0,
    lon: 10.0,
    family: "sentinel-2",
    scope: "regional",
  },
  {
    canonical: "SEN12MS",
    aliases: ["sen12ms"],
    lat: 0,
    lon: 0,
    family: "mixed",
    scope: "global",
  },
  {
    canonical: "SeCo",
    aliases: ["seco", "seasonal contrast"],
    lat: 0,
    lon: 0,
    family: "sentinel-2",
    scope: "global",
  },
  {
    canonical: "SatlasPretrain",
    aliases: ["satlaspretrain", "satlas pretrain", "satlas"],
    lat: 0,
    lon: 0,
    family: "mixed",
    scope: "global",
  },
  {
    canonical: "SSL4EO",
    aliases: ["ssl4eo", "ssl4eo s12", "ssl4eo l", "ssl4eo s2", "ssl 4 eo"],
    lat: 0,
    lon: 0,
    family: "mixed",
    scope: "global",
  },
  {
    canonical: "Million-AID",
    aliases: ["million aid", "millionaid"],
    lat: 35.0,
    lon: 105.0,
    family: "aerial",
    scope: "regional",
  },
  {
    canonical: "AID",
    aliases: ["aid"],
    lat: 35.0,
    lon: 105.0,
    family: "aerial",
    scope: "regional",
  },
  {
    canonical: "NWPU-RESISC45",
    aliases: ["nwpu resisc45", "nwpu resisc 45", "resisc45", "resisc 45", "resisc"],
    lat: 35.0,
    lon: 105.0,
    family: "aerial",
    scope: "regional",
  },
  {
    canonical: "iSAID",
    aliases: ["isaid", "i said"],
    lat: 0,
    lon: 0,
    family: "aerial",
    scope: "global",
  },
  {
    canonical: "DOTA",
    aliases: ["dota"],
    lat: 0,
    lon: 0,
    family: "aerial",
    scope: "global",
  },
  {
    canonical: "SpaceNet",
    aliases: ["spacenet", "space net"],
    lat: -9.0,
    lon: -52.0,
    family: "worldview",
    scope: "regional",
  },
  {
    canonical: "xView",
    aliases: ["xview", "xview2", "xview 2", "xview3", "xview 3"],
    lat: 0,
    lon: 0,
    family: "worldview",
    scope: "global",
  },
  {
    canonical: "NAIP",
    aliases: ["naip"],
    lat: 39.0,
    lon: -98.0,
    family: "aerial",
    scope: "regional",
  },
  {
    canonical: "ImageNet",
    aliases: ["imagenet", "imagenet 1k", "imagenet1k", "image net"],
    lat: 0,
    lon: 0,
    family: "mixed",
    scope: "global",
  },
  {
    canonical: "Major TOM",
    aliases: ["major tom", "majortom"],
    lat: 0,
    lon: 0,
    family: "sentinel-2",
    scope: "global",
  },
  {
    canonical: "EuroSAT",
    aliases: ["eurosat", "euro sat"],
    lat: 50.0,
    lon: 10.0,
    family: "sentinel-2",
    scope: "regional",
  },
  {
    canonical: "TreeSatAI",
    aliases: ["treesatai", "tree sat ai", "treesat"],
    lat: 51.0,
    lon: 10.0,
    family: "sentinel-2",
    scope: "regional",
  },
  {
    canonical: "M3LEO",
    aliases: ["m3leo", "m 3 leo"],
    lat: 0,
    lon: 0,
    family: "sentinel-1",
    scope: "global",
  },
  {
    canonical: "OpenEarthMap",
    aliases: ["openearthmap", "open earth map"],
    lat: 0,
    lon: 0,
    family: "aerial",
    scope: "global",
  },
  {
    canonical: "Sentinel-2",
    aliases: ["sentinel 2", "sentinel2", "s2"],
    lat: 0,
    lon: 0,
    family: "sentinel-2",
    scope: "global",
  },
  {
    canonical: "Sentinel-1",
    aliases: ["sentinel 1", "sentinel1", "s1"],
    lat: 0,
    lon: 0,
    family: "sentinel-1",
    scope: "global",
  },
  {
    canonical: "Landsat",
    aliases: ["landsat", "landsat 8", "landsat 9", "landsat8", "landsat9"],
    lat: 0,
    lon: 0,
    family: "landsat",
    scope: "global",
  },
  {
    canonical: "WorldView",
    aliases: ["worldview", "worldview 3", "world view", "world view 3", "wv3"],
    lat: 0,
    lon: 0,
    family: "worldview",
    scope: "global",
  },
];

const REGISTRY: DatasetEntry[] = RAW_REGISTRY.map((r) => ({
  canonical: r.canonical,
  aliases: [norm(r.canonical), ...r.aliases.map(norm)],
  lat: r.lat,
  lon: r.lon,
  family: r.family,
  scope: r.scope,
}));

function lookupDataset(name: string): DatasetEntry | null {
  const n = norm(name);
  if (!n) return null;
  // exact alias match first
  for (const e of REGISTRY) {
    if (e.aliases.includes(n)) return e;
  }
  // substring/contains fallback — match the longest alias contained
  let best: { e: DatasetEntry; len: number } | null = null;
  for (const e of REGISTRY) {
    for (const a of e.aliases) {
      if (a.length < 3) continue;
      if (n.includes(a) || a.includes(n)) {
        if (!best || a.length > best.len) best = { e, len: a.length };
      }
    }
  }
  return best?.e ?? null;
}

// Aggregation

interface DatasetAgg {
  canonical: string;
  count: number;
  family: SensorFamily;
  scope: "regional" | "global";
  lat: number;
  lon: number;
  sensors: Set<string>;
  papers: Paper[];
}

function aggregate(papers: Paper[]): {
  byCanonical: Map<string, DatasetAgg>;
  unmappedCount: number;
  sensorCounts: Array<[string, number]>;
} {
  const byCanonical = new Map<string, DatasetAgg>();
  let unmapped = 0;
  const sensorCounts = new Map<string, number>();

  for (const p of papers) {
    const datasets = p.pretraining_data?.datasets ?? [];
    const sensors = p.pretraining_data?.sensors ?? [];
    for (const s of sensors) {
      if (!s) continue;
      sensorCounts.set(s, (sensorCounts.get(s) ?? 0) + 1);
    }
    const seen = new Set<string>();
    for (const dname of datasets) {
      if (!dname) continue;
      const entry = lookupDataset(dname);
      if (!entry) {
        unmapped += 1;
        continue;
      }
      if (seen.has(entry.canonical)) continue;
      seen.add(entry.canonical);
      let agg = byCanonical.get(entry.canonical);
      if (!agg) {
        agg = {
          canonical: entry.canonical,
          count: 0,
          family: entry.family,
          scope: entry.scope,
          lat: entry.lat,
          lon: entry.lon,
          sensors: new Set<string>(),
          papers: [],
        };
        byCanonical.set(entry.canonical, agg);
      }
      agg.count += 1;
      agg.papers.push(p);
      for (const s of sensors) if (s) agg.sensors.add(s);
    }
  }

  const sensorList = Array.from(sensorCounts.entries()).sort((a, b) => b[1] - a[1]);
  return { byCanonical, unmappedCount: unmapped, sensorCounts: sensorList };
}

// Bubble scaling

const bubbleSize = (count: number) => Math.min(56, 8 + Math.sqrt(count) * 6);

// Map style helpers

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

const isDark = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

// Component

export function MapView({ data }: { data: Dataset }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(isDark() ? "dark" : "light");

  const { byCanonical, unmappedCount, sensorCounts } = useMemo(
    () => aggregate(data.papers),
    [data.papers],
  );

  const aggList = useMemo(
    () => Array.from(byCanonical.values()).sort((a, b) => b.count - a.count),
    [byCanonical],
  );
  const regional = useMemo(() => aggList.filter((a) => a.scope === "regional"), [aggList]);
  const global = useMemo(() => aggList.filter((a) => a.scope === "global"), [aggList]);

  const selectedAgg = selected ? (byCanonical.get(selected) ?? null) : null;

  // Watch for theme changes on <html>
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const next = isDark() ? "dark" : "light";
      setTheme((cur) => (cur === next ? cur : next));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Build / rebuild map when theme changes
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const container = containerRef.current;
    const styleUrl = theme === "dark" ? STYLE_DARK : STYLE_LIGHT;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: styleUrl,
        center: [0, 20],
        zoom: 1.4,
        // @ts-expect-error globe projection in v5
        projection: "globe",
        attributionControl: { compact: true },
      });
    } catch {
      // Fallback raster style
      map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© CARTO © OpenStreetMap contributors",
            },
          },
          layers: [{ id: "carto", type: "raster", source: "carto" }],
        },
        center: [0, 20],
        zoom: 1.4,
      });
    }

    map.on("error", () => {
      // swallow style errors silently — keep app alive
    });

    mapRef.current = map;

    map.on("load", () => {
      if (cancelled) return;
      // Add bubble markers for regional datasets
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });
      for (const a of regional) {
        const size = bubbleSize(a.count);
        const el = document.createElement("div");
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.borderRadius = "9999px";
        el.style.background = `${SENSOR_COLOR[a.family]}99`;
        el.style.border = `2px solid ${SENSOR_COLOR[a.family]}`;
        el.style.cursor = "pointer";
        el.style.display = "grid";
        el.style.placeItems = "center";
        el.style.color = "white";
        el.style.fontFamily = "JetBrains Mono, ui-monospace, monospace";
        el.style.fontSize = "11px";
        el.style.fontWeight = "600";
        el.style.boxShadow = "0 2px 8px -2px rgba(0,0,0,.25)";
        el.style.transition = "transform 180ms cubic-bezier(0.16,1,0.3,1)";
        if (size > 14) el.textContent = String(a.count);

        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.1)";
          popup
            .setLngLat([a.lon, a.lat])
            .setHTML(
              `<div style="font-weight:600">${a.canonical}</div>` +
                `<div style="opacity:.7;font-size:11px;margin-top:2px">${a.count} paper${a.count === 1 ? "" : "s"} · ${SENSOR_LABEL[a.family]}</div>`,
            )
            .addTo(map);
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
          popup.remove();
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelected(a.canonical);
        });

        const marker = new maplibregl.Marker({ element: el }).setLngLat([a.lon, a.lat]).addTo(map);
        markersRef.current.push(marker);
      }
    });

    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [theme, regional]);

  return (
    <div className="grid lg:grid-cols-[1fr_24rem] gap-6">
      {/* Left: map */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Pretraining geography</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {fmt(data.papers.length)} GeoFM papers · {fmt(byCanonical.size)} mapped datasets
            {unmappedCount > 0 ? ` · ${fmt(unmappedCount)} unmapped mentions` : ""}
          </p>
        </div>
        <Card className="overflow-hidden rounded-lg border p-0 relative">
          <div
            className="relative w-full"
            style={{ height: "calc(100vh - 280px)", minHeight: 520 }}
          >
            <div ref={containerRef} className="absolute inset-0" />
            {/* Legend chip-row */}
            <div className="absolute top-3 right-3 z-10 flex flex-wrap gap-1.5 max-w-[60%] justify-end">
              {(Object.keys(SENSOR_COLOR) as SensorFamily[]).map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background/85 backdrop-blur px-2 py-1 text-[11px] shadow-card"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: SENSOR_COLOR[f] }} />
                  <span className="text-foreground/80">{SENSOR_LABEL[f]}</span>
                </div>
              ))}
            </div>
            {/* Floating caption */}
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-background/85 backdrop-blur px-2 py-1 text-[11px] text-muted-foreground shadow-card">
              <Globe className="h-3 w-3" />
              Bubble size = papers pretraining on this dataset
            </div>
          </div>
        </Card>
      </div>

      {/* Right: stack */}
      <aside className="flex flex-col gap-4 min-w-0">
        {/* Selected dataset */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Selected dataset</CardTitle>
            {selectedAgg && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedAgg ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <MapPin className="h-5 w-5 text-muted-foreground/60" />
                <div className="text-[12.5px] text-muted-foreground">
                  Click a marker on the map to inspect
                </div>
              </div>
            ) : (
              <SelectedPanel agg={selectedAgg} />
            )}
          </CardContent>
        </Card>

        {/* Global / multi-region */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <CardTitle>Global / multi-region datasets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {global.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No global datasets matched.</div>
            ) : (
              global.map((g) => (
                <BarRow
                  key={g.canonical}
                  label={g.canonical}
                  count={g.count}
                  max={global[0].count}
                  family={g.family}
                  active={selected === g.canonical}
                  onClick={() => setSelected(g.canonical)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Sensor distribution */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-1.5">
            <Satellite className="h-3.5 w-3.5 text-muted-foreground" />
            <CardTitle>Sensor distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {sensorCounts.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No sensor data.</div>
            ) : (
              sensorCounts
                .slice(0, 12)
                .map(([name, count]) => (
                  <BarRow
                    key={name}
                    label={name}
                    count={count}
                    max={sensorCounts[0][1]}
                    family={guessFamily(name)}
                  />
                ))
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

// Subcomponents

function SelectedPanel({ agg }: { agg: DatasetAgg }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{agg.canonical}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {agg.count} paper{agg.count === 1 ? "" : "s"} pretrain on this dataset
          </div>
        </div>
        <Badge
          variant="outline"
          className="shrink-0"
          style={{ borderColor: SENSOR_COLOR[agg.family], color: SENSOR_COLOR[agg.family] }}
        >
          {SENSOR_LABEL[agg.family]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="default">{agg.scope}</Badge>
        <Badge variant="outline">mean params: {meanParams(agg.papers)}M</Badge>
      </div>

      {agg.sensors.size > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Layers className="h-3 w-3" /> sensors observed
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from(agg.sensors)
              .slice(0, 12)
              .map((s) => (
                <Badge key={s} variant="outline" className="text-[10.5px]">
                  {s}
                </Badge>
              ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Papers
        </div>
        <div className="max-h-96 overflow-y-auto pr-1 space-y-1">
          {agg.papers
            .slice()
            .sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0))
            .map((p) => (
              <a
                key={p.id}
                href={p.arxiv_url ?? p.s2_url ?? "#"}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-start gap-2 rounded-md border border-transparent hover:border-border hover:bg-muted/50 px-2 py-1.5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">
                    {p.model_name ?? "(no model)"}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {p.title ?? ""}
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 shrink-0 mt-1 text-muted-foreground" />
              </a>
            ))}
        </div>
      </div>
    </div>
  );
}

function BarRow({
  label,
  count,
  max,
  family,
  active,
  onClick,
}: {
  label: string;
  count: number;
  max: number;
  family: SensorFamily;
  active?: boolean;
  onClick?: () => void;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const interactive = !!onClick;
  const Wrap: React.ElementType = interactive ? "button" : "div";
  return (
    <Wrap
      onClick={onClick}
      className={cn("block w-full text-left group", interactive && "cursor-pointer")}
    >
      <div className="flex items-center justify-between text-[12.5px] mb-0.5">
        <span
          className={cn(
            "truncate pr-2",
            active ? "text-foreground font-medium" : "text-foreground/85",
            interactive && "group-hover:text-foreground",
          )}
        >
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground text-[11.5px]">{fmt(count)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: SENSOR_COLOR[family],
            opacity: active ? 1 : 0.75,
          }}
        />
      </div>
    </Wrap>
  );
}

// Helpers

function meanParams(papers: Paper[]): string {
  const vals = papers
    .map((p) => p.architecture?.params_millions)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (vals.length === 0) return "—";
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return m >= 100 ? m.toFixed(0) : m.toFixed(1);
}

function guessFamily(sensor: string): SensorFamily {
  const s = sensor.toLowerCase();
  if (s.includes("sentinel-2") || s.includes("sentinel 2") || s === "s2") return "sentinel-2";
  if (s.includes("sentinel-1") || s.includes("sentinel 1") || s === "s1") return "sentinel-1";
  if (s.includes("landsat")) return "landsat";
  if (s.includes("naip") || s.includes("aerial")) return "aerial";
  if (s.includes("worldview") || s.includes("wv")) return "worldview";
  return "mixed";
}
