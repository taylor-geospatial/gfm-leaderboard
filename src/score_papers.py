# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Score every paper in the corpus against the paper's reviewer checklist (C1–C5).

C1 — Weights released under a named license? (or constraints stated)
C2 — ≥3 benchmarks from the shared core, with stated protocols
C3 — Baseline rows annotated as rerun or copied with source
C4 — Headline results show mean±std (or explicit single-run notation)
C5 — New arch/objective compared on shared pretraining data

The first two are answerable from structured data we already have. C3–C5 need
textual evidence — we look in the LaTeX / PDF text dump under
~/github/state-of-geofms/data/geofm_review for keyword signals and fall back to
"unknown" when nothing's there to read. Conservative by design: a paper marked
``pass`` should be defensible; ``unknown`` is the failure mode for stale evidence.

Writes ``data/cache/scorecards.json``: { pid: { c1, c2, c3, c4, c5, evidence } }
where each Cx is one of {"pass","fail","unknown"} and ``evidence`` is a small
dict of quoted snippets / counts so the UI can show *why*.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
EXTRACTED_PATH = DATA / "extracted_info.jsonl"
REPORTED_PATH = DATA / "reported_numbers.jsonl"
OUT = DATA / "cache" / "scorecards.json"

CORPUS = Path.home() / "github/state-of-geofms/data/geofm_review"
PDF_DIR = CORPUS / "pdfs"
UNPACKED_DIR = CORPUS / "unpacked"

