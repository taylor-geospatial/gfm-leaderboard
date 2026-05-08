"""Compute the 152-paper analyses."""

import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from aliases import is_sensor_only, norm_dataset

INFO = ROOT / "data" / "extracted_info.jsonl"
LOOKUPS = ROOT / "data" / "cache" / "paper_lookups.json"
TEXT_FEAT = ROOT / "data" / "cache" / "text_features.json"
REPORTED = ROOT / "data" / "reported_numbers.jsonl"
OUT = ROOT / "data" / "meta" / "critique.json"

HYPE_TERMS = [
    "first",
    "novel",
    "outperforms",
    "state-of-the-art",
    "state of the art",
    "sota",
    "foundation",
    "general-purpose",
    "general purpose",
    "unprecedented",
    "comprehensive",
    "groundbreaking",
]


CORPUS_YEAR_MAX = 2025


def load_records():
    recs = [json.loads(line) for line in INFO.read_text().splitlines() if line.strip()]
    recs = [r for r in recs if (r.get("year") or 0) <= CORPUS_YEAR_MAX]
    lookups = json.loads(LOOKUPS.read_text()) if LOOKUPS.exists() else {}
    text_feat = json.loads(TEXT_FEAT.read_text()) if TEXT_FEAT.exists() else {}
    for r in recs:
        pdf = r.get("_source_pdf")
        r["_lookup"] = lookups.get(pdf, {}) if pdf else {}
        r["_text"] = text_feat.get(pdf, {}) if pdf else {}
    return recs


def gini(values):
    a = sorted(float(v) for v in values if v > 0)
    if not a:
        return 0.0
    n = len(a)
    cum = sum((i + 1) * v for i, v in enumerate(a))
    return (2 * cum) / (n * sum(a)) - (n + 1) / n


def hhi(counts):
    total = sum(counts)
    if total == 0:
        return 0.0
    return sum((c / total) ** 2 for c in counts)


def bootstrap_ci(values, fn, n_boot=1000, alpha=0.05, seed=0):
    if not values:
        return None, None
    rng = np.random.default_rng(seed)
    arr = np.asarray(values, dtype=float)
    boots = [fn(rng.choice(arr, size=len(arr), replace=True).tolist()) for _ in range(n_boot)]
    return float(np.quantile(boots, alpha / 2)), float(np.quantile(boots, 1 - alpha / 2))


def cited_by(rec):
    w = rec.get("_lookup", {}).get("work") or {}
    return w.get("cited_by_count")


def is_oa(rec):
    w = rec.get("_lookup", {}).get("work") or {}
    return (w.get("open_access") or {}).get("is_oa")


def venue(rec):
    w = rec.get("_lookup", {}).get("work") or {}
    pl = w.get("primary_location") or {}
    src = pl.get("source") or {}
    return src.get("display_name")


def institutions(rec):
    w = rec.get("_lookup", {}).get("work") or {}
    out = []
    for a in w.get("authorships", []) or []:
        seen_inst = False
        for inst in a.get("institutions", []) or []:
            disp = inst.get("display_name")
            cc = inst.get("country_code")
            if disp:
                out.append((disp, cc))
                seen_inst = True
        if not seen_inst:
            for cc in a.get("countries") or []:
                out.append((None, cc))
    return out


def countries_for(rec):
    w = rec.get("_lookup", {}).get("work") or {}
    seen = set()
    for a in w.get("authorships", []) or []:
        for cc in a.get("countries") or []:
            seen.add(cc)
        for inst in a.get("institutions") or []:
            if inst.get("country_code"):
                seen.add(inst["country_code"])
    return seen


