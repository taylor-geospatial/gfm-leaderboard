# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "numpy", "umap-learn", "scikit-learn"]
# ///
"""Fetch SPECTER2 embeddings + references from Semantic Scholar, then build
`data/meta/umap.json` and `data/meta/citation_network.json`.

We resolve papers via arxiv id or DOI (already cached in
`data/cache/paper_lookups.json`), batch-query S2 for the embedding + reference
list, cache them, and finally project to 2D/3D UMAP. Citation-network node
positions reuse the 2D UMAP so the two views feel coherent.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
META = DATA / "meta"
LOOKUPS_PATH = CACHE / "paper_lookups.json"
EXTRACTED_PATH = DATA / "extracted_info.jsonl"
EMB_CACHE_PATH = CACHE / "specter_embeddings.json"
UMAP_PATH = META / "umap.json"
NETWORK_PATH = META / "citation_network.json"

# Manual S2 paperId overrides for papers where automated matching picked the wrong target.
# Keep this list small; each entry should cite the reason it's here.
MANUAL_S2_IDS: dict[str, str] = {
    # Bare filename "RingMo" relevance-searches to RingMo-Agent (2025); pin the original 2022 paper.
    "RingMo.pdf": "977a5bf61c63b2c1f83d0c85aaab37c10703db6f",
}

S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
S2_MATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search/match"
S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
S2_FIELDS = "paperId,externalIds,title,embedding.specter_v2,references.paperId"

import re

ARXIV_RE = re.compile(r"(?:arxiv\.org/(?:abs|pdf)/|arXiv:)?(\d{4}\.\d{4,5})", re.IGNORECASE)


def extract_arxiv_from_work(work: dict[str, Any]) -> str | None:
    blob_parts = [
        json.dumps(work.get("ids") or {}),
        json.dumps(work.get("locations") or []),
        json.dumps(work.get("best_oa_location") or {}),
        json.dumps(work.get("primary_location") or {}),
    ]
    m = ARXIV_RE.search(" ".join(blob_parts))
    return m.group(1) if m else None


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def resolve_query_ids(lookups: dict[str, dict[str, Any]]) -> dict[str, str | None]:
    """Map pdf-id -> S2 query token (ARXIV:... or DOI:...). None means we'll need title match."""
    out: dict[str, str | None] = {}
    for pid, lookup in lookups.items():
        token: str | None = None
        arxiv = lookup.get("arxiv_from_pdf") or extract_arxiv_from_work(lookup.get("work") or {})
        if arxiv:
            token = f"ARXIV:{arxiv}"
        else:
            doi = lookup.get("doi_from_pdf") or (lookup.get("work") or {}).get("doi")
            if doi:
                if doi.startswith("http"):
                    doi = doi.split("doi.org/", 1)[-1]
                token = f"DOI:{doi}"
        out[pid] = token
    return out


def title_search_s2(query: str, api_key: str | None) -> str | None:
    """Relevance search fallback — returns the top hit's paperId if any."""
    headers = {}
    if api_key:
        headers["x-api-key"] = api_key
    for attempt in range(5):
        try:
            resp = requests.get(
                S2_SEARCH_URL,
                params={"query": query, "limit": 1, "fields": "paperId,title"},
                headers=headers,
                timeout=30,
            )
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if resp.status_code == 200:
            data = resp.json().get("data") or []
            return data[0]["paperId"] if data else None
        if resp.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        return None
    return None


def title_match_s2(title: str, api_key: str | None) -> str | None:
    """Resolve a paper to an S2 paperId via title search/match. Returns None on miss."""
    headers = {}
    if api_key:
        headers["x-api-key"] = api_key
    for attempt in range(5):
        try:
            resp = requests.get(
                S2_MATCH_URL,
                params={"query": title, "fields": "paperId,title"},
                headers=headers,
                timeout=30,
            )
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if resp.status_code == 200:
            data = resp.json().get("data") or []
            return data[0]["paperId"] if data else None
        if resp.status_code == 404:
            # /search/match returns 404 when nothing matches; surface to caller.
            return None
        if resp.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        return None
    return None