CORE_BENCHMARKS = {
    # Shared-core benchmarks from §3 of the paper — the top-10 by usage.
    "eurosat", "nwpuresisc45", "aid", "bigearthnets2", "ucmerced",
    "potsdam", "oscd", "dior", "fmow", "levircd",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def pdf_text(pid: str) -> str:
    pdf_path = PDF_DIR / pid
    if not pdf_path.exists():
        return ""
    try:
        out = subprocess.run(
            ["pdftotext", "-q", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=30,
        )
        return out.stdout
    except Exception:
        return ""


_pdf_cache: dict[str, str] = {}
def get_text(pid: str) -> str:
    if pid in _pdf_cache:
        return _pdf_cache[pid]
    t = pdf_text(pid)
    _pdf_cache[pid] = t
    return t


# C3 cue phrases (case-insensitive). Splits into "copied" vs "rerun" annotation patterns.
C3_PATTERNS = [
    r"\bre[- ]?run\b",
    r"\bwe re[- ]?implemented?\b",
    r"\bnumbers? (?:are )?(?:taken|cited|reproduced|copied) from\b",
    r"\bas reported (?:in|by)\b",
    r"\bfollowing the (?:protocol|setup|evaluation) (?:of|in|from)\b",
    r"\busing the official (?:checkpoint|code|implementation)\b",
    r"\b(?:results|numbers) (?:are )?(?:from|due to)\s+\\?cite",
]

# C4 cue phrases — explicit variance reporting.
C4_PATTERNS = [
    r"\b±\s*\d",            # 87.3 ± 1.2
    r"\bmean\s*±\s*std",
    r"\bstandard deviation\b",
    r"\bover\s+\d+\s+(?:seeds|runs)\b",
    r"\b(?:3|5|10)\s+seeds\b",
    r"\bsingle[- ]run\b",
]

# C5 cue phrases — controlled comparison on shared pretraining data.
C5_PATTERNS = [
    r"\b(?:same|identical|matched)\s+pretraining\s+(?:data|dataset|corpus)\b",
    r"\bfair\s+comparison\b",
    r"\bcontrolled\s+(?:comparison|setting|experiment)\b",
    r"\bablation\b.*?\bpretraining\b",
    r"\b(?:same|fixed)\s+(?:training\s+)?recipe\b",
]


def any_match(patterns: list[str], text: str) -> str | None:
    if not text:
        return None
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE | re.DOTALL)
        if m:
            return m.group(0)[:160]
    return None


def score_c1(ext: dict[str, Any]) -> tuple[str, str]:
    w = ext.get("weights_available")
    if w is True:
        return "pass", "extracted_info: weights_available=true"
    if w is False:
        return "fail", "extracted_info: weights_available=false"
    return "unknown", "extracted_info: weights_available=null"


def score_c2(reported_by_pid: dict[str, list[dict]], paper_pid: str) -> tuple[str, str]:
    rows = reported_by_pid.get(paper_pid, [])
    benches = {r.get("benchmark_name") for r in rows if r.get("benchmark_name")}
    overlap = sorted(benches & CORE_BENCHMARKS)
    if len(overlap) >= 3:
        return "pass", f"{len(overlap)} core benchmarks: {', '.join(overlap)}"
    return "fail", (
        f"only {len(overlap)} core benchmark(s)"
        + (f": {', '.join(overlap)}" if overlap else "; corpus uses non-core benchmarks")
    )


def score_text_signal(
    pid: str, patterns: list[str], label: str
) -> tuple[str, str]:
    text = get_text(pid)
    if not text:
        return "unknown", "no PDF text available"
    hit = any_match(patterns, text)
    if hit:
        return "pass", f"{label} cue: {re.sub(r'\\s+', ' ', hit).strip()[:140]}"
    return "fail", f"no {label} cues found in PDF text"


def truncated_key(pid: str) -> str:
    stem = pid[:-4] if pid.endswith(".pdf") else pid
    return f"{stem[:80]}.pdf"


def main() -> None:
    extracted = read_jsonl(EXTRACTED_PATH)
    reported = read_jsonl(REPORTED_PATH)

    # Group reported rows by both the truncated paper_id and the canonical filename so we hit
    # either lookup form.
    rep_by_key: dict[str, list[dict]] = {}
    for r in reported:
        k = r.get("paper_id")
        if not k:
            continue
        rep_by_key.setdefault(k, []).append(r)
    aliases = {
        "DOFA_tables1-5.pdf": "DOFA_Neural_Plasticity-Inspired_Foundation_Model_for_Observing_the_Earth_Crossing_Modalities.pdf",
        "S2MAE.pdf": "S2MAE_A_Spatial-Spectral_Pretraining_Foundation_Model_for_Spectral_Remote_Sensing_Data.pdf",
        "IaI-SimCLR.pdf": "IaI-SimCLR_Multi-Modal_Multi-Objective_Contrastive_Learning_for_Sentinel-12_Imagery.pdf",
    }
    canonical_to_rep: dict[str, list[dict]] = {}
    for e in extracted:
        pid = e["_source_pdf"]
        keys = [truncated_key(pid)]
        # Reverse-alias: if the canonical pid is one of the alias targets, also grab the short key.
        for short, long in aliases.items():
            if long == pid:
                keys.append(short)
        rows = []
        for k in keys:
            rows.extend(rep_by_key.get(k, []))
        canonical_to_rep[pid] = rows

    scorecards: dict[str, Any] = {}
    counts = Counter()
    for e in extracted:
        pid = e["_source_pdf"]
        c1, e1 = score_c1(e)
        c2, e2 = score_c2(canonical_to_rep, pid)
        c3, e3 = score_text_signal(pid, C3_PATTERNS, "rerun/copied")
        c4, e4 = score_text_signal(pid, C4_PATTERNS, "variance")
        c5, e5 = score_text_signal(pid, C5_PATTERNS, "controlled-comparison")
        for cx in (c1, c2, c3, c4, c5):
            counts[cx] += 1
        scorecards[pid] = {
            "c1": c1, "c2": c2, "c3": c3, "c4": c4, "c5": c5,
            "evidence": {"c1": e1, "c2": e2, "c3": e3, "c4": e4, "c5": e5},
        }

    OUT.write_text(json.dumps(scorecards, indent=2))
    total = sum(counts.values())
    print(f"wrote {OUT.relative_to(ROOT)} ({len(scorecards)} papers)")
    print(f"  pass:    {counts['pass']:4d} ({counts['pass']/total:.1%})")
    print(f"  fail:    {counts['fail']:4d} ({counts['fail']/total:.1%})")
    print(f"  unknown: {counts['unknown']:4d} ({counts['unknown']/total:.1%})")


if __name__ == "__main__":
    main()