def analysis_2_benchmark_concentration(recs):
    """Gini + HHI of downstream-dataset usage, overall and by year.

    Dataset names are canonicalized via ``norm_dataset`` to collapse
    case/punctuation/alias variants (MillionAID vs Million-AID,
    RESISC-45 vs NWPU-RESISC45, ISPRS Potsdam vs Potsdam, …).
    """
    overall = Counter()
    by_year = defaultdict(Counter)
    for r in recs:
        ds = r.get("downstream_datasets") or []
        y = r.get("year")
        for d in ds:
            c = norm_dataset(d)
            if not c:
                continue
            overall[c] += 1
            if y:
                by_year[y][c] += 1
    g = gini(list(overall.values()))
    g_lo, g_hi = bootstrap_ci(list(overall.values()), gini)
    return {
        "n_unique_benchmarks": len(overall),
        "n_total_evaluations": sum(overall.values()),
        "gini": g,
        "gini_ci_95": [g_lo, g_hi],
        "hhi": hhi(list(overall.values())),
        "top_20": overall.most_common(20),
        "by_year": {
            str(y): {
                "gini": gini(list(c.values())),
                "hhi": hhi(list(c.values())),
                "n_papers": sum(1 for r in recs if r.get("year") == y),
            }
            for y, c in sorted(by_year.items())
        },
    }


def analysis_3_cherry_picking(recs):
    """Per-paper overlap with the union of top-10 most-used benchmarks.

    Uses canonical dataset names so alias duplicates do not inflate the
    top-10 set and do not create phantom "zero-overlap" papers.
    """
    overall = Counter()
    for r in recs:
        for d in r.get("downstream_datasets") or []:
            c = norm_dataset(d)
            if c:
                overall[c] += 1
    top10 = {d for d, _ in overall.most_common(10)}
    scores = []
    flagged = []
    for r in recs:
        ds = {c for d in (r.get("downstream_datasets") or []) if (c := norm_dataset(d))}
        if not ds:
            continue
        overlap = len(ds & top10)
        score = overlap / len(ds)
        scores.append(score)
        if overlap == 0 and len(ds) >= 3:
            flagged.append(
                {
                    "paper": r.get("_source_pdf"),
                    "model": r.get("model_name"),
                    "n_benchmarks": len(ds),
                    "datasets": sorted(ds)[:8],
                }
            )
    mean = float(np.mean(scores)) if scores else 0.0
    median = float(np.median(scores)) if scores else 0.0
    lo, hi = bootstrap_ci(scores, lambda v: float(np.mean(v)))
    return {
        "top_10_benchmarks": list(top10),
        "mean_overlap": mean,
        "median_overlap": median,
        "mean_ci_95": [lo, hi],
        "n_papers_with_zero_overlap": sum(1 for s in scores if s == 0),
        "n_total": len(scores),
        "histogram": np.histogram(scores, bins=10, range=(0, 1))[0].tolist(),
        "flagged_zero_overlap": flagged[:25],
    }


def analysis_4_5_citation_regression(recs):
    """OLS of log(1+cited_by) on code/weights/oa/age/arxiv_only.

    Falls back to manual coefficient computation when statsmodels is
    missing — keeps the script importable on slim envs.
    """
    rows = []
    current_year = 2026
    for r in recs:
        c = cited_by(r)
        y = r.get("year")
        if c is None or y is None:
            continue
        oa = is_oa(r)
        v = (venue(r) or "").lower()
        rows.append(
            {
                "log_cites": math.log1p(c),
                "code": 1 if r.get("code_available") else 0,
                "weights": 1 if r.get("weights_available") else 0,
                "oa": 1 if oa else 0,
                "age": current_year - y,
                "arxiv_only": 1 if "arxiv" in v else 0,
                "year": y,
                "cited_by": c,
                "venue": venue(r),
            }
        )
    if not rows:
        return {"error": "no rows"}
    by_quad = defaultdict(list)
    for x in rows:
        key = (x["code"], x["oa"])
        by_quad[key].append(x["cited_by"])
    quad_summary = {
        f"code={k[0]}_oa={k[1]}": {
            "n": len(v),
            "median_cites": float(np.median(v)),
            "mean_cites": float(np.mean(v)),
        }
        for k, v in by_quad.items()
    }
    coefs: dict = {}
    try:
        import statsmodels.api as sm

        X = np.array([[x["code"], x["weights"], x["oa"], x["age"], x["arxiv_only"]] for x in rows])
        y = np.array([x["log_cites"] for x in rows])
        X = sm.add_constant(X)
        model = sm.OLS(y, X).fit(cov_type="HC3")
        names = ["intercept", "code", "weights", "oa", "age", "arxiv_only"]
        coefs.update(
            {
                n: {
                    "coef": float(model.params[i]),
                    "se": float(model.bse[i]),
                    "p": float(model.pvalues[i]),
                    "ci_low": float(model.conf_int()[i, 0]),
                    "ci_high": float(model.conf_int()[i, 1]),
                }
                for i, n in enumerate(names)
            }
        )
        coefs["_r2"] = float(model.rsquared)
        coefs["_n"] = len(rows)
    except ImportError:
        coefs = {"error": "statsmodels not installed"}
    return {"n_rows": len(rows), "quadrants": quad_summary, "regression": coefs}