def fetch_batch(tokens: list[str], api_key: str | None) -> list[dict[str, Any] | None]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    # S2 batch caps at 500 ids; keep chunks small to dodge transient 429/5xx.
    out: list[dict[str, Any] | None] = []
    chunk = 100
    for i in range(0, len(tokens), chunk):
        part = tokens[i : i + chunk]
        for attempt in range(6):
            try:
                resp = requests.post(
                    S2_BATCH_URL,
                    params={"fields": S2_FIELDS},
                    json={"ids": part},
                    headers=headers,
                    timeout=60,
                )
            except requests.RequestException as exc:
                wait = 2 ** attempt
                print(f"  net error ({exc}); sleep {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if resp.status_code == 200:
                out.extend(resp.json())
                break
            if resp.status_code in (429, 500, 502, 503, 504):
                wait = 2 ** attempt
                print(f"  s2 {resp.status_code}; sleep {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"S2 batch failed: {resp.status_code} {resp.text[:200]}")
        else:
            print(f"  giving up on chunk {i}", file=sys.stderr)
            out.extend([None] * len(part))
        time.sleep(1.1)  # be polite to the unauthenticated tier
    return out


def load_or_fetch_embeddings(
    lookups: dict[str, dict[str, Any]],
    titles: dict[str, str],
    canonical: set[str],
    *,
    refresh: bool,
) -> dict[str, dict[str, Any]]:
    cache: dict[str, dict[str, Any]] = {}
    if EMB_CACHE_PATH.exists() and not refresh:
        cache = json.loads(EMB_CACHE_PATH.read_text())
    api_key = os.environ.get("S2_API_KEY") or os.environ.get("S2_API_TOKEN")

    # Drop any cache entries no longer in the canonical paper set (phantoms).
    phantoms = [pid for pid in cache if pid not in canonical]
    for pid in phantoms:
        cache.pop(pid, None)
    if phantoms:
        print(f"dropped {len(phantoms)} phantom embeddings not in canonical set")

    # Apply manual overrides first so they short-circuit the auto-matchers.
    override_pids = [pid for pid in MANUAL_S2_IDS if pid in canonical and not _has_embedding(cache.get(pid))]
    if override_pids:
        responses = fetch_batch([MANUAL_S2_IDS[p] for p in override_pids], api_key)
        for pid, resp in zip(override_pids, responses, strict=True):
            if resp:
                cache[pid] = resp
        EMB_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        EMB_CACHE_PATH.write_text(json.dumps(cache))
        print(f"applied {len(override_pids)} manual overrides")

    queries = resolve_query_ids({pid: lookups.get(pid, {}) for pid in canonical})

    # Pass 1: papers we can resolve directly via arxiv/doi.
    direct_pids = [pid for pid, q in queries.items() if q and not _has_embedding(cache.get(pid))]
    if direct_pids:
        print(f"batch-resolving {len(direct_pids)} papers via arxiv/doi")
        tokens = [queries[p] for p in direct_pids]
        responses = fetch_batch(tokens, api_key)
        for pid, resp in zip(direct_pids, responses, strict=True):
            if resp and _has_embedding(resp):
                cache[pid] = resp
            else:
                cache.setdefault(pid, resp or {})
        EMB_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        EMB_CACHE_PATH.write_text(json.dumps(cache))

    # Pass 2: title-match the stragglers (no token, or got a result without embedding).
    stragglers = [
        pid
        for pid in canonical
        if not _has_embedding(cache.get(pid)) and titles.get(pid)
    ]
    print(f"title-matching {len(stragglers)} stragglers")
    matched_tokens: list[tuple[str, str]] = []
    for pid in stragglers:
        title = titles[pid]
        sid = title_match_s2(title, api_key)
        time.sleep(1.1)
        # Short bare-stem titles ("RingMo") confuse S2 title-match; add a domain hint and retry.
        if not sid and len(title) < 30:
            sid = title_match_s2(f"{title} remote sensing foundation model", api_key)
            time.sleep(1.1)
        # Last resort: relevance search.
        if not sid:
            sid = title_search_s2(f"{title} remote sensing", api_key)
            time.sleep(1.1)
        if sid:
            matched_tokens.append((pid, sid))
    if matched_tokens:
        print(f"  -> {len(matched_tokens)} resolved via title; fetching embeddings")
        responses = fetch_batch([sid for _, sid in matched_tokens], api_key)
        for (pid, _), resp in zip(matched_tokens, responses, strict=True):
            if resp:
                cache[pid] = resp
        EMB_CACHE_PATH.write_text(json.dumps(cache))

    n_emb = sum(1 for v in cache.values() if _has_embedding(v))
    print(f"cache: {len(cache)} entries, {n_emb} with SPECTER2 embeddings")
    return cache


def _has_embedding(rec: dict[str, Any] | None) -> bool:
    if not rec:
        return False
    return bool((rec.get("embedding") or {}).get("vector"))


def umap_project(matrix: np.ndarray, *, dim: int, seed: int = 7) -> np.ndarray:
    import umap

    reducer = umap.UMAP(
        n_components=dim,
        n_neighbors=min(15, max(2, matrix.shape[0] - 1)),
        min_dist=0.15,
        metric="cosine",
        random_state=seed,
    )
    return reducer.fit_transform(matrix)


def build_outputs(
    lookups: dict[str, dict[str, Any]],
    extracted: list[dict[str, Any]],
    s2_cache: dict[str, dict[str, Any]],
) -> None:
    # Canonical paper set is extracted_info, not paper_lookups (which has stale/phantom entries).
    by_pid_extracted = {e["_source_pdf"]: e for e in extracted}
    pids = list(by_pid_extracted.keys())

    # Collect embeddings.
    rows: list[tuple[str, np.ndarray]] = []
    for pid in pids:
        rec = s2_cache.get(pid) or {}
        emb = (rec.get("embedding") or {}).get("vector")
        if emb:
            rows.append((pid, np.asarray(emb, dtype=np.float32)))
    if not rows:
        print("no SPECTER embeddings recovered; aborting", file=sys.stderr)
        return
    print(f"projecting {len(rows)} embeddings (dim={rows[0][1].shape[0]})")
    matrix = np.stack([r[1] for r in rows])
    coords2 = umap_project(matrix, dim=2)
    coords3 = umap_project(matrix, dim=3)

    pos2: dict[str, tuple[float, float]] = {}
    pos3: dict[str, tuple[float, float, float]] = {}
    for (pid, _), c2, c3 in zip(rows, coords2, coords3, strict=True):
        pos2[pid] = (float(c2[0]), float(c2[1]))
        pos3[pid] = (float(c3[0]), float(c3[1]), float(c3[2]))

    # ---- UMAP json ----
    umap_points = []
    for pid, (x, y) in pos2.items():
        e = by_pid_extracted.get(pid) or {}
        x3, y3, z3 = pos3[pid]
        umap_points.append(
            {
                "id": pid,
                "arxiv_id": (lookups.get(pid) or {}).get("arxiv_from_pdf"),
                "x": x,
                "y": y,
                "x3d": x3,
                "y3d": y3,
                "z3d": z3,
                "model_name": e.get("model_name") or "",
                "title": e.get("title") or "",
                "year": e.get("year"),
                "citation_count": ((lookups.get(pid) or {}).get("work") or {}).get(
                    "cited_by_count"
                ),
                "pretraining_method": ((e.get("pretraining") or {}).get("method") or ""),
            }
        )
    META.mkdir(parents=True, exist_ok=True)
    UMAP_PATH.write_text(json.dumps(umap_points))
    print(f"wrote {UMAP_PATH.relative_to(ROOT)} ({len(umap_points)} points)")

    # ---- Citation network ----
    s2_to_pid: dict[str, str] = {}
    for pid, rec in s2_cache.items():
        sid = rec.get("paperId")
        if sid:
            s2_to_pid[sid] = pid

    # Layout: papers with embeddings get their UMAP coord; others go to a ring outside.
    nodes = []
    edges = []
    edge_set: set[tuple[str, str]] = set()
    in_degree: dict[str, int] = {pid: 0 for pid in pids}

    for pid in pids:
        rec = s2_cache.get(pid) or {}
        src_sid = rec.get("paperId")
        if not src_sid:
            continue
        for ref in rec.get("references") or []:
            ref_pid = s2_to_pid.get(ref.get("paperId"))
            if not ref_pid or ref_pid == pid:
                continue
            tgt_sid = (s2_cache.get(ref_pid) or {}).get("paperId")
            if not tgt_sid:
                continue
            key = (src_sid, tgt_sid)
            if key in edge_set:
                continue
            edge_set.add(key)
            # Emit edges keyed by S2 paperId (what NetworkView indexes nodes by).
            edges.append({"source": src_sid, "target": tgt_sid, "influential": False})
            in_degree[ref_pid] = in_degree.get(ref_pid, 0) + 1

    # Position fallback for papers without embedding.
    if pos2:
        xs = [p[0] for p in pos2.values()]
        ys = [p[1] for p in pos2.values()]
        cx, cy = (sum(xs) / len(xs), sum(ys) / len(ys))
        radius = max(max(xs) - min(xs), max(ys) - min(ys)) * 0.6 + 1.0
    else:
        cx = cy = 0.0
        radius = 1.0
    missing = [pid for pid in pids if pid not in pos2]
    for i, pid in enumerate(missing):
        angle = 2 * np.pi * i / max(len(missing), 1)
        pos2[pid] = (cx + radius * np.cos(angle), cy + radius * np.sin(angle))

    for pid in pids:
        e = by_pid_extracted.get(pid) or {}
        work = (lookups.get(pid) or {}).get("work") or {}
        x, y = pos2[pid]
        nodes.append(
            {
                "id": pid,
                "s2_id": (s2_cache.get(pid) or {}).get("paperId"),
                "x": float(x),
                "y": float(y),
                "label": e.get("model_name") or (e.get("title") or pid)[:40],
                "title": e.get("title") or "",
                "year": e.get("year"),
                "citation_count": work.get("cited_by_count"),
                "in_degree": in_degree.get(pid, 0),
                "family": classify_family(e),
                "hasPaper": True,
            }
        )

    NETWORK_PATH.write_text(json.dumps({"nodes": nodes, "edges": edges}))
    print(f"wrote {NETWORK_PATH.relative_to(ROOT)} ({len(nodes)} nodes, {len(edges)} edges)")


def classify_family(extracted: dict[str, Any]) -> str:
    pre = (extracted or {}).get("pretraining") or {}
    blob = f"{pre.get('method') or ''} {pre.get('objective') or ''}".lower()
    is_vlm = pre.get("is_vision_language") is True
    if "jepa" in blob:
        return "JEPA"
    if any(k in blob for k in ("mae", "masked image", "masked autoenc", "mim ", "reconstruction")):
        return "MAE"
    if any(k in blob for k in ("contrastive", "simclr", "moco", "dino", "byol", "info nce", "infonce", "simsiam")):
        return "Contrastive"
    if is_vlm or any(k in blob for k in ("vlm", "vision-language", "vision language", "clip", "caption", "text", "multimodal")):
        return "VLM"
    if any(k in blob for k in ("generative", "diffus", "gan", "autoreg", "next-token", "next token")):
        return "Generative"
    return "Other"


def main() -> None:
    refresh = "--refresh" in sys.argv
    lookups = json.loads(LOOKUPS_PATH.read_text())
    extracted = read_jsonl(EXTRACTED_PATH)
    titles: dict[str, str] = {}
    for e in extracted:
        pid = e["_source_pdf"]
        title = e.get("title") or ((lookups.get(pid) or {}).get("work") or {}).get("title")
        if not title:
            # last resort: use the pdf filename stem so title-match still has something to query
            title = pid.replace(".pdf", "").replace("_", " ").strip()
        titles[pid] = title
    for pid in lookups:
        titles.setdefault(pid, pid.replace(".pdf", "").replace("_", " ").strip())
    canonical = {e["_source_pdf"] for e in extracted}
    s2_cache = load_or_fetch_embeddings(lookups, titles, canonical, refresh=refresh)
    build_outputs(lookups, extracted, s2_cache)


if __name__ == "__main__":
    main()
