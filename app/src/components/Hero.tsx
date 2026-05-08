import type { Dataset } from "@/lib/data";
import { navigate } from "@/lib/router";
import { fmt } from "@/lib/utils";
import { ArrowRight, FileText } from "lucide-react";
import { Button } from "./ui/Button";

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
}
function Kpi({ label, value, hint }: KpiProps) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-medium tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Hero({ data }: { data: Dataset }) {
  const c = data.critique;
  const benchAnalysis = c.analyses["2_benchmark_concentration"];
  const pretrainAnalysis = (c.analyses as Record<string, { n_unique_named_datasets?: number }>)[
    "8_pretrain_data_concentration"
  ];

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="hero-grid absolute inset-0 opacity-30" aria-hidden />
      <div className="container relative py-12 md:py-16">
        <h1 className="font-display text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Nobody Knows What's State-of-the-Art
          <br />
          in <span className="text-brand-500">Geospatial Foundation Models</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] md:text-base text-muted-foreground leading-relaxed">
          An interactive companion to the position paper. {fmt(c.n_papers)} audited GeoFM papers,{" "}
          {fmt(data.manifest.n_results)} reported numbers — and three measurements showing why none
          of them can be ranked from the published record. Papers don't share evaluation, copy
          baselines without re-running, and bundle architecture changes with new pretraining corpora
          so reported wins are indistinguishable from noise.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            variant="accent"
            onClick={() => navigate("leaderboard")}
            className="gap-2"
          >
            Open the leaderboard <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled
            className="gap-2 opacity-50 cursor-not-allowed"
          >
            <FileText className="h-4 w-4" /> Paper (Coming Soon)
          </Button>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Papers"
            value={fmt(c.n_papers)}
            hint={`${c.year_range[0]}–${c.year_range[1]}`}
          />
          <Kpi
            label="Reported numbers"
            value={fmt(data.manifest.n_results)}
            hint={`across ${fmt(benchAnalysis.n_unique_benchmarks)} benchmarks`}
          />
          <Kpi
            label="Benchmark Gini"
            value={benchAnalysis.gini.toFixed(2)}
            hint={`HHI ${benchAnalysis.hhi.toFixed(2)} — heavy concentration`}
          />
          <Kpi
            label="Pretraining datasets"
            value={fmt(pretrainAnalysis?.n_unique_named_datasets ?? 0)}
            hint="distinct corpora across the field"
          />
        </div>
      </div>
    </section>
  );
}