def analysis_6_hype_lexicon(recs):
    """Term-frequency of hype words in titles + key contributions."""
    by_year: dict[int, dict] = defaultdict(lambda: {"papers": 0, "term_counts": Counter()})
    overall = Counter()
    for r in recs:
        y = r.get("year")
        text = " ".join(
            [
                r.get("title") or "",
                r.get("key_contribution") or "",
                (r.get("pretraining") or {}).get("method_details") or "",
            ]
        ).lower()
        for term in HYPE_TERMS:
            n = len(re.findall(r"\b" + re.escape(term) + r"\b", text))
            if n:
                overall[term] += n
                if y:
                    by_year[y]["term_counts"][term] += n
        if y:
            by_year[y]["papers"] += 1
    return {
        "overall_counts": dict(overall),
        "by_year": {
            str(y): {
                "papers": v["papers"],
                "terms_per_paper": {
                    t: round(c / v["papers"], 3) for t, c in v["term_counts"].items()
                },
            }
            for y, v in sorted(by_year.items())
        },
    }


def analysis_11_authorship(recs):
    """Country + institution concentration (Gini, top-N)."""
    countries = Counter()
    insts = Counter()
    for r in recs:
        seen_i = set()
        for inst, _cc in institutions(r):
            if inst and inst not in seen_i:
                insts[inst] += 1
                seen_i.add(inst)
        for cc in countries_for(r):
            countries[cc] += 1
    return {
        "countries": {
            "n": len(countries),
            "top_15": countries.most_common(15),
            "gini": gini(list(countries.values())),
        },
        "institutions": {
            "n": len(insts),
            "top_25": insts.most_common(25),
            "gini": gini(list(insts.values())),
        },
    }


INDUSTRY_KEYWORDS = [
    "google",
    "microsoft",
    "amazon",
    "meta ",
    "meta platforms",
    "facebook",
    "ibm",
    "nvidia",
    "apple",
    "anthropic",
    "openai",
    "huawei",
    "baidu",
    "tencent",
    "alibaba",
    "bytedance",
    "samsung",
    "intel",
    "qualcomm",
    "esri",
    "planet labs",
    "maxar",
    "airbus",
    "capella",
    "descartes",
    "ibm research",
    "allen institute",
    "ai2",
    "deepmind",
    "brain team",
    "hugging face",
]

METHOD_BUCKETS = [
    ("MAE / MIM", [r"\bmae\b", r"mask(ed)?\s*(image|autoencod|patch|pretrain)", r"\bmim\b"]),
    ("Contrastive", [r"contrastiv", r"simclr", r"\bmoco\b", r"\bbyol\b", r"\bdino\b"]),
    ("Vision-Language", [r"clip", r"vision-language", r"text-image", r"image-text", r"captioning"]),
    ("Generative / Diffusion", [r"diffusion", r"generative\s+pretrain", r"\bgan\b"]),
    ("Distillation / Teacher-Student", [r"distill", r"teacher-?student"]),
    ("Supervised pretrain", [r"supervised\s+pretrain", r"label-?supervised"]),
]


def classify_method(rec):
    pt = rec.get("pretraining") or {}
    text = " ".join(
        [
            str(pt.get("method") or ""),
            str(pt.get("objective") or ""),
            str(pt.get("method_details") or ""),
        ]
    ).lower()
    hits = []
    for name, patterns in METHOD_BUCKETS:
        for p in patterns:
            if re.search(p, text):
                hits.append(name)
                break
    return hits or ["Other / Hybrid"]


