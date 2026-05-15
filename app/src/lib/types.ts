export interface Paper {
  id: string;
  title: string | null;
  year: number | null;
  model_name: string | null;
  venue: string | null;
  self_describes_fm: boolean;
  n_results: number;
  citation_count: number | null;
  influential_citation_count: number | null;
  is_open_access: boolean | null;
  code_available: boolean | null;
  code_url: string | null;
  weights_available: boolean | null;
  tldr: string | null;
  abstract: string | null;
  key_contribution: string | null;
  architecture: {
    backbone: string | null;
    type: string | null;
    params_millions: number | null;
  };
  pretraining: {
    method: string | null;
    objective: string | null;
    is_self_supervised: boolean | null;
    is_vision_language: boolean | null;
  };
  pretraining_data: {
    datasets: string[];
    num_images: string | number | null;
    sensors: string[];
    modalities: string[];
    spatial_resolution: string | null;
    geographic_coverage: string | null;
  };
  downstream_tasks: string[];
  downstream_datasets: string[];
  compute: {
    gpu_count_max: number | null;
    gpus: string[];
    training_days_median: number | null;
    has_compute_info: boolean | null;
    limitations_chars: number | null;
  };
  affiliations: string[];
  arxiv_id: string | null;
  s2_id: string | null;
  arxiv_url: string | null;
  s2_url: string | null;
  publication_date: string | null;
  s2_tldr: string | null;
  authors: Author[];
}

export interface Author {
  authorId: string | null;
  name: string;
  hIndex: number | null;
  paperCount: number | null;
  citationCount: number | null;
}

export interface ResultRow {
  result_id: string;
  publication_id: string;
  model_name: string;
  base_architecture: string;
  parameters_millions: string;
  pretraining_dataset: string;
  model_type: string;
  benchmark_name: string;
  task_type: string;
  benchmark_description: string;
  evaluation_strategy: string;
  evaluation_category: string;
  paper_title: string;
  publication_year: string;
  paper_venue: string;
  pdf_filename: string;
  metric_name: string;
  metric_value: string;
  num_training_samples: string;
  reported_value_text: string;
}

export interface Critique {
  n_papers: number;
  year_range: [number, number];
  analyses: {
    "1_reported_number_divergence": {
      n_unique_strict_full_tuples: number;
      n_multi_paper_strict_full_tuples: number;
      n_strict_spread_ge_5: number;
      n_strict_spread_ge_10: number;
      n_strict_spread_ge_20: number;
      strict_spread_summary: { mean: number; median: number; max: number };
      top_divergent_strict_full_50: Array<{
        model: string;
        benchmark: string;
        metric: string;
        evaluation_strategy: string;
        train_regime: string;
        n_papers: number;
        n_values: number;
        spread: number;
        values: Array<[string, number]>;
      }>;
    };
    "2_benchmark_concentration": {
      n_unique_benchmarks: number;
      n_total_evaluations: number;
      gini: number;
      hhi: number;
      top_20: Array<[string, number]>;
      by_year: Record<string, { gini: number; n_evals: number; n_unique: number }>;
    };
    "3_cherry_picking": {
      top_10_benchmarks: string[];
      mean_overlap: number;
      median_overlap: number;
      n_papers_with_zero_overlap: number;
      n_total: number;
      histogram: { bins: number[]; counts: number[] };
      flagged_zero_overlap: Array<{ paper: string; model: string; benchmarks: string[] }>;
    };
    "8_pretrain_data_concentration": {
      n_unique_named_datasets: number;
      top_20_datasets: Array<[string, number]>;
      top_10_sensor_only_entries: Array<[string, number]>;
      top_10_sensors_field: Array<[string, number]>;
      sensor_gini: number;
    };
  };
}

export interface UmapPoint {
  id: string;
  arxiv_id: string | null;
  x: number;
  y: number;
  x3d?: number;
  y3d?: number;
  z3d?: number;
  model_name: string;
  title: string;
  year: number | null;
  citation_count: number | null;
  pretraining_method: string;
}

export interface Manifest {
  exported_at: string;
  n_results: number;
  n_papers: number;
}

export interface NetworkNode {
  id: string;
  s2_id: string;
  x: number;
  y: number;
  label: string;
  title: string;
  year: number | null;
  citation_count: number | null;
  in_degree: number;
  family: string;
  hasPaper?: boolean;
}

export interface NetworkEdge {
  source: string;
  target: string;
  influential: boolean;
}

export interface CitationNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export type CheckStatus = "pass" | "fail" | "unknown";

export interface Scorecard {
  c1: CheckStatus;
  c2: CheckStatus;
  c3: CheckStatus;
  c4: CheckStatus;
  c5: CheckStatus;
  evidence: Record<string, string>;
}

export type Scorecards = Record<string, Scorecard>;

export interface BenchmarkHeatmap {
  models: string[];
  benchmarks: string[];
  cells: Array<{ model: string; benchmark: string; raw: number; norm: number }>;
  bench_ranges: Record<string, [number, number]>;
}
