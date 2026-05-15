#!/usr/bin/env node
// Transform the canonical corpus in <repo>/data into the public files the app expects in <repo>/app/data.
// Inputs:
//   ../data/extracted_info.jsonl       (per-paper structured extraction; canonical paper set)
//   ../data/reported_numbers.jsonl     (per-result reported metrics)
//   ../data/cache/paper_lookups.json   (OpenAlex enrichment — used for affiliations + abstract only)
//   ../data/cache/citations.json       (Semantic Scholar fresh: citationCount, venue, OA, externalIds)
//   ../data/cache/text_features.json   (compute / limitations features)
//   ../data/meta/critique.json         (corpus-level analyses)
// Outputs:
//   ./data/papers.json
//   ./data/results.csv
//   ./data/manifest.json
//   ./data/meta/critique.json
//   ./data/meta/benchmark_heatmap.json

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(APP, "..");
const SRC = resolve(REPO, "data");
const OUT = resolve(APP, "data");

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function pdfKey(id) {
  const stem = id.endsWith(".pdf") ? id.slice(0, -4) : id;
  return `${stem.slice(0, 80)}.pdf`;
}

// reported_numbers.jsonl uses different (sometimes shorter) pdf filenames than extracted_info.jsonl
// for a handful of papers. Map each truncated reported-side key to its canonical extracted-side id.
function buildKeyAlias(extractedIds) {
  const byTruncated = new Map();
  for (const id of extractedIds) byTruncated.set(pdfKey(id), id);
  // Hand-curated aliases for the cases where reported_numbers chose a shorter filename
  // (verified against the LaTeX source — same paper, different export).
  const manual = {
    "DOFA_tables1-5.pdf": "DOFA_Neural_Plasticity-Inspired_Foundation_Model_for_Observing_the_Earth_Crossing_Modalities.pdf",
    "S2MAE.pdf": "S2MAE_A_Spatial-Spectral_Pretraining_Foundation_Model_for_Spectral_Remote_Sensing_Data.pdf",
    "IaI-SimCLR.pdf": "IaI-SimCLR_Multi-Modal_Multi-Objective_Contrastive_Learning_for_Sentinel-12_Imagery.pdf",
  };
  for (const [shortKey, longId] of Object.entries(manual)) {
    byTruncated.set(shortKey, longId);
    byTruncated.set(pdfKey(shortKey), longId);
  }
  return byTruncated;
}

// Some papers report metrics in 0-1 fractional form (e.g., GSC, DeepAndes, RS-DFM all use mAP=0.82).
// Most of the corpus uses 0-100 percentages. Normalize fractions to percentages for percent-style
// metrics so the leaderboard can sort consistently. Leaves loss/RMSE/MSE alone.
const PERCENT_METRICS = new Set([
  "accuracy", "top5_accuracy", "miou", "iou", "f1", "f1_score",
  "precision", "recall", "map", "mean_average_precision", "dice", "dice_score",
  "oa", "overall_accuracy", "aa", "kappa",
]);
function normalizeMetric(metricName, rawValue) {
  const n = (metricName || "").toLowerCase();
  const v = typeof rawValue === "number" ? rawValue : Number.parseFloat(rawValue);
  if (!Number.isFinite(v)) return { value: rawValue, normalized: false };
  if (PERCENT_METRICS.has(n) && v > 0 && v < 1) {
    return { value: v * 100, normalized: true };
  }
  return { value: v, normalized: false };
}

function decodeAbstractInvertedIndex(idx) {
  if (!idx || typeof idx !== "object") return null;
  const positions = [];
  for (const [word, ps] of Object.entries(idx)) {
    for (const p of ps) positions.push([p, word]);
  }
  if (positions.length === 0) return null;
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(([, w]) => w).join(" ");
}

function deriveVenue(work) {
  if (!work) return null;
  const loc = work.primary_location;
  return loc?.source?.display_name ?? null;
}