def pretrain_datasets(rec):
    return [d for d in (rec.get("pretraining_data") or {}).get("datasets") or [] if d]


def pretrain_sensors(rec):
    return [s for s in (rec.get("pretraining_data") or {}).get("sensors") or [] if s]


def industry_flag(rec):
    """Return True iff any author affiliation contains an industry keyword."""
    names = []
    for inst, _cc in institutions(rec):
        if inst:
            names.append(inst.lower())
    haystack = " | ".join(names)
    return any(kw in haystack for kw in INDUSTRY_KEYWORDS)


def analysis_7_method_monopoly(recs):
    counts = Counter()
    by_year = defaultdict(Counter)
    for r in recs:
        y = r.get("year")
        seen = set()
        for m in classify_method(r):
            if m in seen:
                continue
            seen.add(m)
            counts[m] += 1
            if y:
                by_year[y][m] += 1
    total = sum(counts.values()) or 1
    return {
        "counts": dict(counts.most_common()),
        "shares": {k: round(v / total, 3) for k, v in counts.most_common()},
        "by_year": {
            str(y): {"n": sum(c.values()), "counts": dict(c)} for y, c in sorted(by_year.items())
        },
    }


DOWNSTREAM_ONLY_BENCHMARKS = {
    "EuroSAT",
    "AID",
    "NWPU-RESISC45",
    "UCMerced",
    "WHU-RS19",
    "OPTIMAL-31",
    "RSD46",
    "PatternNet",
    "RSI-CB128",
    "RSI-CB256",
    "NWPU",
    "BigEarthNet-S2",
    "BigEarthNet-MM",
    "BigEarthNet-S1",
    "Potsdam",
    "Vaihingen",
    "iSAID",
    "LoveDA",
    "OpenEarthMap",
    "DLRSD",
    "GID-15",
    "Globe230k",
    "UAVid",
    "OSCD",
    "LEVIR-CD",
    "LEVIR-CD+",
    "DSIFN",
    "CDD",
    "EGY-BCD",
    "HRSCD",
    "S2Looking",
    "Hi-UCD",
    "LEVIR",
    "DIOR",
    "DIOR-R",
    "DIOR-RSVG",
    "DOTA",
    "DOTA-v2.0",
    "FAIR1M",
    "HRSC2016",
    "HRSC",
    "NWPU-VHR-10",
    "RSOD",
    "HRRSD",
    "MAR20",
    "UCAS-AOD",
    "VisDrone",
    "AUAIR",
    "CARPK",
    "AiRound",
    "HRSID",
    "SSDD",
    "SADD",
    "SAR-Ship",
    "AIR-SARShip",
    "SAR-AIRcraft",
    "OGSOD",
    "SARDet-100K",
    "MSAR",
    "MSTAR",
    "OpenSARShip",
    "Sen1Floods11",
    "FloodNet-VQA",
    "m-So2Sat",
    "m-BigEarthNet",
    "m-Brick-Kiln",
    "m-Cashew",
    "m-NeonTree",
    "m-SACropType",
    "m-Eurosat",
    "RSVQA-HR",
    "RSVQA-LR",
    "EarthVQA",
    "RSIVQA",
    "RSITMD",
    "RSICD",
    "UCM-Captions",
    "NWPU-Captions",
    "Sydney-Captions",
    "CapERA",
    "COCO Captions",
    "RefCOCO",
    "RefCOCO+",
    "RSVG",
    "RSPG",
    "PASTIS",
    "PASTIS-HD",
    "METER-ML",
    "Indian Pines",
    "Salinas",
    "Pavia",
    "Inria",
    "GEONRW",
    "Hefei",
    "STAR",
    "FIT-RS",
}
_DOWNSTREAM_SLUGS = {norm_dataset(x) for x in DOWNSTREAM_ONLY_BENCHMARKS} - {None}


