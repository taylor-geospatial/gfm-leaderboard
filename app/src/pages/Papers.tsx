import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
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
import type { Paper } from "@/lib/types";
import { cn, fmt, fmtCompact, pdfKey } from "@/lib/utils";
import {
  BookOpen,
  Check,
  ChevronRight,
  Cpu,
  ExternalLink,
  FlaskConical,
  Github,
  Search,
} from "lucide-react";
import * as React from "react";

const FAMILY_CHIP: Record<Family, string> = {
  MAE: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  Contrastive: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  VLM: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  Generative: "bg-chart-6/15 text-chart-6 border-chart-6/30",
  JEPA: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  Other: "bg-muted text-muted-foreground border-border",
};

type SortKey = "fm-cited" | "recent" | "cited" | "benches" | "az";

interface PaperCardData {
  paper: Paper;
  family: Family;
  modelName: string;
  benchCount: number;
  searchBlob: string;
}

function FamilyChip({ family }: { family: Family }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium tracking-tight",
        FAMILY_CHIP[family],
      )}
    >
      {family}
    </span>
  );
}

function MetricCell({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span
        className={cn(
          "text-[13px] font-semibold tracking-tight tabular-nums truncate",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </span>
    </div>
  );
}

function PaperCard({
  data,
  onOpen,
}: {
  data: PaperCardData;
  onOpen: () => void;
}) {
  const p = data.paper;
  const datasets = p.pretraining_data.datasets ?? [];
  const sensors = p.pretraining_data.sensors ?? [];
  const params =
    p.architecture.params_millions != null
      ? `${fmtCompact(p.architecture.params_millions * 1e6)}`
      : "—";

  return (
    <Card
      onClick={onOpen}
      className="hover:shadow-pop transition-shadow cursor-pointer group focus-within:ring-2 focus-within:ring-ring"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="p-4 flex flex-col gap-2.5">
        {/* Header: model name + year */}
        <div className="flex items-start justify-between gap-2">
          <div className="text-[15px] font-semibold tracking-tight leading-tight truncate min-w-0">
            {data.modelName}
          </div>
          {p.year != null ? (
            <Badge variant="outline" className="shrink-0 font-mono tabular-nums">
              {p.year}
            </Badge>
          ) : null}
        </div>

        {/* Title */}
        <div className="text-[12.5px] text-muted-foreground line-clamp-2 leading-snug">
          {p.title ?? "—"}
        </div>

        {/* Metric row */}
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pt-0.5">
          <MetricCell label="cites" value={fmtCompact(p.citation_count)} />
          <MetricCell label="results" value={fmt(p.n_results)} />
          <MetricCell label="params, M" value={params} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          <FamilyChip family={data.family} />
          {p.architecture.backbone ? (
            <Badge variant="outline" className="font-normal">
              {p.architecture.backbone}
            </Badge>
          ) : null}
          {sensors.slice(0, 2).map((s) => (
            <Badge key={`s-${s}`} variant="outline" className="font-normal">
              {s}
            </Badge>
          ))}
          {datasets.slice(0, 2).map((d) => (
            <Badge key={`d-${d}`} variant="outline" className="font-normal">
              {d}
            </Badge>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/60 mt-0.5">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {p.code_available ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-600" />
                code
              </span>
            ) : null}
            {p.weights_available ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-600" />
                weights
              </span>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
            Open <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Card>
  );
}

function KPI({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 min-w-0">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold tracking-tight font-mono tabular-nums truncate">
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-2xs uppercase tracking-wider text-muted-foreground mb-1.5">{children}</h4>
  );
}

function DL({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-y-1 gap-x-3 text-[12.5px]">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-foreground min-w-0 break-words">{v ?? "—"}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ChipWrap({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return <div className="text-[12.5px] text-muted-foreground">—</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: badge items may not be unique strings
        <Badge key={`${it}-${i}`} variant="outline" className="font-normal">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function YesNoBadge({ v }: { v: boolean | null | undefined }) {
  if (v == null) return <Badge variant="outline">—</Badge>;
  return v ? <Badge variant="success">Yes</Badge> : <Badge variant="outline">No</Badge>;
}

function PaperDetail({ paper }: { paper: Paper }) {
  const family = classifyFamily(paper);
  const [showAbstract, setShowAbstract] = React.useState(false);
  const abstract = paper.abstract ?? "";
  const ABSTRACT_CUTOFF = 240;
  const abstractIsLong = abstract.length > ABSTRACT_CUTOFF;

  const tldr = paper.tldr ?? paper.key_contribution ?? null;

  return (
    <DialogContent side="right" className="overflow-y-auto">
      <div className="px-6 pt-6 pb-10 space-y-5">
        {/* 1. Header */}
        <div className="pr-8 space-y-2">
          <DialogTitle className="text-[20px] font-semibold tracking-tight leading-tight">
            {paper.model_name ?? paper.title ?? paper.id}
          </DialogTitle>
          <div className="text-[12.5px] text-muted-foreground leading-snug">
            {paper.title ?? "—"}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <FamilyChip family={family} />
            {paper.year != null ? <Badge variant="outline">{paper.year}</Badge> : null}
            {paper.venue ? <Badge variant="outline">{paper.venue}</Badge> : null}
          </div>
        </div>

        {/* 2. Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KPI label="Citations" value={fmtCompact(paper.citation_count)} />
          <KPI label="Results" value={fmt(paper.n_results)} />
          <KPI
            label="Params"
            value={
              paper.architecture.params_millions != null
                ? fmtCompact(paper.architecture.params_millions * 1e6)
                : "—"
            }
            icon={<Cpu className="h-3 w-3" />}
          />
          <KPI
            label="GPUs"
            value={fmt(paper.compute.gpu_count_max)}
            icon={<FlaskConical className="h-3 w-3" />}
          />
        </div>

        {/* 3. TL;DR */}
        {tldr ? (
          <div>
            <SectionHeader>TL;DR</SectionHeader>
            <p className="text-[13px] leading-relaxed text-foreground">{tldr}</p>
          </div>
        ) : null}

        {/* 4. Abstract */}
        {abstract ? (
          <div>
            <SectionHeader>Abstract</SectionHeader>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {showAbstract || !abstractIsLong
                ? abstract
                : `${abstract.slice(0, ABSTRACT_CUTOFF).trimEnd()}…`}
            </p>
            {abstractIsLong ? (
              <button
                type="button"
                onClick={() => setShowAbstract((s) => !s)}
                className="mt-1 text-[12px] text-accent hover:underline underline-offset-2"
              >
                {showAbstract ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* 5. Architecture */}
        <div>
          <SectionHeader>Architecture</SectionHeader>
          <DL
            rows={[
              ["Backbone", paper.architecture.backbone ?? "—"],
              ["Type", paper.architecture.type ?? "—"],
              [
                "Params",
                paper.architecture.params_millions != null
                  ? `${fmt(paper.architecture.params_millions, 1)}M`
                  : "—",
              ],
            ]}
          />
        </div>

        {/* 6. Pretraining */}
        <div>
          <SectionHeader>Pretraining</SectionHeader>
          <DL
            rows={[
              ["Method", paper.pretraining.method ?? "—"],
              ["Objective", paper.pretraining.objective ?? "—"],
              [
                "Self-supervised",
                <YesNoBadge key="self-supervised" v={paper.pretraining.is_self_supervised} />,
              ],
              [
                "Vision-language",
                <YesNoBadge key="vision-language" v={paper.pretraining.is_vision_language} />,
              ],
            ]}
          />
        </div>

        {/* 7. Pretraining data */}
        <div>
          <SectionHeader>Pretraining data</SectionHeader>
          <div className="space-y-2.5">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Datasets</div>
              <ChipWrap items={paper.pretraining_data.datasets} />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Sensors</div>
              <ChipWrap items={paper.pretraining_data.sensors} />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Modalities</div>
              <ChipWrap items={paper.pretraining_data.modalities} />
            </div>
            <DL
              rows={[
                ["Resolution", paper.pretraining_data.spatial_resolution ?? "—"],
                ["Coverage", paper.pretraining_data.geographic_coverage ?? "—"],
                [
                  "Num images",
                  paper.pretraining_data.num_images != null
                    ? String(paper.pretraining_data.num_images)
                    : "—",
                ],
              ]}
            />
          </div>
        </div>

        {/* 8. Downstream */}
        <div>
          <SectionHeader>Downstream</SectionHeader>
          <div className="space-y-2.5">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Tasks</div>
              <ChipWrap items={paper.downstream_tasks} />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1">Datasets</div>
              <ChipWrap items={paper.downstream_datasets} />
            </div>
          </div>
        </div>

        {/* 9. Affiliations */}
        {paper.affiliations && paper.affiliations.length > 0 ? (
          <div>
            <SectionHeader>Affiliations</SectionHeader>
            <ul className="text-[12.5px] text-foreground space-y-0.5">
              {paper.affiliations.slice(0, 5).map((a, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: affiliations may not be unique
                <li key={`${a}-${i}`} className="truncate">
                  {a}
                </li>
              ))}
              {paper.affiliations.length > 5 ? (
                <li className="text-muted-foreground">+{paper.affiliations.length - 5} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {/* 10. Links */}
        <div>
          <SectionHeader>Links</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {paper.arxiv_url ? (
              <Button asChild size="sm" variant="accent">
                <a
                  href={paper.arxiv_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="gap-1.5"
                >
                  <BookOpen className="h-3.5 w-3.5" /> arXiv
                  <ExternalLink className="h-3 w-3 opacity-70" />
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
              <Button asChild size="sm" variant="outline">
                <a
                  href={paper.s2_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="gap-1.5"
                >
                  Semantic Scholar
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

export function Papers({ data }: { data: Dataset }) {
  const { params } = useRoute();

  const initialQuery = params.get("q") ?? "";
  const initialYear = params.get("year") ?? "all";
  const initialFamily = params.get("family") ?? "all";
  const initialSort = (params.get("sort") as SortKey | null) ?? "fm-cited";
  const openId = params.get("paper");

  const [query, setQuery] = React.useState<string>(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = React.useState<string>(initialQuery);
  const [yearFilter, setYearFilter] = React.useState<string>(initialYear);
  const [familyFilter, setFamilyFilter] = React.useState<string>(initialFamily);
  const [sort, setSort] = React.useState<SortKey>(initialSort);

  // debounce query
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Build benchmark counts per paper for the "Most benchmarks" sort
  const benchCountByPaper = React.useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of data.results) {
      const pid = r.pdf_filename?.trim();
      const b = r.benchmark_name?.trim();
      if (!pid || !b) continue;
      if (!m.has(pid)) m.set(pid, new Set());
      m.get(pid)!.add(b);
    }
    const counts = new Map<string, number>();
    for (const [k, v] of m) counts.set(k, v.size);
    return counts;
  }, [data.results]);

  // Annotated paper list — family + searchable blob memoized once
  const cards = React.useMemo<PaperCardData[]>(() => {
    return data.papers.map((p) => {
      const family = classifyFamily(p);
      const modelName = p.model_name ?? p.title ?? p.id;
      const blob = [p.title, p.model_name, p.key_contribution, p.abstract]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return {
        paper: p,
        family,
        modelName,
        benchCount: benchCountByPaper.get(pdfKey(p.id)) ?? 0,
        searchBlob: blob,
      };
    });
  }, [data.papers, benchCountByPaper]);

  // Years dropdown
  const years = React.useMemo(() => {
    const s = new Set<number>();
    for (const p of data.papers) if (p.year != null) s.add(p.year);
    return [...s].sort((a, b) => b - a);
  }, [data.papers]);

  // Sync URL — preserve `paper` param if drawer is open
  // biome-ignore lint/correctness/useExhaustiveDependencies: openId intentionally excluded to avoid closing drawer on filter change
  React.useEffect(() => {
    const next: Record<string, string> = {};
    if (debouncedQuery) next.q = debouncedQuery;
    if (yearFilter !== "all") next.year = yearFilter;
    if (familyFilter !== "all") next.family = familyFilter;
    if (sort !== "fm-cited") next.sort = sort;
    if (openId) next.paper = openId;
    navigate("papers", next);
  }, [debouncedQuery, yearFilter, familyFilter, sort]);

  const filtered = React.useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const out = cards.filter((c) => {
      if (yearFilter !== "all" && String(c.paper.year ?? "") !== yearFilter) return false;
      if (familyFilter !== "all" && c.family !== familyFilter) return false;
      if (q && !c.searchBlob.includes(q)) return false;
      return true;
    });
    out.sort((a, b) => {
      switch (sort) {
        case "fm-cited": {
          // FM-claimed papers first, then most-cited within each group.
          const af = a.paper.self_describes_fm ? 1 : 0;
          const bf = b.paper.self_describes_fm ? 1 : 0;
          if (af !== bf) return bf - af;
          return (b.paper.citation_count ?? -1) - (a.paper.citation_count ?? -1);
        }
        case "recent":
          return (
            (b.paper.year ?? Number.NEGATIVE_INFINITY) - (a.paper.year ?? Number.NEGATIVE_INFINITY)
          );
        case "cited":
          return (b.paper.citation_count ?? -1) - (a.paper.citation_count ?? -1);
        case "benches":
          return b.benchCount - a.benchCount;
        case "az":
          return a.modelName.localeCompare(b.modelName, undefined, { sensitivity: "base" });
      }
    });
    return out;
  }, [cards, debouncedQuery, yearFilter, familyFilter, sort]);

  const totalCount = data.papers.length;
  const filteredCount = filtered.length;

  const openPaper = openId ? (data.byPaperId.get(openId) ?? null) : null;

  const clearFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setYearFilter("all");
    setFamilyFilter("all");
    setSort("recent");
  };

  return (
    <div className="space-y-5">
      {/* Sticky filter bar */}
      <div className="sticky top-14 z-20 -mx-6 px-6 bg-background/85 backdrop-blur border-b border-border">
        <div className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, model, abstract…"
              className="pl-8"
            />
          </div>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-auto min-w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={familyFilter} onValueChange={setFamilyFilter}>
            <SelectTrigger className="w-auto min-w-[150px]">
              <SelectValue placeholder="Family" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All families</SelectItem>
              {FAMILIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-auto min-w-[170px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fm-cited">FM-claim · most cited</SelectItem>
              <SelectItem value="cited">Most cited</SelectItem>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="benches">Most benchmarks</SelectItem>
              <SelectItem value="az">A → Z</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto text-[12px] text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{fmt(filteredCount)}</span> of{" "}
            {fmt(totalCount)} papers
          </div>
        </div>
      </div>

      {/* Grid / empty state */}
      {filteredCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 py-16 px-6 text-center">
          <p className="text-[13px] text-muted-foreground">
            No papers match these filters. Try clearing some?
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <PaperCard
              key={c.paper.id}
              data={c}
              onOpen={() => {
                const next: Record<string, string> = { paper: c.paper.id };
                if (debouncedQuery) next.q = debouncedQuery;
                if (yearFilter !== "all") next.year = yearFilter;
                if (familyFilter !== "all") next.family = familyFilter;
                if (sort !== "fm-cited") next.sort = sort;
                navigate("papers", next);
              }}
            />
          ))}
        </div>
      )}

      {/* URL-driven detail drawer */}
      <Dialog
        open={openPaper != null}
        onOpenChange={(o) => {
          if (!o) {
            const next: Record<string, string> = {};
            if (debouncedQuery) next.q = debouncedQuery;
            if (yearFilter !== "all") next.year = yearFilter;
            if (familyFilter !== "all") next.family = familyFilter;
            if (sort !== "fm-cited") next.sort = sort;
            navigate("papers", next);
          }
        }}
      >
        {openPaper ? <PaperDetail paper={openPaper} /> : null}
      </Dialog>
    </div>
  );
}
