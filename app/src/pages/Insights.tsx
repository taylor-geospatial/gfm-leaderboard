import { Card, CardContent } from "@/components/ui/Card";
import type { Dataset } from "@/lib/data";
import { navigate, useRoute } from "@/lib/router";
import { cn, fmt, fmtPct } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const C = {
  c1: "#FF4F2C",
  c2: "#3B1E1C",
  c3: "#2A9D90",
  c4: "#C8803E",
  c5: "#4A6B6F",
  c6: "#8E5BCB",
};
const PALETTE = [C.c1, C.c2, C.c3, C.c4, C.c5, C.c6];
const BORDER = "hsl(0 0% 88%)";
const MUTED = "hsl(0 0% 45%)";

const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  stroke: BORDER,
  tick: { fill: MUTED, fontSize: 11 },
};
const GRID_PROPS = {
  strokeDasharray: "0",
  stroke: BORDER,
  vertical: false,
};
const MARGIN = { top: 10, right: 16, bottom: 8, left: 0 };

type TooltipRow = { label: string; value: string; color?: string };
function CustomTooltip({
  title,
  rows,
}: {
  title?: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="rounded-md border border-border bg-popover shadow-pop px-2.5 py-2 text-[11.5px]">
      {title ? (
        <div className="text-[11px] font-medium text-foreground max-w-[260px] truncate">
          {title}
        </div>
      ) : null}
      <div className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            {r.color ? (
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />
            ) : null}
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto font-mono text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type FigureId =
  | "benchmark_concentration"
  | "cherry_picking"
  | "divergence"
  | "pretrain_data_concentration"
  | "benchmark_heatmap"
  | "params_vs_perf"
  | "temporal_sota";

interface FigMeta {
  id: FigureId;
  label: string;
}
interface FigGroup {
  group: string;
  items: FigMeta[];
}

const GROUPS: FigGroup[] = [
  {
    group: "Three Measurements",
    items: [
      { id: "benchmark_concentration", label: "Benchmarks: head + tail" },
      { id: "cherry_picking", label: "Top-10 overlap" },
      { id: "divergence", label: "Reported-number divergence" },
      { id: "pretrain_data_concentration", label: "Pretraining-data confound" },
    ],
  },
  {
    group: "Explorer",
    items: [
      { id: "benchmark_heatmap", label: "Benchmark heatmap" },
      { id: "params_vs_perf", label: "Params vs performance" },
      { id: "temporal_sota", label: "Temporal SOTA trace" },
    ],
  },
];

function FigureFrame({
  title,
  caption,
  children,
  stats,
  paperRef,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  stats?: Array<{ label: string; value: string }>;
  paperRef?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground max-w-3xl leading-relaxed">
          {caption}
        </p>
      </div>
      <Card>
        <CardContent className="pt-5">{children}</CardContent>
      </Card>
      {stats?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-card px-3 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-0.5 font-mono text-xl text-foreground tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {paperRef ? (
        <div className="text-[11.5px] text-muted-foreground">
          See <span className="text-foreground font-medium">{paperRef}</span> in the paper.{" "}
          <span className="text-muted-foreground italic">Paper coming soon.</span>
        </div>
      ) : null}
    </div>
  );
}

function DivergenceFig({ data }: { data: Dataset }) {
  const a = (data.critique.analyses as any)["1_reported_number_divergence"];
  const top = (a.top_divergent_strict_full_50 ?? []).slice(0, 12);

  // Build long-form points: one per (tuple, paper-value)
  type Pt = {
    idx: number;
    value: number;
    title: string;
    paper: string;
    label: string;
    color: string;
    spread: number;
  };
  const points: Pt[] = [];
  for (const [i, t] of top.entries()) {
    const label = `${(t as any).model} · ${(t as any).benchmark}`;
    const color = PALETTE[i % PALETTE.length];
    const vals = (t as any).values ?? [];
    for (const v of vals) {
      const value = typeof v === "number" ? v : v.value;
      const ttl = typeof v === "object" ? (v.title ?? v.paper ?? "") : "";
      const paper = typeof v === "object" ? (v.paper ?? "") : "";
      if (typeof value === "number") {
        points.push({
          idx: i,
          value,
          title: String(ttl),
          paper: String(paper),
          label,
          color,
          spread: (t as any).spread ?? 0,
        });
      }
    }
  }

  const stats = [
    { label: "Tuples ≥5pp spread", value: fmt(a.n_strict_spread_ge_5) },
    { label: "≥10pp spread", value: fmt(a.n_strict_spread_ge_10) },
    { label: "≥20pp spread", value: fmt(a.n_strict_spread_ge_20) },
    {
      label: "Median spread",
      value: a.strict_spread_summary?.median?.toFixed?.(2) ?? "—",
    },
    {
      label: "Max spread",
      value: a.strict_spread_summary?.max?.toFixed?.(1) ?? "—",
    },
  ];

  return (
    <FigureFrame
      title="Reported-number divergence"
      caption="Same (model, benchmark, metric) tuple, multiple papers, different reported values. Each column is one tuple; each dot is one paper's number. Wide vertical scatter inside a column = papers disagreeing about how a model performs."
      stats={stats}
      paperRef="§3.1 / Fig. 1"
    >
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ ...MARGIN, bottom: 60 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            type="number"
            dataKey="idx"
            domain={[-0.5, top.length - 0.5]}
            ticks={top.map((_: unknown, i: number) => i)}
            tickFormatter={(v: number) => {
              const t = top[v];
              return t ? `${t.model}` : "";
            }}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={70}
            {...AXIS_PROPS}
          />
          <YAxis
            type="number"
            dataKey="value"
            domain={[0, 100]}
            label={{
              value: "Reported value",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: MUTED },
              offset: 12,
            }}
            {...AXIS_PROPS}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ stroke: BORDER, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Pt;
              return (
                <CustomTooltip
                  title={p.title || p.paper}
                  rows={[
                    { label: "Tuple", value: p.label, color: p.color },
                    { label: "Reported", value: p.value.toFixed(2) },
                    { label: "Spread (pp)", value: p.spread.toFixed(1) },
                  ]}
                />
              );
            }}
          />
          <Scatter data={points} shape="circle">
            {points.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Recharts Cell requires index key
              <Cell key={i} fill={p.color} fillOpacity={0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </FigureFrame>
  );
}

function BenchmarkConcentrationFig({ data }: { data: Dataset }) {
  const a = (data.critique.analyses as any)["2_benchmark_concentration"];
  const rows = (a.top_20 ?? []).slice(0, 12).map(([name, n]: [string, number]) => ({ name, n }));
  const stats = [
    { label: "Unique benchmarks", value: fmt(a.n_unique_benchmarks) },
    { label: "Total evaluations", value: fmt(a.n_total_evaluations) },
    { label: "Gini", value: a.gini?.toFixed(3) ?? "—" },
    { label: "HHI", value: a.hhi?.toFixed(3) ?? "—" },
    {
      label: "Top-12 share",
      value: fmtPct(
        rows.reduce((s: number, r: { n: number }) => s + r.n, 0) / (a.n_total_evaluations || 1),
      ),
    },
  ];
  return (
    <FigureFrame
      title="Benchmark concentration"
      caption="How many evaluations target each benchmark. The top dozen benchmarks soak up most of the field — this is where the leaderboard lives, and what the rest of the corpus is implicitly being compared against."
      stats={stats}
      paperRef="§3.2 / Fig. 2"
    >
      <ResponsiveContainer width="100%" height={360}>
        <BarChart layout="vertical" data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="0" stroke={BORDER} horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            {...AXIS_PROPS}
            tick={{ fill: MUTED, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(0 0% 96%)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { name: string; n: number };
              return (
                <CustomTooltip
                  title={p.name}
                  rows={[{ label: "Evaluations", value: fmt(p.n), color: C.c2 }]}
                />
              );
            }}
          />
          <Bar dataKey="n" fill={C.c2} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </FigureFrame>
  );
}

function CherryPickingFig({ data }: { data: Dataset }) {
  const a = (data.critique.analyses as any)["3_cherry_picking"];
  const counts: number[] = a.histogram?.counts ?? a.histogram ?? [];
  const bins: number[] | undefined = a.histogram?.bins;
  const rows = counts.map((c: number, i: number) => {
    const lo = bins ? bins[i] : i / counts.length;
    const hi = bins ? bins[i + 1] : (i + 1) / counts.length;
    return {
      label: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`,
      n: c,
    };
  });
  const zeroPct = a.n_papers_with_zero_overlap / (a.n_total || 1);
  const stats = [
    {
      label: "Papers w/ zero overlap",
      value: `${fmt(a.n_papers_with_zero_overlap)} (${fmtPct(zeroPct)})`,
    },
    { label: "Mean overlap", value: fmtPct(a.mean_overlap) },
    { label: "Median overlap", value: fmtPct(a.median_overlap) },
    { label: "Total papers", value: fmt(a.n_total) },
  ];
  return (
    <FigureFrame
      title="Baseline overlap (cherry-picking signal)"
      caption="For each paper, what fraction of the field's top-10 benchmarks does it actually evaluate on? A wall on the left tail means many papers pick a different evaluation neighborhood than the rest of the field."
      stats={stats}
      paperRef="§3.3 / Fig. 3"
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={MARGIN}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "hsl(0 0% 96%)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <CustomTooltip
                  title={`Overlap ${label}`}
                  rows={[
                    {
                      label: "Papers",
                      value: fmt(payload[0].value as number),
                      color: C.c1,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="n" fill={C.c1} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </FigureFrame>
  );
}

function PretrainDataFig({ data }: { data: Dataset }) {
  const a = (data.critique.analyses as any)["8_pretrain_data_concentration"];
  // Recompute dataset usage from results.csv counting *unique papers* per dataset
  // (the precomputed top_20_datasets over-counts because some papers list a dataset
  // many times via repeated result rows).
  const { datasets, totalUniqueDatasets } = useMemo(() => {
    const dsToPapers = new Map<string, Set<string>>();
    for (const r of data.results) {
      const pid = (r.pdf_filename ?? "").trim();
      const raw = (r.pretraining_dataset ?? "").trim();
      if (!pid || !raw) continue;
      for (const ds of raw.split(",").map((s) => s.trim())) {
        if (!ds || ds.toLowerCase() === "none" || ds.toLowerCase() === "n/a") continue;
        if (!dsToPapers.has(ds)) dsToPapers.set(ds, new Set());
        dsToPapers.get(ds)!.add(pid);
      }
    }
    const ranked = [...dsToPapers.entries()]
      .map(([name, papers]) => ({ name, n: papers.size }))
      .filter((d) => d.n >= 2)
      .sort((x, y) => y.n - x.n)
      .slice(0, 12);
    return { datasets: ranked, totalUniqueDatasets: dsToPapers.size };
  }, [data.results]);
  const sensors = (a.top_10_sensors_field ?? [])
    .slice(0, 8)
    .map(([name, n]: [string, number], i: number) => ({
      name,
      n,
      fill: PALETTE[i % PALETTE.length],
    }));
  const stats = [
    { label: "Unique datasets", value: fmt(totalUniqueDatasets) },
    { label: "Sensor Gini", value: a.sensor_gini?.toFixed(3) ?? "—" },
    {
      label: "Top dataset",
      value: datasets[0]?.name ?? "—",
    },
    {
      label: "Top sensor",
      value: sensors[0]?.name ?? "—",
    },
  ];
  return (
    <FigureFrame
      title="Pretraining data concentration"
      caption="What corpora and sensors GeoFM pretraining actually draws from. A handful of curated datasets and Sentinel-1/2 imagery anchor most of the field — meaning models inherit the same coverage gaps."
      stats={stats}
      paperRef="§4 / Fig. 8"
    >
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Top datasets
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              layout="vertical"
              data={datasets}
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="0" stroke={BORDER} horizontal={false} />
              <XAxis type="number" {...AXIS_PROPS} />
              <YAxis type="category" dataKey="name" width={140} {...AXIS_PROPS} />
              <Tooltip
                cursor={{ fill: "hsl(0 0% 96%)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { name: string; n: number };
                  return (
                    <CustomTooltip
                      title={p.name}
                      rows={[
                        {
                          label: "Papers",
                          value: fmt(p.n),
                          color: C.c2,
                        },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="n" fill={C.c2} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Top sensors
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={sensors}
                dataKey="n"
                nameKey="name"
                innerRadius={50}
                outerRadius={95}
                paddingAngle={1}
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
              >
                {sensors.map((s: { name: string; n: number; fill: string }, i: number) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Recharts Cell requires index key
                  <Cell key={i} fill={s.fill} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as {
                    name: string;
                    n: number;
                    fill: string;
                  };
                  return (
                    <CustomTooltip
                      title={p.name}
                      rows={[{ label: "Mentions", value: fmt(p.n), color: p.fill }]}
                    />
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="square"
                layout="vertical"
                align="right"
                verticalAlign="middle"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </FigureFrame>
  );
}

function BenchmarkHeatmapFig({ data }: { data: Dataset }) {
  const hm = data.heatmap;
  const models = hm?.models ?? [];
  const benchmarks = hm?.benchmarks ?? [];
  const cells = hm?.cells ?? [];

  const lookup = useMemo(() => {
    const m = new Map<string, { raw: number; norm: number }>();
    for (const c of cells) {
      m.set(`${c.model}|${c.benchmark}`, { raw: c.raw, norm: c.norm });
    }
    return m;
  }, [cells]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{
    model: string;
    benchmark: string;
    raw: number;
    norm: number;
    x: number;
    y: number;
  } | null>(null);

  const CELL_W = 44;
  const CELL_H = 22;
  const LABEL_W = 130;
  const HEADER_H = 100;
  const W = LABEL_W + benchmarks.length * CELL_W;
  const H = HEADER_H + models.length * CELL_H;

  useEffect(() => {
    if (!hm) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "hsl(2 33% 10%)" : "hsl(60 11% 94%)";
    ctx.fillRect(0, 0, W, H);

    // Benchmark column headers (rotated)
    ctx.save();
    ctx.font = `500 10px "Space Grotesk", ui-sans-serif`;
    ctx.fillStyle = isDark ? "rgba(244,244,235,0.65)" : "rgba(59,30,28,0.6)";
    for (let bi = 0; bi < benchmarks.length; bi++) {
      const cx = LABEL_W + bi * CELL_W + CELL_W / 2;
      ctx.save();
      ctx.translate(cx, HEADER_H - 8);
      ctx.rotate(-Math.PI / 3);
      ctx.fillText(benchmarks[bi], 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Model rows
    for (let mi = 0; mi < models.length; mi++) {
      const y = HEADER_H + mi * CELL_H;
      // Row label
      ctx.font = `400 10.5px "Space Grotesk", ui-sans-serif`;
      ctx.fillStyle = isDark ? "rgba(244,244,235,0.75)" : "rgba(59,30,28,0.7)";
      const label = models[mi].length > 18 ? `${models[mi].slice(0, 16)}…` : models[mi];
      ctx.fillText(label, 4, y + CELL_H / 2 + 4);

      // Cells
      for (let bi = 0; bi < benchmarks.length; bi++) {
        const x = LABEL_W + bi * CELL_W;
        const key = `${models[mi]}|${benchmarks[bi]}`;
        const cell = lookup.get(key);
        if (!cell) {
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
          ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);
        } else {
          // periwinkle → red gradient by normalized score
          const t = cell.norm;
          const r = Math.round(128 + t * (255 - 128));
          const g = Math.round(160 * (1 - t));
          const b = Math.round(216 * (1 - t) + 44 * t);
          const alpha = 0.3 + t * 0.7;
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

          ctx.font = `400 9px "Space Grotesk", ui-sans-serif`;
          ctx.fillStyle = isDark ? "rgba(244,244,235,0.9)" : "rgba(59,30,28,0.85)";
          const txt = cell.raw.toFixed(1);
          const tw = ctx.measureText(txt).width;
          ctx.fillText(txt, x + (CELL_W - tw) / 2, y + CELL_H / 2 + 3.5);
        }
      }
    }
  }, [hm, W, H, benchmarks, models, lookup]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const bi = Math.floor((mx - LABEL_W) / CELL_W);
    const mi = Math.floor((my - HEADER_H) / CELL_H);
    if (bi >= 0 && bi < benchmarks.length && mi >= 0 && mi < models.length) {
      const key = `${models[mi]}|${benchmarks[bi]}`;
      const cell = lookup.get(key);
      if (cell) {
        setTooltip({
          model: models[mi],
          benchmark: benchmarks[bi],
          ...cell,
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
    }
    setTooltip(null);
  };

  if (!hm) {
    return (
      <FigureFrame title="Benchmark coverage heatmap" caption="No heatmap data available.">
        <div className="h-64 grid place-items-center text-muted-foreground text-sm">No data</div>
      </FigureFrame>
    );
  }

  return (
    <FigureFrame
      title="Benchmark coverage heatmap"
      caption="Top 40 models × top 15 benchmarks. Cell color = normalized score for that benchmark (periwinkle = lower, red = top of range). Grey = not evaluated. Reveals which models are broadly evaluated vs. cherry-pick specific benchmarks."
    >
      <div className="overflow-x-auto relative">
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: "crosshair", display: "block" }}
        />
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover shadow-pop px-2.5 py-2 text-[11.5px]"
            style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
          >
            <div className="font-medium truncate max-w-[220px]">{tooltip.model}</div>
            <div className="text-muted-foreground">{tooltip.benchmark}</div>
            <div className="font-mono mt-0.5">
              {tooltip.raw.toFixed(2)}{" "}
              <span className="text-muted-foreground">
                (norm {(tooltip.norm * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        )}
      </div>
    </FigureFrame>
  );
}

function ParamsVsPerfFig({ data }: { data: Dataset }) {
  type PtType = {
    model: string;
    params: number;
    score: number;
    year: number | null;
    benchmark: string;
    color: string;
  };

  const YEAR_COLOR: Record<number, string> = {
    2021: "#94a3b8",
    2022: "#a7d0dc",
    2023: "#80a0d8",
    2024: "#ff4f2c",
    2025: "#C8803E",
    2026: "#cff29e",
  };

  const points = useMemo((): PtType[] => {
    const accuracyMetrics = new Set(["Overall Accuracy", "Accuracy", "Top-1 Accuracy", "mAP"]);
    const modelData = new Map<string, PtType>();
    for (const r of data.results) {
      if (!accuracyMetrics.has(r.metric_name)) continue;
      const params = Number.parseFloat(r.parameters_millions);
      if (!params || params <= 0 || params > 10000) continue;
      try {
        const val = Number.parseFloat(r.metric_value);
        if (!(val > 0 && val <= 100)) continue;
        const yr = Number.parseInt(r.publication_year);
        const existing = modelData.get(r.model_name);
        if (!existing || val > existing.score) {
          modelData.set(r.model_name, {
            model: r.model_name,
            params,
            score: val,
            year: yr || null,
            benchmark: r.benchmark_name,
            color: YEAR_COLOR[yr] ?? "#94a3b8",
          });
        }
      } catch {
        // skip
      }
    }
    return Array.from(modelData.values());
  }, [data.results]);

  const years = [2021, 2022, 2023, 2024, 2025, 2026];

  return (
    <FigureFrame
      title="Model size vs. best reported performance"
      caption="Each point is one model: x = parameters (log scale), y = best reported accuracy-type metric across all benchmarks. Color = publication year. Bigger ≠ better — many small models match or beat large ones."
      stats={[
        { label: "Models plotted", value: fmt(points.length) },
        {
          label: "Median params",
          value: `${points.sort((a, b) => a.params - b.params)[Math.floor(points.length / 2)]?.params.toFixed(0) ?? "—"}M`,
        },
      ]}
    >
      <div className="flex flex-wrap gap-3 mb-3 text-[11px]">
        {years.map((yr) => (
          <span key={yr} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: YEAR_COLOR[yr] }}
            />
            {yr}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 10, right: 24, bottom: 32, left: 8 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            type="number"
            dataKey="params"
            name="Params (M)"
            scale="log"
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `${v}M`}
            label={{
              value: "Parameters (M, log scale)",
              position: "insideBottom",
              offset: -18,
              style: { fontSize: 11, fill: MUTED },
            }}
            {...AXIS_PROPS}
          />
          <YAxis
            type="number"
            dataKey="score"
            name="Score"
            domain={[60, 100]}
            label={{
              value: "Best reported score (%)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: MUTED },
              offset: 12,
            }}
            {...AXIS_PROPS}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ stroke: BORDER, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as PtType;
              return (
                <CustomTooltip
                  title={p.model}
                  rows={[
                    { label: "Params", value: `${p.params}M`, color: p.color },
                    { label: "Best score", value: `${p.score.toFixed(2)}%` },
                    { label: "Benchmark", value: p.benchmark },
                    { label: "Year", value: String(p.year ?? "—") },
                  ]}
                />
              );
            }}
          />
          <Scatter data={points} shape="circle">
            {points.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Recharts Cell requires index key
              <Cell key={i} fill={p.color} fillOpacity={0.8} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </FigureFrame>
  );
}

const TEMPORAL_BENCHMARKS = ["EuroSAT", "AID", "NWPU-RESISC45", "UCM", "fMoW", "PatternNet"];
const TEMPORAL_ACCURACY_METRICS = new Set(["Overall Accuracy", "Accuracy", "Top-1 Accuracy"]);

function TemporalSotaFig({ data }: { data: Dataset }) {
  const BENCH_COLOR: Record<string, string> = {
    EuroSAT: C.c1,
    AID: C.c2,
    "NWPU-RESISC45": C.c3,
    UCM: C.c4,
    fMoW: C.c5,
    PatternNet: C.c6,
  };

  const chartData = useMemo(() => {
    // best score per (benchmark, year)
    const benchYearBest = new Map<string, Map<string, number>>();
    for (const bench of TEMPORAL_BENCHMARKS) {
      benchYearBest.set(bench, new Map());
    }
    for (const r of data.results) {
      if (!TEMPORAL_BENCHMARKS.includes(r.benchmark_name)) continue;
      if (!TEMPORAL_ACCURACY_METRICS.has(r.metric_name)) continue;
      const yr = r.publication_year;
      if (!yr || yr === "0") continue;
      try {
        const val = Number.parseFloat(r.metric_value);
        if (!(val > 0 && val <= 100)) continue;
        const byYear = benchYearBest.get(r.benchmark_name)!;
        if (!byYear.has(yr) || val > byYear.get(yr)!) {
          byYear.set(yr, val);
        }
      } catch {
        // skip
      }
    }

    const allYears = Array.from(
      new Set(Array.from(benchYearBest.values()).flatMap((m) => Array.from(m.keys()))),
    )
      .filter((y) => Number(y) >= 2019)
      .sort();

    return allYears.map((yr) => {
      const row: Record<string, number | string> = { year: yr };
      for (const bench of TEMPORAL_BENCHMARKS) {
        const v = benchYearBest.get(bench)?.get(yr);
        if (v != null) row[bench] = Number(v.toFixed(2));
      }
      return row;
    });
  }, [data.results]);

  return (
    <FigureFrame
      title="Temporal SOTA trace"
      caption="Best reported accuracy per year on six widely-used benchmarks. Rising lines = field improving; flat or dipping lines = performance plateau or year-on-year regression. Note UCM saturation above 99%."
    >
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={MARGIN}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="year" {...AXIS_PROPS} />
          <YAxis domain={[60, 100]} tickFormatter={(v: number) => `${v}%`} {...AXIS_PROPS} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <CustomTooltip
                  title={`Year ${label}`}
                  rows={payload
                    .filter((p) => p.value != null)
                    .map((p) => ({
                      label: p.name as string,
                      value: `${(p.value as number).toFixed(2)}%`,
                      color: p.color as string,
                    }))}
                />
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="line" />
          {TEMPORAL_BENCHMARKS.map((bench) => (
            <Line
              key={bench}
              type="monotone"
              dataKey={bench}
              stroke={BENCH_COLOR[bench]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: BENCH_COLOR[bench] }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </FigureFrame>
  );
}

function Sidebar({ active }: { active: FigureId }) {
  const groups = GROUPS;
  return (
    <>
      {/* Mobile: horizontal pills */}
      <nav className="lg:hidden -mx-4 px-4 overflow-x-auto pb-1">
        <div className="flex gap-1.5">
          {groups
            .flatMap((g) => g.items)
            .map((it) => (
              <button
                type="button"
                key={it.id}
                onClick={() => navigate("insights", { fig: it.id })}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 h-7 text-[12px] font-medium transition-colors",
                  active === it.id
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                {it.label}
              </button>
            ))}
        </div>
      </nav>

      {/* Desktop: sticky left rail */}
      <nav className="hidden lg:block lg:w-56 lg:sticky lg:top-20 self-start">
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5 px-2">
                {g.group}
              </div>
              <div className="flex flex-col">
                {g.items.map((it) => (
                  <button
                    type="button"
                    key={it.id}
                    onClick={() => navigate("insights", { fig: it.id })}
                    className={cn(
                      "text-left rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active === it.id
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                    )}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

export function Insights({ data }: { data: Dataset }) {
  const { params } = useRoute();
  const requested = (params.get("fig") as FigureId) || "benchmark_concentration";
  const allowed: FigureId[] = GROUPS.flatMap((g) => g.items.map((it) => it.id));
  const active: FigureId = allowed.includes(requested) ? requested : "benchmark_concentration";

  return (
    <div className="grid lg:grid-cols-[14rem_1fr] gap-8">
      <Sidebar active={active} />
      <div className="min-w-0">
        {active === "benchmark_concentration" && <BenchmarkConcentrationFig data={data} />}
        {active === "cherry_picking" && <CherryPickingFig data={data} />}
        {active === "divergence" && <DivergenceFig data={data} />}
        {active === "pretrain_data_concentration" && <PretrainDataFig data={data} />}
        {active === "benchmark_heatmap" && <BenchmarkHeatmapFig data={data} />}
        {active === "params_vs_perf" && <ParamsVsPerfFig data={data} />}
        {active === "temporal_sota" && <TemporalSotaFig data={data} />}
      </div>
    </div>
  );
}