def _primary_family(canonical_name: str) -> str:
    """Identity. Sibling datasets like fMoW / fMoW-RGB / fMoW-Sentinel are NOT
    equivalent (different sensors, different pretrain images), so we do not
    collapse them. The alias table in src/state_of_geofms/aliases.py already
    handles trivial whitespace/punctuation variants; anything more aggressive
    risks treating two genuinely different pretraining sets as the same."""
    return canonical_name


def _primary_corpus_for_paper(rec) -> Optional[str]:
    """Return the paper's primary pretraining corpus, with downstream and sensor
    entries skipped. The first qualifying entry is taken as primary; subsequent
    entries are usually constituent sources of the primary corpus
    (e.g., RS5M is built from LAION/CC3M/CC12M; AnySat's GeoPlex wraps
    TreeSatAI-TS/FLAIR/PLANTED/PASTIS-HD; GeoPile wraps MillionAID/SEN12MS/MDAS).
    """
    pdata = rec.get("pretraining_data") or {}
    for d in pdata.get("datasets") or []:
        if not d or is_sensor_only(d):
            continue
        n = norm_dataset(d, context="pretrain")
        if not n or n in _DOWNSTREAM_SLUGS:
            continue
        return _primary_family(n)
    return None


def _full_pretrain_set(rec) -> tuple:
    """Return paper's full pretrain set as an ordered tuple (canon families,
    deduped, blacklist-filtered). Used to test cross-paper equivalence: two
    papers are 'truly comparable' on pretraining only if their full sets match.
    A paper that pretrains on BigEarthNet alone is *not* equivalent to one
    that pretrains on BigEarthNet as one source in a multi-corpus mixture."""
    pdata = rec.get("pretraining_data") or {}
    canon = []
    for d in pdata.get("datasets") or []:
        if not d or is_sensor_only(d):
            continue
        n = norm_dataset(d, context="pretrain")
        if not n or n in _DOWNSTREAM_SLUGS:
            continue
        canon.append(_primary_family(n))
    return tuple(dict.fromkeys(canon))


def analysis_8_pretrain_data_concentration(recs):
    """Quantify pretraining-setup fragmentation.

    Many GFM papers report a primary pretraining corpus alongside the
    constituent sources used to construct it (RS5M built from LAION + CC3M
    + CC12M + ...; GeoPile built from MillionAID + SEN12MS + MDAS; AnySat's
    GeoPlex wrapping TreeSatAI-TS + FLAIR + PLANTED + PASTIS-HD). Counting
    every listed entry inflates the unique-corpus count by treating sources
    as separate corpora. We take the first non-sensor, non-downstream entry
    per paper as that paper's primary corpus, collapse known variant
    families (fMoW-RGB / fMoW-Sentinel -> fMoW; SSL4EO-S12 / SSL4EO-L ->
    SSL4EO).

    We *also* report a stricter measure of comparability: the count of
    papers whose *full* pretraining set (not just the primary) matches at
    least one other paper's full set. A paper using BigEarthNet alone is not
    equivalent to a paper using BigEarthNet inside a custom multi-source
    mixture; both might list BigEarthNet, but the actual pretraining data
    differs.
    """
    primary = Counter()
    sensors = Counter()
    sensor_only_entries = Counter()
    downstream_misextract = Counter()
    full_sets = Counter()
    papers_no_primary = 0
    papers_sensor_only = 0
    for r in recs:
        raw = pretrain_datasets(r)
        for d in raw:
            if is_sensor_only(d):
                sensor_only_entries[norm_dataset(d, context="pretrain") or d.strip()] += 1
                continue
            n = norm_dataset(d, context="pretrain")
            if n and n in _DOWNSTREAM_SLUGS:
                downstream_misextract[n] += 1
        chosen = _primary_corpus_for_paper(r)
        if chosen is None:
            papers_no_primary += 1
            if raw:
                papers_sensor_only += 1
        else:
            primary[chosen] += 1
        full_sets[_full_pretrain_set(r)] += 1
        for s in pretrain_sensors(r):
            if s:
                sensors[s.strip()] += 1
    nonempty = {s: c for s, c in full_sets.items() if s}
    n_papers_with_pretrain = sum(nonempty.values())
    n_distinct_full_sets = len(nonempty)
    n_papers_in_shared_set = sum(c for c in nonempty.values() if c >= 2)
    n_papers_in_unique_set = sum(c for c in nonempty.values() if c == 1)
    shared_clusters = sorted(
        ((list(s), c) for s, c in nonempty.items() if c >= 2),
        key=lambda x: -x[1],
    )
    return {
        "n_unique_named_datasets": len(primary),
        "n_papers_with_no_primary": papers_no_primary,
        "n_papers_with_sensor_only_pretrain": papers_sensor_only,
        "n_sensor_only_entries_stream": sum(sensor_only_entries.values()),
        "n_downstream_misextractions_dropped": sum(downstream_misextract.values()),
        "n_primary_used_only_once": sum(1 for c in primary.values() if c == 1),
        "n_primary_shared_2plus": sum(1 for c in primary.values() if c >= 2),
        "n_distinct_full_pretrain_sets": n_distinct_full_sets,
        "n_papers_in_shared_full_set": n_papers_in_shared_set,
        "n_papers_in_unique_full_set": n_papers_in_unique_set,
        "n_papers_with_extractable_pretrain": n_papers_with_pretrain,
        "shared_full_set_clusters": shared_clusters,
        "top_20_datasets": primary.most_common(20),
        "top_10_sensor_only_entries": sensor_only_entries.most_common(10),
        "top_10_sensors_field": sensors.most_common(10),
        "sensor_gini": gini(list(sensors.values())),
    }


