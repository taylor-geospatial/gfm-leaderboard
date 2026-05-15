import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type { Dataset } from "@/lib/data";
import { FAMILIES, type Family, classifyFamily } from "@/lib/families";
import { navigate, useRoute } from "@/lib/router";
import type { Paper, ResultRow } from "@/lib/types";
import { cn, fmt, fmtCompact, pdfKey } from "@/lib/utils";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Code2,
  ExternalLink,
  Filter,
  Github,
  Minus,
  Search,
  Weight,
} from "lucide-react";
import * as React from "react";

const FAMILY_CHART: Record<Family, string> = {
  MAE: "bg-chart-1/10 text-chart-1",
  Contrastive: "bg-chart-3/15 text-chart-3",
  VLM: "bg-chart-6/15 text-chart-6",
  Generative: "bg-chart-4/15 text-chart-4",
  JEPA: "bg-chart-5/15 text-chart-5",
  Other: "bg-muted text-muted-foreground",
};

const ALL_BENCHMARKS = "__all__";

function avatarFor(name: string): { letter: string; hue: number } {
  const trimmed = name.trim();
  const letter = (trimmed[0] ?? "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < trimmed.length; i++) h = (h * 31 + trimmed.charCodeAt(i)) >>> 0;
  return { letter, hue: h % 360 };
}

function parseFloatOrNull(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const v = Number.parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

interface LeaderRow {
  paper: Paper;
  modelName: string;
  family: Family;
  baseArch: string | null;
  params: number | null;
  year: number | null;
  score: number | null;
  benchmarkCount: number;
  citations: number | null;
  paperId: string;
  searchBlob: string;
}

interface BenchmarkChip {
  name: string;
  n: number;
  models: number;
}

// Benchmarks excluded from the leaderboard (sparse / single-paper / wrong-metric entries).
const EXCLUDED_BENCHMARKS = new Set(["Streetscapes1M", "DIOR-RSVG"]);

function buildResultsIndex(results: ResultRow[]) {
  // bucket per paperId+benchmark -> best metric_value
  const benchCounts = new Map<string, number>();
  const benchModels = new Map<string, Set<string>>();
  // best score per (pdf_filename, benchmark_name)
  const bestPerPaperBench = new Map<string, Map<string, number>>();
  // distinct benchmarks per pdf_filename
  const benchesPerPaper = new Map<string, Set<string>>();

  for (const r of results) {
    const b = r.benchmark_name?.trim();
    const pid = r.pdf_filename?.trim();
    if (!b || !pid) continue;
    if (EXCLUDED_BENCHMARKS.has(b)) continue;
    benchCounts.set(b, (benchCounts.get(b) ?? 0) + 1);
    if (!benchModels.has(b)) benchModels.set(b, new Set());
    benchModels.get(b)!.add(pid);
    if (!benchesPerPaper.has(pid)) benchesPerPaper.set(pid, new Set());
    benchesPerPaper.get(pid)!.add(b);
    const v = parseFloatOrNull(r.metric_value);
    if (v == null) continue;
    if (!bestPerPaperBench.has(pid)) bestPerPaperBench.set(pid, new Map());
    const inner = bestPerPaperBench.get(pid)!;
    const cur = inner.get(b);
    if (cur == null || v > cur) inner.set(b, v);
  }
  return { benchCounts, benchModels, bestPerPaperBench, benchesPerPaper };
}

function topBenchmarks(
  benchCounts: Map<string, number>,
  benchModels: Map<string, Set<string>>,
  n = 10,
): BenchmarkChip[] {
  // Rank by unique papers reporting the benchmark — a single paper with 100 results for one
  // benchmark shouldn't outrank a benchmark used by 5 different papers.
  return [...benchModels.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, n)
    .map(([name, papers]) => ({
      name,
      n: benchCounts.get(name) ?? 0,
      models: papers.size,
    }));
}

function computeRows(
  papers: Paper[],
  selectedBenchmark: string,
  topNames: string[],
  bestPerPaperBench: Map<string, Map<string, number>>,
  benchesPerPaper: Map<string, Set<string>>,
): LeaderRow[] {
  return papers.map((p) => {
    const inner = bestPerPaperBench.get(pdfKey(p.id));
    let score: number | null = null;
    if (inner) {
      if (selectedBenchmark === ALL_BENCHMARKS) {
        const vals: number[] = [];
        for (const b of topNames) {
          const v = inner.get(b);
          if (v != null) vals.push(Math.min(v, 100));
        }
        if (vals.length > 0) score = vals.reduce((a, b) => a + b, 0) / vals.length;
      } else {
        const v = inner.get(selectedBenchmark);
        if (v != null) score = v;
      }
    }
    const family = classifyFamily(p);
    const modelName = p.model_name ?? p.title ?? p.id;
    return {
      paper: p,
      modelName,
      family,
      baseArch: p.architecture.backbone,
      params: p.architecture.params_millions,
      year: p.year,
      score,
      benchmarkCount: benchesPerPaper.get(pdfKey(p.id))?.size ?? 0,
      citations: p.citation_count,
      paperId: p.id,
      searchBlob: `${modelName} ${p.title ?? ""} ${p.architecture.backbone ?? ""}`.toLowerCase(),
    };
  });
}

function ModelAvatar({ name }: { name: string }) {
  const { letter, hue } = avatarFor(name);
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-semibold"
      style={{
        background: `hsl(${hue} 70% 92%)`,
        color: `hsl(${hue} 55% 30%)`,
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

function FamilyBadge({ family }: { family: Family }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium tracking-tight",
        FAMILY_CHART[family],
      )}
    >
      {family}
    </span>
  );
}

function BoolCell({ v }: { v: boolean | null | undefined }) {
  return v ? (
    <Check className="h-3.5 w-3.5 text-emerald-600" />
  ) : (
    <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />
  );
}

function PaperDrawer({ paper }: { paper: Paper }) {
  const family = classifyFamily(paper);
  return (
    <DialogContent side="right" className="overflow-y-auto">
      <div className="px-6 pt-6 pb-8 space-y-5">
        <div className="flex items-start gap-3 pr-8">
          <ModelAvatar name={paper.model_name ?? paper.title ?? paper.id} />
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold tracking-tight leading-tight">
              {paper.model_name ?? paper.title ?? paper.id}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground line-clamp-3 mt-1">
              {paper.title ?? "—"}
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <FamilyBadge family={family} />
              {paper.year ? <Badge variant="outline">{paper.year}</Badge> : null}
              {paper.venue ? <Badge variant="outline">{paper.venue}</Badge> : null}
              {paper.code_available ? <Badge variant="success">code</Badge> : null}
              {paper.weights_available ? <Badge variant="success">weights</Badge> : null}
            </div>
          </div>
        </div>

        {paper.tldr || paper.abstract ? (
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {paper.tldr ?? paper.abstract}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <DrawerStat
            label="Params"
            value={
              paper.architecture.params_millions != null
                ? `${fmtCompact(paper.architecture.params_millions * 1e6)}`
                : "—"
            }
          />
          <DrawerStat label="Backbone" value={paper.architecture.backbone ?? "—"} />
          <DrawerStat label="Pretraining" value={paper.pretraining.method ?? "—"} />
          <DrawerStat label="Objective" value={paper.pretraining.objective ?? "—"} />
          <DrawerStat label="Citations" value={fmtCompact(paper.citation_count)} />
          <DrawerStat label="Results" value={fmt(paper.n_results)} />
        </div>

        <DrawerSection title="Pretraining data">
          <ChipList items={paper.pretraining_data.datasets} empty="—" />
          {paper.pretraining_data.sensors.length > 0 ? (
            <div className="mt-2 text-2xs uppercase tracking-wider text-muted-foreground">
              Sensors
            </div>
          ) : null}
          <ChipList items={paper.pretraining_data.sensors} empty="" />
        </DrawerSection>

        <DrawerSection title="Downstream tasks">
          <ChipList items={paper.downstream_tasks} empty="—" />
        </DrawerSection>

        <DrawerSection title="Affiliations">
          <ChipList items={paper.affiliations} empty="—" />
        </DrawerSection>

        <div className="flex flex-wrap gap-2 pt-2">
          {paper.arxiv_url ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={paper.arxiv_url}
                target="_blank"
                rel="noreferrer noopener"
                className="gap-1.5"
              >
                <BookOpen className="h-3.5 w-3.5" /> arXiv
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </Button>
          ) : null}
          {paper.code_url ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={paper.code_url}
                target="_blank"
                rel="noreferrer noopener"
                className="gap-1.5"
              >
                <Github className="h-3.5 w-3.5" /> Code
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </Button>
          ) : null}
          {paper.s2_url ? (
            <Button asChild size="sm" variant="ghost">
              <a href={paper.s2_url} target="_blank" rel="noreferrer noopener" className="gap-1.5">
                Semantic Scholar <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </DialogContent>
  );
}

function DrawerStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[13px] font-medium tracking-tight truncate">{value}</div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  if (!items || items.length === 0) {
    return empty ? <div className="text-[12.5px] text-muted-foreground">{empty}</div> : null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Badge key={it} variant="outline" className="font-normal">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function BenchmarkChipCard({
  active,
  label,
  primary,
  secondary,
  onClick,
}: {
  active: boolean;
  label: string;
  primary: string;
  secondary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 text-left rounded-lg border px-3 py-2 transition-colors min-w-[148px]",
        active
          ? "border-brand-500 bg-brand-50/60 dark:bg-brand-900/20"
          : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "text-2xs uppercase tracking-wider truncate",
          active ? "text-brand-600" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold tracking-tight truncate">
        {primary}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{secondary}</div>
    </button>
  );
}

export function Leaderboard({ data }: { data: Dataset }) {
  const { params } = useRoute();

  const initialBenchmark = params.get("benchmark") ?? ALL_BENCHMARKS;
  const initialFamily = (params.get("family") as Family | null) ?? null;
  const initialYear = params.get("year") ?? "all";
  const initialCode = params.get("code") ?? "all";
  const initialQuery = params.get("q") ?? "";

  const [benchmark, setBenchmark] = React.useState<string>(initialBenchmark);
  const [familyFilter, setFamilyFilter] = React.useState<string>(initialFamily ?? "all");
  const [yearFilter, setYearFilter] = React.useState<string>(initialYear);
  const [codeFilter, setCodeFilter] = React.useState<string>(initialCode);
  const [query, setQuery] = React.useState<string>(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = React.useState<string>(initialQuery);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "fm", desc: true },
    { id: "score", desc: true },
  ]);
  const [openPaperId, setOpenPaperId] = React.useState<string | null>(null);

  // debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  // sync state to URL hash
  React.useEffect(() => {
    const next: Record<string, string> = {};
    if (benchmark !== ALL_BENCHMARKS) next.benchmark = benchmark;
    if (familyFilter !== "all") next.family = familyFilter;
    if (yearFilter !== "all") next.year = yearFilter;
    if (codeFilter !== "all") next.code = codeFilter;
    if (debouncedQuery) next.q = debouncedQuery;
    navigate("leaderboard", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmark, familyFilter, yearFilter, codeFilter, debouncedQuery]);

  const idx = React.useMemo(() => buildResultsIndex(data.results), [data.results]);
  const topBench = React.useMemo(() => topBenchmarks(idx.benchCounts, idx.benchModels, 10), [idx]);
  const topNames = React.useMemo(() => topBench.map((b) => b.name), [topBench]);

  const allRows = React.useMemo(
    () => computeRows(data.papers, benchmark, topNames, idx.bestPerPaperBench, idx.benchesPerPaper),
    [data.papers, benchmark, topNames, idx],
  );

  const years = React.useMemo(() => {
    const s = new Set<number>();
    for (const p of data.papers) if (p.year) s.add(p.year);
    return [...s].sort((a, b) => b - a);
  }, [data.papers]);

  const filteredRows = React.useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return allRows.filter((r) => {
      if (benchmark !== ALL_BENCHMARKS && r.score == null) return false;
      if (familyFilter !== "all" && r.family !== familyFilter) return false;
      if (yearFilter !== "all" && String(r.year ?? "") !== yearFilter) return false;
      if (codeFilter === "yes" && !r.paper.code_available) return false;
      if (codeFilter === "no" && r.paper.code_available) return false;
      if (q && !r.searchBlob.includes(q)) return false;
      return true;
    });
  }, [allRows, benchmark, familyFilter, yearFilter, codeFilter, debouncedQuery]);

  const columns = React.useMemo<ColumnDef<LeaderRow>[]>(() => {
    return [
      {
        id: "rank",
        header: "#",
        cell: ({ row, table }) => {
          const sorted = table.getSortedRowModel().rows;
          const idx = sorted.findIndex((r) => r.id === row.id);
          return (
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">
              {idx >= 0 ? idx + 1 : ""}
            </span>
          );
        },
        enableSorting: false,
        size: 36,
      },
      {
        id: "model",
        header: "Model",
        accessorFn: (r) => r.modelName,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Dialog
              open={openPaperId === r.paperId}
              onOpenChange={(o) => setOpenPaperId(o ? r.paperId : null)}
            >
              <DialogTrigger asChild>
                <button type="button" className="flex items-center gap-2.5 text-left min-w-0 group">
                  <ModelAvatar name={r.modelName} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium tracking-tight truncate group-hover:text-accent">
                      {r.modelName}
                    </div>
                    {r.baseArch ? (
                      <div className="text-[11px] text-muted-foreground truncate">{r.baseArch}</div>
                    ) : null}
                  </div>
                </button>
              </DialogTrigger>
              {openPaperId === r.paperId ? <PaperDrawer paper={r.paper} /> : null}
            </Dialog>
          );
        },
        enableSorting: true,
        sortingFn: (a, b) =>
          a.original.modelName.localeCompare(b.original.modelName, undefined, {
            sensitivity: "base",
          }),
      },
      {
        id: "family",
        header: "Family",
        accessorFn: (r) => r.family,
        cell: ({ row }) => <FamilyBadge family={row.original.family} />,
      },
      {
        id: "fm",
        header: "FM-claim",
        accessorFn: (r) => (r.paper.self_describes_fm ? 1 : 0),
        cell: ({ row }) =>
          row.original.paper.self_describes_fm ? (
            <Badge
              variant="accent"
              className="font-mono text-2xs"
              title="Paper explicitly self-describes as a foundation model in title, abstract, or contributions."
            >
              FM
            </Badge>
          ) : (
            <span className="text-muted-foreground/60 text-2xs font-mono">—</span>
          ),
        sortDescFirst: true,
      },
      {
        id: "params",
        header: "Params",
        accessorFn: (r) => r.params ?? -1,
        cell: ({ row }) => {
          const p = row.original.params;
          return (
            <span className="font-mono tabular-nums text-right block">
              {p == null ? "—" : `${fmtCompact(p * 1e6)}`}
            </span>
          );
        },
        sortDescFirst: true,
      },
      {
        id: "year",
        header: "Year",
        accessorFn: (r) => r.year ?? -1,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-right block">
            {row.original.year ?? "—"}
          </span>
        ),
        sortDescFirst: true,
      },
      {
        id: "score",
        header: "Score",
        accessorFn: (r) => (r.score == null ? Number.NEGATIVE_INFINITY : r.score),
        cell: ({ row }) => {
          const s = row.original.score;
          return (
            <span
              className={cn(
                "font-mono tabular-nums text-right block",
                s == null ? "text-muted-foreground/60" : "font-semibold",
              )}
            >
              {s == null ? "—" : s.toFixed(1)}
            </span>
          );
        },
        sortDescFirst: true,
      },
      {
        id: "benchmarks",
        header: "Benches",
        accessorFn: (r) => r.benchmarkCount,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-right block">
            {row.original.benchmarkCount}
          </span>
        ),
        sortDescFirst: true,
      },
      {
        id: "code",
        header: "Code",
        accessorFn: (r) => (r.paper.code_available ? 1 : 0),
        cell: ({ row }) => (
          <span className="flex justify-center">
            <BoolCell v={row.original.paper.code_available} />
          </span>
        ),
        sortDescFirst: true,
      },
      {
        id: "weights",
        header: "Weights",
        accessorFn: (r) => (r.paper.weights_available ? 1 : 0),
        cell: ({ row }) => (
          <span className="flex justify-center">
            <BoolCell v={row.original.paper.weights_available} />
          </span>
        ),
        sortDescFirst: true,
      },
      {
        id: "citations",
        header: "Cites",
        accessorFn: (r) => r.citations ?? -1,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-right block">
            {fmtCompact(row.original.citations)}
          </span>
        ),
        sortDescFirst: true,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original.paper;
          return (
            <div className="flex items-center justify-end gap-0.5">
              {p.arxiv_url ? (
                <a
                  href={p.arxiv_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  title="arXiv"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {p.code_url ? (
                <a
                  href={p.code_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  title="Code"
                >
                  <Github className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          );
        },
      },
    ];
  }, [openPaperId]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const benchmarkLabel = benchmark === ALL_BENCHMARKS ? "All benchmarks" : benchmark;
  const totalCount = filteredRows.length;
  const scoredCount = filteredRows.filter((r) => r.score != null).length;

  return (
    <div className="space-y-6">
      {/* Caveat banner — the paper's whole point is that this table is not a ranking. */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">These are reported numbers, not a ranking.</span>{" "}
          Rows aggregate model–benchmark numbers as printed in each paper, but the paper's audit
          found ≥10-point spreads between papers reporting on the same tuple. Use the{" "}
          <a href="#/findings" className="underline underline-offset-2 hover:text-foreground">Findings</a>{" "}
          tab to see why direct comparison is unsafe.
        </div>
      </div>

      {/* Section 1: Benchmark chip strip */}
      <div className="sticky top-14 z-20 -mx-6 px-6 bg-background/85 backdrop-blur border-b border-border">
        <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-thin">
          <BenchmarkChipCard
            active={benchmark === ALL_BENCHMARKS}
            label="Aggregate"
            primary="All benchmarks"
            secondary={`top-10 mean · ${data.papers.length} papers`}
            onClick={() => setBenchmark(ALL_BENCHMARKS)}
          />
          {topBench.map((b) => (
            <BenchmarkChipCard
              key={b.name}
              active={benchmark === b.name}
              label={`${b.models} models`}
              primary={b.name}
              secondary={`${fmt(b.n)} reported numbers`}
              onClick={() => setBenchmark(b.name)}
            />
          ))}
        </div>
      </div>

      {/* Header row above table: title + filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{benchmarkLabel}</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              {fmt(scoredCount)} scored · {fmt(totalCount)} models shown
              {benchmark === ALL_BENCHMARKS
                ? " · score = mean of best per-model scores across the top-10 most-evaluated benchmarks"
                : null}
            </p>
          </div>
          <a
            href="#/about"
            className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Open methodology <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models or paper titles…"
              className="pl-8"
            />
          </div>
          <FilterSelect
            icon={<Filter className="h-3 w-3" />}
            value={familyFilter}
            onChange={setFamilyFilter}
            placeholder="Family"
            options={[
              { value: "all", label: "All families" },
              ...FAMILIES.map((f) => ({ value: f, label: f })),
            ]}
          />
          <FilterSelect
            value={yearFilter}
            onChange={setYearFilter}
            placeholder="Year"
            options={[
              { value: "all", label: "All years" },
              ...years.map((y) => ({ value: String(y), label: String(y) })),
            ]}
          />
          <FilterSelect
            icon={<Code2 className="h-3 w-3" />}
            value={codeFilter}
            onChange={setCodeFilter}
            placeholder="Code"
            options={[
              { value: "all", label: "Code: all" },
              { value: "yes", label: "Code: yes" },
              { value: "no", label: "Code: no" },
            ]}
          />
        </div>
      </div>

      {/* Section 2: Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  className="text-2xs uppercase tracking-wider text-muted-foreground border-b border-border"
                >
                  {hg.headers.map((h) => {
                    const numeric = [
                      "params",
                      "year",
                      "score",
                      "benchmarks",
                      "citations",
                      "rank",
                    ].includes(h.column.id);
                    const center = ["code", "weights"].includes(h.column.id);
                    return (
                      <th
                        key={h.id}
                        className={cn(
                          "h-9 px-3 font-medium",
                          numeric && "text-right",
                          center && "text-center",
                          !numeric && !center && "text-left",
                          h.column.getCanSort() &&
                            "cursor-pointer select-none hover:text-foreground",
                        )}
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getCanSort() ? (
                            <span className="opacity-60">
                              {{ asc: "↑", desc: "↓" }[h.column.getIsSorted() as string] ?? ""}
                            </span>
                          ) : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-12 text-center text-muted-foreground text-[13px]"
                  >
                    No models match the current filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "h-[44px] border-b border-border/60 last:border-b-0 transition-colors",
                      "hover:bg-muted/40",
                      openPaperId === row.original.paperId && "bg-accent/5",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const numeric = [
                        "params",
                        "year",
                        "score",
                        "benchmarks",
                        "citations",
                        "rank",
                      ].includes(cell.column.id);
                      const center = ["code", "weights"].includes(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-3 align-middle",
                            numeric && "text-right font-mono tabular-nums",
                            center && "text-center",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Methodology card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Weight className="h-3.5 w-3.5 text-muted-foreground" /> How the score is computed
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              When <strong className="text-foreground">All benchmarks</strong> is selected, each
              model's score is the mean of its best per-benchmark scores across the top-10
              most-evaluated benchmarks ({topNames.slice(0, 5).join(", ")}
              {topNames.length > 5 ? ", …" : ""}), capped at 100. When a single benchmark is
              selected, score = the model's best reported number on that benchmark — no rescaling,
              no imputation.
            </CardDescription>
          </div>
          <a
            href="#/about"
            className="text-[12px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground shrink-0"
          >
            Full methodology <ExternalLink className="h-3 w-3" />
          </a>
        </CardHeader>
        <CardContent className="text-[12px] text-muted-foreground">
          <div className="flex flex-wrap gap-1.5">
            {topBench.map((b) => (
              <Badge key={b.name} variant="outline" className="font-normal">
                {b.name} <span className="ml-1 opacity-60">·{b.n}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  icon?: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-auto min-w-[140px]">
        <span className="inline-flex items-center gap-1.5 text-[12.5px]">
          {icon}
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
