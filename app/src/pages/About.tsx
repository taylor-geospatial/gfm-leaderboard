import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Dataset } from "@/lib/data";
import { fmt } from "@/lib/utils";

export function About({ data }: { data: Dataset }) {
  const c = data.critique;
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8">
      <article className="prose-tight max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">About this leaderboard</h2>
        <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
          This site is the interactive companion to the position paper{" "}
          <em>"Nobody Knows What's State-of-the-Art in Geospatial Foundation Models"</em>. The paper
          argues a coordination problem the community can fix: GeoFM papers don't share evaluation,
          copy baselines without re-running, and bundle architecture changes with new pretraining
          corpora — so reported leaderboard wins are indistinguishable from noise. The corpus of{" "}
          {fmt(c.n_papers)} papers and {fmt(data.manifest.n_results)} reported numbers is fully
          browsable here.
        </p>

        <h3 className="mt-8 text-lg font-semibold">Three measurements</h3>
        <ol className="mt-3 space-y-3 text-[14px] text-muted-foreground list-decimal pl-5 leading-relaxed">
          <li>
            <strong className="text-foreground">Benchmarks: head + tail.</strong> The corpus reports
            on hundreds of distinct benchmarks. The top-3 cover under 10% of evaluations; ~41% of
            papers have zero overlap with the field-wide top-10.
          </li>
          <li>
            <strong className="text-foreground">Reported-number divergence.</strong> Same model,
            same benchmark, same nominal protocol — different paper reports differ by tens of
            points. Scale-MAE on NWPU-RESISC45 linear probe: 33.0 vs. 89.6.
          </li>
          <li>
            <strong className="text-foreground">Pretraining-data confound.</strong> 125/150 papers
            (83%) pretrain on a configuration nobody else uses; new architectures and new corpora
            are bundled with no ablation that fixes one and varies the other.
          </li>
        </ol>

        <h3 className="mt-8 text-lg font-semibold">Five recommendations</h3>
        <ol className="mt-3 space-y-2 text-[14px] text-muted-foreground list-decimal pl-5 leading-relaxed">
          <li>
            <strong className="text-foreground">R1.</strong> Report on a shared core evaluation set
            (EuroSAT, AID, BigEarthNet-S2, Sen1Floods11, Potsdam, OSCD as a starting point).
          </li>
          <li>
            <strong className="text-foreground">R2.</strong> Annotate every copied baseline number
            as <em>(re-run)</em> or <em>(copied)</em> with the source's protocol restated.
          </li>
          <li>
            <strong className="text-foreground">R3.</strong> Disentangle pretraining corpus from
            architecture — at least one ablation on a canonical public choice (SSL4EO-S12,
            MillionAID, fMoW, MajorTOM-Core).
          </li>
          <li>
            <strong className="text-foreground">R4.</strong> Report mean±std over ≥3 seeds on
            headline benchmarks.
          </li>
          <li>
            <strong className="text-foreground">R5.</strong> Release weights under a named license
            by camera-ready (51% of the corpus currently releases none).
          </li>
        </ol>

        <h3 className="mt-8 text-lg font-semibold">Methodology</h3>
        <ol className="mt-3 space-y-3 text-[14px] text-muted-foreground list-decimal pl-5 leading-relaxed">
          <li>
            <strong className="text-foreground">Corpus.</strong> Snowball search seeded from prior
            GeoFM surveys plus an OpenAlex / Semantic Scholar citation-graph expansion and a
            strict-keyword sweep over 2019–2023 self-supervised remote-sensing papers.{" "}
            {fmt(c.n_papers)} papers in {c.year_range[0]}–{c.year_range[1]}.
          </li>
          <li>
            <strong className="text-foreground">Result extraction.</strong> Per-paper LLM extraction
            over LaTeX sources (markdown fallback for the rest), normalized to canonical (model,
            benchmark, metric, evaluation protocol) tuples after alias canonicalization.
          </li>
          <li>
            <strong className="text-foreground">Metadata.</strong> Citation graphs and venue from
            Semantic Scholar; institutional affiliation resolved through OpenAlex.
          </li>
        </ol>

        <h3 className="mt-8 text-lg font-semibold">Citing</h3>
        <pre className="mt-3 rounded-md border border-border bg-muted/30 p-4 text-[12px] font-mono leading-6 overflow-x-auto whitespace-pre-wrap">
          {`@article{corley2026nobodyknows,
  title  = {Nobody Knows What's State-of-the-Art in Geospatial Foundation Models},
  author = {Corley, Isaac and others},
  journal = {arXiv preprint},
  year = {2026}
}`}
        </pre>
      </article>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Acknowledgements</CardTitle>
          </CardHeader>
          <CardContent className="text-[12.5px] text-muted-foreground space-y-2">
            <p>
              Built at the{" "}
              <a
                href="https://taylorgeospatial.org"
                target="_blank"
                rel="noreferrer noopener"
                className="underline-offset-2 hover:underline text-foreground"
              >
                Taylor Geospatial
              </a>
              . Citation and embedding data via Semantic Scholar; institutional resolution via
              OpenAlex; map tiles via OpenFreeMap.
            </p>
            <div className="flex gap-2 pt-1">
              <Badge variant="outline">D3 + Recharts</Badge>
              <Badge variant="outline">MapLibre</Badge>
              <Badge variant="outline">TanStack Table</Badge>
            </div>
            <span className="inline-flex items-center gap-1 text-muted-foreground italic">
              Paper coming soon
            </span>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