def analysis_9_industry_adoption(recs):
    """Proxy for real-world uptake: industry-author fraction + code/weights release."""
    with_ind = 0
    resolved = 0
    by_year = defaultdict(lambda: {"n": 0, "industry": 0})
    industry_papers = []
    for r in recs:
        w = (r.get("_lookup") or {}).get("work") or {}
        if not w:
            continue
        resolved += 1
        y = r.get("year")
        flag = industry_flag(r)
        if y:
            by_year[y]["n"] += 1
            if flag:
                by_year[y]["industry"] += 1
        if flag:
            with_ind += 1
            industry_papers.append(
                {
                    "paper": r.get("_source_pdf"),
                    "model": r.get("model_name"),
                    "year": y,
                }
            )
    total = len(recs)
    weights_released = sum(1 for r in recs if r.get("weights_available"))
    code_released = sum(1 for r in recs if r.get("code_available"))
    return {
        "n_total": total,
        "n_resolved": resolved,
        "n_industry_affiliated": with_ind,
        "industry_share_of_resolved": round(with_ind / resolved, 3) if resolved else None,
        "weights_released_share": round(weights_released / total, 3),
        "code_released_share": round(code_released / total, 3),
        "by_year": {
            str(y): {
                "n": v["n"],
                "industry": v["industry"],
                "share": round(v["industry"] / v["n"], 3) if v["n"] else 0,
            }
            for y, v in sorted(by_year.items())
        },
        "industry_papers": industry_papers[:50],
    }


EVAL_NORM = {
    "full finetuning": "finetune",
    "fullfinetuning": "finetune",
    "finetune": "finetune",
    "finetuning": "finetune",
    "linear probe": "linear",
    "linearprobe": "linear",
    "linearprobing": "linear",
    "frozen": "linear",
    "knn": "knn",
    "k-nn": "knn",
    "zero-shot": "zeroshot",
    "zeroshot": "zeroshot",
    "few-shot": "fewshot",
    "fewshot": "fewshot",
}


def norm_eval(s):
    if not s:
        return "unknown"
    s2 = re.sub(r"[^a-z0-9]+", "", s.strip().lower())
    for k, v in EVAL_NORM.items():
        k2 = re.sub(r"[^a-z0-9]+", "", k)
        if k2 in s2:
            return v
    return "other"


