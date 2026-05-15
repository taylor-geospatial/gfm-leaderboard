import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Dataset } from "@/lib/data";
import { navigate } from "@/lib/router";
import type { CheckStatus } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Check, CircleHelp, X } from "lucide-react";

/**
 * Findings — the landing page. Leads with the paper's punchline so a first-time
 * visitor walks away knowing (a) why a leaderboard would be misleading, (b) what
 * the four headline measurements are, and (c) the R1–R6 / C1–C5 checklist a
 * reviewer can paste into a review form.
 */
export function Findings({ data }: { data: Dataset }) {
  const c = data.critique;
  const div = c.analyses["1_reported_number_divergence"];
  const bench = c.analyses["2_benchmark_concentration"];
  const cherry = c.analyses["3_cherry_picking"];
  const pretrain = c.analyses["8_pretrain_data_concentration"] as unknown as {
    n_unique_named_datasets: number;
    n_papers_in_unique_full_set?: number;
    n_papers_with_extractable_pretrain?: number;
  };

  const totalPapers = c.n_papers;
  const cherryPct = ((cherry.n_papers_with_zero_overlap / cherry.n_total) * 100).toFixed(0);
  const uniquePretrainPct =
    pretrain.n_papers_in_unique_full_set && pretrain.n_papers_with_extractable_pretrain
      ? Math.round(
          (pretrain.n_papers_in_unique_full_set /
            pretrain.n_papers_with_extractable_pretrain) *
            100,
        )
      : null;

  // Corpus-wide pass rates per criterion.
  const scoreSummary: { id: "c1" | "c2" | "c3" | "c4" | "c5"; pass: number; fail: number; unknown: number }[] = (
    ["c1", "c2", "c3", "c4", "c5"] as const
  ).map((id) => {
    let pass = 0;
    let fail = 0;
    let unknown = 0;
    for (const s of Object.values(data.scorecards)) {
      if (s[id] === "pass") pass += 1;
      else if (s[id] === "fail") fail += 1;
      else unknown += 1;
    }
    return { id, pass, fail, unknown };
  });

  return (
    <div className="space-y-12">
      {/* Four measurement cards */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Four measurements from {fmt(totalPapers)} papers</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground max-w-2xl">
          Each card answers one question the paper raises about the literature. Numbers update with
          the live corpus; click through for methodology.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <MeasurementCard
            kicker="Divergence"
            headline={`${div.n_strict_spread_ge_10}`}
            unit="model–benchmark tuples disagree by ≥10 points"
            body={`Across papers reporting on the same model, benchmark and protocol, ${div.n_strict_spread_ge_10} tuples scatter by ten points or more. The worst case is a ${div.strict_spread_summary.max.toFixed(1)}-point spread on the same number.`}
            cta="See dot plot"
            route={() => navigate("insights", { fig: "divergence" })}
          />
          <MeasurementCard
            kicker="Cherry-picking"
            headline={`${cherryPct}%`}
            unit="of papers have zero overlap with the top-10 benchmarks"
            body={`${cherry.n_papers_with_zero_overlap} out of ${cherry.n_total} papers do not share a single benchmark with the field-wide top-10. Each paper picks a different evaluation neighborhood.`}
            cta="See histogram"
            route={() => navigate("insights", { fig: "cherry_picking" })}
          />
          <MeasurementCard
            kicker="Benchmark concentration"
            headline={bench.gini.toFixed(2)}
            unit="Gini coefficient across benchmark usage"
            body={`The field has spawned ${fmt(bench.n_unique_benchmarks)} distinct benchmarks but only a thin head is reused. HHI ${bench.hhi.toFixed(2)} — usage is not concentrating.`}
            cta="See head + tail"
            route={() => navigate("insights", { fig: "benchmark_concentration" })}
          />
          <MeasurementCard
            kicker="Pretraining confound"
            headline={uniquePretrainPct != null ? `${uniquePretrainPct}%` : `${fmt(pretrain.n_unique_named_datasets)}`}
            unit={
              uniquePretrainPct != null
                ? "of papers pretrain on a configuration no other paper uses"
                : "distinct pretraining datasets across the field"
            }
            body={`When every paper's pretraining recipe is unique, an apparent architecture win can be a corpus win. ${fmt(pretrain.n_unique_named_datasets)} distinct named datasets across the corpus.`}
            cta="See concentration"
            route={() => navigate("insights", { fig: "pretrain_data_concentration" })}
          />
        </div>
      </section>

      {/* R1–R6 */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Six recommendations for the community</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground max-w-2xl">
          The fixes that would let the next paper actually compare against the previous one.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {RECS.map((r) => (
            <RecCard key={r.id} id={r.id} title={r.title} body={r.body} />
          ))}
        </div>
      </section>

      {/* C1–C5 reviewer checklist */}
      <section>
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Reviewer checklist (C1–C5)</h2>
            <p className="mt-1 text-[13.5px] text-muted-foreground max-w-2xl">
              Five questions a reviewer can answer in under a minute. Bars show how the {fmt(totalPapers)}
              -paper corpus would score on each one today.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {CHECKS.map((ch) => {
            const s = scoreSummary.find((x) => x.id === ch.id)!;
            const denom = s.pass + s.fail + s.unknown || 1;
            return (
              <div key={ch.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="max-w-2xl">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {ch.id.toUpperCase()} · ties to {ch.r}
                    </div>
                    <div className="mt-1 text-[14.5px] font-medium text-foreground">{ch.q}</div>
                    <div className="mt-1 text-[12.5px] text-muted-foreground">{ch.body}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-2xl font-medium tabular-nums">
                      {Math.round((s.pass / denom) * 100)}%
                    </div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                      corpus pass rate
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-emerald-500/80" style={{ width: `${(s.pass / denom) * 100}%` }} />
                  <div className="bg-rose-500/70" style={{ width: `${(s.fail / denom) * 100}%` }} />
                  <div className="bg-muted-foreground/30" style={{ width: `${(s.unknown / denom) * 100}%` }} />
                </div>
                <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground tabular-nums">
                  <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />{s.pass}</span>
                  <span className="flex items-center gap-1"><X className="h-3 w-3 text-rose-600" />{s.fail}</span>
                  <span className="flex items-center gap-1"><CircleHelp className="h-3 w-3" />{s.unknown}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => navigate("papers")}
            className="inline-flex items-center gap-1.5 text-[13px] text-foreground hover:text-brand-500 transition-colors"
          >
            See every paper's C1–C5 row <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* Footer caveat */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> About the "leaderboard"
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] text-muted-foreground leading-relaxed">
          The <button type="button" onClick={() => navigate("leaderboard")} className="underline underline-offset-2 hover:text-foreground">Reported numbers</button>{" "}
          tab shows the {fmt(data.manifest.n_results)} model–benchmark numbers as printed in each
          paper. It is not a ranking — see the four measurements above for why aggregating these
          rows is unsafe.
        </CardContent>
      </Card>
    </div>
  );
}

function MeasurementCard({
  kicker,
  headline,
  unit,
  body,
  cta,
  route,
}: {
  kicker: string;
  headline: string;
  unit: string;
  body: string;
  cta: string;
  route: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{kicker}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="font-mono text-[40px] leading-none font-medium tracking-tight tabular-nums">
          {headline}
        </div>
        <div className="text-[12.5px] text-muted-foreground max-w-[16ch] leading-snug">{unit}</div>
      </div>
      <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">{body}</p>
      <button
        type="button"
        onClick={route}
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground hover:text-brand-500 transition-colors"
      >
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RecCard({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{id}</div>
      <div className="mt-0.5 text-[14.5px] font-medium text-foreground">{title}</div>
      <div className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{body}</div>
    </div>
  );
}

const RECS = [
  {
    id: "R1",
    title: "Release weights under a named license",
    body: "By camera-ready, or explicitly state the constraint that prevents release. Reviewers should flag missing artifacts before acceptance.",
  },
  {
    id: "R2",
    title: "Evaluate on a shared core set",
    body: "Pick ≥3 benchmarks from a published core (EuroSAT, AID, BigEarthNet-S2, Potsdam, OSCD, …) so cross-paper comparison is even possible.",
  },
  {
    id: "R3",
    title: "Annotate every copied baseline",
    body: "Mark each baseline row as (re-run) or (copied) and cite the source's protocol. Mixing the two is the single biggest source of divergence.",
  },
  {
    id: "R4",
    title: "Report seed variability",
    body: "Mean±std over ≥3 seeds on headline numbers; or explicitly note single-run when that's all you have. A point estimate without variance is not a comparison.",
  },
  {
    id: "R5",
    title: "Adopt a shared evaluation harness",
    body: "Versioned task definitions, public CI checks. The handful of recent benchmarks (PANGAEA, GEO-Bench, PhilEO Bench) are a starting point.",
  },
  {
    id: "R6",
    title: "Disentangle data from architecture",
    body: "Run one ablation that fixes pretraining data and varies the new method on a canonical public corpus. Otherwise data wins masquerade as method wins.",
  },
];

const CHECKS: { id: "c1" | "c2" | "c3" | "c4" | "c5"; r: string; q: string; body: string }[] = [
  {
    id: "c1",
    r: "R1",
    q: "Are weights released under a named license, or constraints stated?",
    body: "Released or explicitly constrained = pass. Code without weights = fail.",
  },
  {
    id: "c2",
    r: "R2",
    q: "Does the paper evaluate on ≥3 shared-core benchmarks?",
    body: "Counts overlap with the field's top-10 most-used benchmarks.",
  },
  {
    id: "c3",
    r: "R3",
    q: "Are baseline rows annotated as rerun or copied with source?",
    body: "Detects 'we re-ran', 'numbers from', 'following the protocol of', etc., in the PDF text.",
  },
  {
    id: "c4",
    r: "R4",
    q: "Are headline numbers reported with mean±std (or single-run notation)?",
    body: "Detects ±, 'standard deviation', '3 seeds', 'single-run' in the PDF text.",
  },
  {
    id: "c5",
    r: "R6",
    q: "Does the paper compare on shared pretraining data?",
    body: "Detects 'same pretraining', 'fair comparison', 'controlled comparison'.",
  },
];

export function CheckBadge({ status, label }: { status: CheckStatus; label: string }) {
  const Icon = status === "pass" ? Check : status === "fail" ? X : CircleHelp;
  return (
    <span
      title={`${label}: ${status}`}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums",
        status === "pass"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : status === "fail"
            ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