function deriveAffiliations(work) {
  if (!work) return [];
  const seen = new Set();
  const out = [];
  for (const a of work.authorships ?? []) {
    for (const inst of a.institutions ?? []) {
      const name = inst?.display_name;
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

function deriveArxivId(lookup) {
  if (!lookup) return null;
  if (lookup.arxiv_from_pdf) return lookup.arxiv_from_pdf;
  const ids = lookup.work?.ids ?? {};
  // OpenAlex "ids" sometimes carries an arxiv URL, but no guarantees.
  for (const k of Object.keys(ids)) {
    if (k.toLowerCase().includes("arxiv")) {
      const v = ids[k];
      const m = typeof v === "string" ? v.match(/(\d{4}\.\d{4,5})/) : null;
      if (m) return m[1];
    }
  }
  return null;
}

function deriveS2(work) {
  const s2Url = work?.ids?.mag ? null : null; // OpenAlex doesn't include S2; leave null
  return { id: null, url: s2Url };
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main() {
  const extracted = readJsonl(resolve(SRC, "extracted_info.jsonl"));
  const reported = readJsonl(resolve(SRC, "reported_numbers.jsonl"));
  const lookups = readJson(resolve(SRC, "cache/paper_lookups.json"));
  const features = readJson(resolve(SRC, "cache/text_features.json"));
  const critique = readJson(resolve(SRC, "meta/critique.json"));
  const citationsPath = resolve(SRC, "cache/citations.json");
  const citations = existsSync(citationsPath) ? readJson(citationsPath) : {};
  const scorecardsPath = resolve(SRC, "cache/scorecards.json");
  const scorecards = existsSync(scorecardsPath) ? readJson(scorecardsPath) : {};
  const keyAlias = buildKeyAlias(extracted.map((e) => e._source_pdf));
  const umapPath = resolve(SRC, "meta/umap.json");
  const networkPath = resolve(SRC, "meta/citation_network.json");
  const umap = existsSync(umapPath) ? readJson(umapPath) : null;
  const network = existsSync(networkPath) ? readJson(networkPath) : null;

  // Count results per paper, resolving each reported-side key to the canonical extracted id.
  const resultsByCanonical = new Map();
  for (const r of reported) {
    const reportedKey = r.paper_id;
    if (!reportedKey) continue;
    const canonical = keyAlias.get(reportedKey) ?? keyAlias.get(pdfKey(reportedKey));
    if (!canonical) continue;
    if (!resultsByCanonical.has(canonical)) resultsByCanonical.set(canonical, []);
    resultsByCanonical.get(canonical).push(r);
  }

  // Build papers.
  const papers = extracted.map((e) => {
    const id = e._source_pdf;
    const lookup = lookups[id] ?? null;
    const work = lookup?.work ?? null;
    const tf = features[id] ?? null;
    const cit = citations[id] ?? null;
    const arch = e.architecture ?? {};
    const pre = e.pretraining ?? {};
    const pdat = e.pretraining_data ?? {};

    // Prefer S2's externalIds (just refreshed) over the older OpenAlex enrichment.
    const arxivFromS2 = cit?.externalIds?.ArXiv ?? null;
    const arxivId = arxivFromS2 ?? deriveArxivId(lookup);
    const s2Id = cit?.paperId ?? null;

    return {
      id,
      title: e.title ?? null,
      year: e.year ?? cit?.year ?? null,
      model_name: e.model_name ?? null,
      venue: cit?.journal || cit?.venue || deriveVenue(work),
      self_describes_fm: false,
      n_results: resultsByCanonical.get(id)?.length ?? 0,
      citation_count: cit?.citationCount ?? work?.cited_by_count ?? null,
      influential_citation_count: cit?.influentialCitationCount ?? null,
      is_open_access: cit?.openAccess ?? work?.open_access?.is_oa ?? null,
      code_available: e.code_available ?? null,
      code_url: e.code_url ?? null,
      weights_available: e.weights_available ?? null,
      tldr: cit?.tldr ?? e.key_contribution ?? null,
      abstract: decodeAbstractInvertedIndex(work?.abstract_inverted_index),
      key_contribution: e.key_contribution ?? null,
      architecture: {
        backbone: arch.backbone ?? null,
        type: arch.type ?? null,
        params_millions: arch.params_millions ?? null,
      },
      pretraining: {
        method: pre.method ?? null,
        objective: pre.objective ?? null,
        is_self_supervised: pre.is_self_supervised ?? null,
        is_vision_language: pre.is_vision_language ?? null,
      },
      pretraining_data: {
        datasets: pdat.datasets ?? [],
        num_images: pdat.num_images ?? null,
        sensors: pdat.sensors ?? [],
        modalities: pdat.modalities ?? [],
        spatial_resolution: pdat.spatial_resolution ?? null,
        geographic_coverage: pdat.geographic_coverage ?? null,
      },
      downstream_tasks: e.downstream_tasks ?? [],
      downstream_datasets: e.downstream_datasets ?? [],
      compute: {
        gpu_count_max: tf?.gpu_count_max ?? null,
        gpus: tf?.gpus ?? [],
        training_days_median: tf?.training_days_median ?? null,
        has_compute_info: tf?.has_compute_info ?? null,
        limitations_chars: tf?.limitations_chars ?? null,
      },
      affiliations: deriveAffiliations(work),
      arxiv_id: arxivId,
      s2_id: s2Id,
      arxiv_url: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
      s2_url: s2Id ? `https://www.semanticscholar.org/paper/${s2Id}` : null,
      publication_date: cit?.publicationDate ?? null,
      s2_tldr: cit?.tldr ?? null,
      authors: (cit?.authors ?? []).filter((a) => a.name).map((a) => ({
        authorId: a.authorId ?? null,
        name: a.name,
        hIndex: a.hIndex ?? null,
        paperCount: a.paperCount ?? null,
        citationCount: a.citationCount ?? null,
      })),
    };
  });

  // Build results.csv (only the columns the app touches; the rest stay empty for schema parity).
  const resultCols = [
    "result_id",
    "publication_id",
    "model_id",
    "benchmark_id",
    "evaluation_strategy_id",
    "model_name",
    "base_architecture",
    "parameters_millions",
    "pretraining_data_size",
    "pretraining_dataset",
    "model_type",
    "benchmark_name",
    "task_type",
    "benchmark_description",
    "evaluation_strategy",
    "evaluation_category",
    "paper_title",
    "publication_year",
    "paper_venue",
    "pdf_filename",
    "metric_name",
    "metric_value",
    "num_training_samples",
    "reported_value_text",
  ];
  const lines = [resultCols.join(",")];
  let rid = 0;
  let nNormalized = 0;
  const paperById = new Map(papers.map((p) => [p.id, p]));
  for (const r of reported) {
    rid += 1;
    const reportedKey = r.paper_id;
    const canonicalId = keyAlias.get(reportedKey) ?? keyAlias.get(pdfKey(reportedKey));
    const paper = canonicalId ? paperById.get(canonicalId) : null;
    const { value: normValue, normalized } = normalizeMetric(r.metric_name, r.metric_value);
    if (normalized) nNormalized += 1;
    const row = {
      result_id: String(rid),
      publication_id: "",
      model_id: "",
      benchmark_id: "",
      evaluation_strategy_id: "",
      model_name: r.model_name_raw ?? r.model_name ?? "",
      base_architecture: paper?.architecture?.backbone ?? "",
      parameters_millions: paper?.architecture?.params_millions ?? "",
      pretraining_data_size: "",
      pretraining_dataset: (paper?.pretraining_data?.datasets ?? []).join("; "),
      model_type: paper?.architecture?.type ?? "",
      benchmark_name: r.benchmark_name_raw ?? r.benchmark_name ?? "",
      task_type: "",
      benchmark_description: "",
      evaluation_strategy: r.evaluation_strategy ?? "",
      evaluation_category: "",
      paper_title: r.title ?? paper?.title ?? "",
      publication_year: String(r.year ?? paper?.year ?? ""),
      paper_venue: paper?.venue ?? "",
      pdf_filename: canonicalId ? pdfKey(canonicalId) : (reportedKey ?? ""),
      metric_name: r.metric_name_raw ?? r.metric_name ?? "",
      metric_value: normValue == null ? "" : String(normValue),
      num_training_samples: r.num_training_samples ?? "",
      reported_value_text: normalized && r.metric_value != null ? String(r.metric_value) : "",
    };
    lines.push(resultCols.map((c) => csvEscape(row[c])).join(","));
  }

  // Build benchmark_heatmap from reported numbers (best metric per (model, benchmark)).
  const cellMap = new Map();
  for (const r of reported) {
    const m = r.model_name_raw ?? r.model_name;
    const b = r.benchmark_name_raw ?? r.benchmark_name;
    const { value } = normalizeMetric(r.metric_name, r.metric_value);
    const v = typeof value === "number" ? value : Number.parseFloat(value);
    if (!m || !b || !Number.isFinite(v)) continue;
    const k = `${m}__${b}`;
    const prev = cellMap.get(k);
    if (!prev || v > prev.raw) cellMap.set(k, { model: m, benchmark: b, raw: v });
  }
  const benchRanges = {};
  for (const cell of cellMap.values()) {
    const r = benchRanges[cell.benchmark];
    if (!r) benchRanges[cell.benchmark] = [cell.raw, cell.raw];
    else {
      r[0] = Math.min(r[0], cell.raw);
      r[1] = Math.max(r[1], cell.raw);
    }
  }
  const cells = [...cellMap.values()].map((c) => {
    const [lo, hi] = benchRanges[c.benchmark];
    const norm = hi === lo ? 1 : (c.raw - lo) / (hi - lo);
    return { ...c, norm };
  });
  const models = [...new Set(cells.map((c) => c.model))].sort();
  const benchmarks = [...new Set(cells.map((c) => c.benchmark))].sort();
  const heatmap = { models, benchmarks, cells, bench_ranges: benchRanges };

  // Manifest.
  const manifest = {
    exported_at: new Date().toISOString(),
    n_results: reported.length,
    n_papers: papers.length,
    files: ["results.csv", "papers.json", "meta/critique.json", "meta/benchmark_heatmap.json"],
  };

  // Clean output dir but preserve any user-managed assets in app/data outside our outputs.
  const outOld = resolve(OUT, "old");
  if (existsSync(outOld)) rmSync(outOld, { recursive: true, force: true });

  writeJson(resolve(OUT, "papers.json"), papers);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "results.csv"), `${lines.join("\n")}\n`);
  writeJson(resolve(OUT, "manifest.json"), manifest);
  writeJson(resolve(OUT, "meta/critique.json"), critique);
  writeJson(resolve(OUT, "meta/benchmark_heatmap.json"), heatmap);
  writeJson(resolve(OUT, "scorecards.json"), scorecards);
  if (umap) writeJson(resolve(OUT, "meta/umap.json"), umap);
  if (network) writeJson(resolve(OUT, "meta/citation_network.json"), network);

  console.log(
    `wrote ${papers.length} papers, ${reported.length} results (${nNormalized} fractional → percent), ` +
      `heatmap ${cells.length} cells, umap ${umap ? umap.length : 0}, network ${
        network ? network.nodes.length : 0
      } nodes`,
  );
}

main();