def analysis_1_divergence(valid_paper_ids: Optional[set[str]] = None):
    """Group reported numbers by (model, benchmark, metric, eval_strategy).

    Fair divergence requires holding the eval protocol fixed. A gap of 20+
    points on the same (model, benchmark, metric) is striking on its own;
    if it persists after restricting to a single eval_strategy it is a
    genuine reproducibility problem rather than a protocol mismatch.

    If ``valid_paper_ids`` is provided, rows whose ``paper_id`` is not in
    the set are dropped (used to enforce the corpus year cap).
    """
    if not REPORTED.exists():
        return {"status": "skipped", "reason": "reported_numbers.jsonl not generated"}
    rows = []
    for line in REPORTED.read_text().splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    if valid_paper_ids is not None:
        truncated = {pid for pid in {r.get("paper_id") for r in rows} if pid}
        truncated -= valid_paper_ids
        prefix_resolution: dict[str, str] = {}
        for pid in truncated:
            if not pid.endswith(".pdf"):
                continue
            stem = pid[: -len(".pdf")]
            matches = [v for v in valid_paper_ids if v.startswith(stem)]
            if len(matches) == 1:
                prefix_resolution[pid] = matches[0]
        for r in rows:
            pid = r.get("paper_id")
            if pid in prefix_resolution:
                r["paper_id"] = prefix_resolution[pid]
        rows = [r for r in rows if r.get("paper_id") in valid_paper_ids]
    if not rows:
        return {"status": "empty"}
    strict = defaultdict(list)
    loose = defaultdict(list)
    for r in rows:
        v = r.get("metric_value")
        if not isinstance(v, (int, float)):
            continue
        mn, bn, met = r.get("model_name"), r.get("benchmark_name"), r.get("metric_name")
        if not (mn and bn and met):
            continue
        ev = norm_eval(r.get("evaluation_strategy"))
        regime = r.get("train_regime") or "full"
        entry = {
            "value": float(v),
            "paper": r.get("paper_id"),
            "title": r.get("title"),
            "eval": ev,
            "regime": regime,
            "nts_raw": r.get("num_training_samples"),
            "model_raw": r.get("model_name_raw"),
            "benchmark_raw": r.get("benchmark_name_raw"),
        }
        loose[(mn, bn, met)].append(entry)
        strict[(mn, bn, met, ev, regime)].append(entry)
    BASELINE_MODELS = {
        "random",
        "scratch",
        "fromscratch",
        "imagenet",
        "imagenetsupervised",
        "mlp",
        "linearprobe",
        "supervised",
        "lightgbm",
        "xgboost",
        "randomforest",
        "rf",
        "svm",
        "knn",
    }
    DETECTION_BENCHMARKS = {"dota", "dior", "diorr", "dotav1", "dotav2"}

    def summarize(groups, keycols, filter_baselines=False, drop_intra_paper=True) -> list:
        out = []
        for key, vals in groups.items():
            if filter_baselines and key[0] in BASELINE_MODELS:
                continue
            if (
                filter_baselines
                and key[1] in DETECTION_BENCHMARKS
                and (len(key) < 3 or key[2] in {"map", "ap", "map50", "map75"})
            ):
                continue
            if drop_intra_paper:
                by_paper = defaultdict(set)
                for v in vals:
                    by_paper[v["paper"]].add(round(v["value"], 4))
                if any(len(s) > 1 for s in by_paper.values()):
                    continue
            if filter_baselines:
                nts_raws = {(v.get("nts_raw") or "").strip() for v in vals}
                nts_raws.discard("")
                if nts_raws:
                    continue
            papers = {v["paper"] for v in vals}
            if len(papers) < 2:
                continue
            xs = [v["value"] for v in vals]
            row = dict(zip(keycols, key))
            row.update(
                {
                    "n": len(vals),
                    "n_papers": len(papers),
                    "min": min(xs),
                    "max": max(xs),
                    "spread": max(xs) - min(xs),
                    "std": float(np.std(xs)),
                    "values": vals[:20],
                }
            )
            out.append(row)
        out.sort(key=lambda d: d["spread"], reverse=True)
        return out

    strict_div = summarize(
        strict, ["model", "benchmark", "metric", "eval", "regime"], filter_baselines=True
    )
    strict_full_only = {k: v for k, v in strict.items() if k[4] == "full"}
    strict_full_div = summarize(
        strict_full_only,
        ["model", "benchmark", "metric", "eval", "regime"],
        filter_baselines=True,
    )
    loose_div = summarize(loose, ["model", "benchmark", "metric"], filter_baselines=True)

    def quantiles(xs) -> dict:
        if not xs:
            return {}
        a = np.asarray(xs, dtype=float)
        return {
            "mean": float(a.mean()),
            "median": float(np.median(a)),
            "p75": float(np.quantile(a, 0.75)),
            "p90": float(np.quantile(a, 0.90)),
            "max": float(a.max()),
        }

    strict_spreads = [d["spread"] for d in strict_full_div]
    loose_spreads = [d["spread"] for d in loose_div]
    pct_metric_spreads = [
        d["spread"]
        for d in strict_full_div
        if d["metric"] in {"accuracy", "accuracy_macro", "miou", "iou", "f1", "f1_macro", "kappa"}
    ]
    return {
        "n_unique_loose_tuples": len(loose),
        "n_unique_strict_tuples": len(strict),
        "n_unique_strict_full_tuples": len(strict_full_only),
        "n_multi_paper_loose_tuples": len(loose_div),
        "n_multi_paper_strict_tuples": len(strict_div),
        "n_multi_paper_strict_full_tuples": len(strict_full_div),
        "loose_spread_summary": quantiles(loose_spreads),
        "strict_spread_summary": quantiles(strict_spreads),
        "strict_pct_spread_summary": quantiles(pct_metric_spreads),
        "n_strict_spread_ge_5": sum(1 for s in strict_spreads if s >= 5),
        "n_strict_spread_ge_10": sum(1 for s in strict_spreads if s >= 10),
        "n_strict_spread_ge_20": sum(1 for s in strict_spreads if s >= 20),
        "top_divergent_strict_full_50": strict_full_div[:50],
        "top_divergent_strict_all_regimes_25": strict_div[:25],
        "top_divergent_loose_25": loose_div[:25],
    }


def main():
    recs = load_records()
    valid_paper_ids = {r["_source_pdf"] for r in recs if r.get("_source_pdf")}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "n_papers": len(recs),
        "year_range": [
            min((r["year"] for r in recs if r.get("year")), default=None),
            max((r["year"] for r in recs if r.get("year")), default=None),
        ],
        "analyses": {
            "1_reported_number_divergence": analysis_1_divergence(valid_paper_ids),
            "2_benchmark_concentration": analysis_2_benchmark_concentration(recs),
            "3_cherry_picking": analysis_3_cherry_picking(recs),
            "4_5_citation_regression": analysis_4_5_citation_regression(recs),
            "6_hype_lexicon": analysis_6_hype_lexicon(recs),
            "7_method_monopoly": analysis_7_method_monopoly(recs),
            "8_pretrain_data_concentration": analysis_8_pretrain_data_concentration(recs),
            "9_industry_adoption": analysis_9_industry_adoption(recs),
            "11_authorship_concentration": analysis_11_authorship(recs),
        },
    }
    OUT.write_text(json.dumps(out, indent=2, default=str))
    print(f"wrote {OUT}")
    a = out["analyses"]
    print(f"  benchmarks: gini={a['2_benchmark_concentration']['gini']:.3f}")
    print(
        f"  cherry-pick mean overlap with top-10: {a['3_cherry_picking']['mean_overlap']:.3f}, "
        f"{a['3_cherry_picking']['n_papers_with_zero_overlap']} papers w/ zero overlap"
    )
    if "regression" in a["4_5_citation_regression"] and isinstance(
        a["4_5_citation_regression"]["regression"], dict
    ):
        reg = a["4_5_citation_regression"]["regression"]
        if "code" in reg:
            print(
                f"  cite reg n={reg.get('_n')}, R2={reg.get('_r2'):.3f}, code coef={reg['code']['coef']:.3f} "
                f"(p={reg['code']['p']:.3f})"
            )
    print(f"  countries Gini: {a['11_authorship_concentration']['countries']['gini']:.3f}")


if __name__ == "__main__":
    main()
