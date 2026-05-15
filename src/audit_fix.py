# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""Apply fixes from the audit pass.

1. Treat ``extracted_info.jsonl`` as the canonical paper set.
2. Drop phantom entries (papers in lookups/embeddings but not in extracted).
3. Re-resolve any embedding whose cached title disagrees with our extracted title
   (catches SkySense → wrong-paper match, MAESTRO → unrelated paper, etc.).
4. Add embeddings for canonical papers missing from the cache.
5. Refresh per-paper citation counts via Semantic Scholar so we stop relying on
   the partly-stale OpenAlex enrichment.
6. Clean ``text_features.json``: drop stale entries, downgrade ``has_compute_info``
   to False when no actual values were extracted.
"""

from __future__ import annotations

import json
import os
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
EXTRACTED_PATH = DATA / "extracted_info.jsonl"
LOOKUPS_PATH = CACHE / "paper_lookups.json"
EMB_PATH = CACHE / "specter_embeddings.json"
TF_PATH = CACHE / "text_features.json"
CITATIONS_PATH = CACHE / "citations.json"

S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
S2_MATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search/match"
S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
EMB_FIELDS = (
    "paperId,externalIds,title,citationCount,embedding.specter_v2,"
    "references.paperId,references.isInfluential"
)
CIT_FIELDS = (
    "paperId,externalIds,title,citationCount,influentialCitationCount,year,venue,journal,"
    "publicationDate,tldr,openAccessPdf,authors.authorId,authors.name,authors.hIndex,"
    "authors.paperCount,authors.citationCount"
)

# Manual S2 paperId pins for cases the auto-resolver gets wrong.
MANUAL_S2_IDS: dict[str, str] = {
    # Bare filename "RingMo" relevance-searches to RingMo-Agent (2025); pin the original 2022 paper.
    "RingMo.pdf": "977a5bf61c63b2c1f83d0c85aaab37c10703db6f",
    # DOFA-CLIP — paper renamed from arxiv:2503.06312 ("GeoLangBind"); auto-match found a wrong related paper.
    "GeoLangBind_Unifying_Earth_Observation_with_Agglomerative_Vision-Language_Foundation_Models.pdf": (
        "cdc2ed857491416508d3ce2a391be5707e2b1e35"
    ),
    # GAIR — extracted_info uses the camera-ready title; arxiv:2503.16683 still indexed under the
    # preprint title ("GAIR: Location-aware self-supervised..."). Same paper, same embedding.
    "GAIR_Improving_Multimodal_Geo-Foundation_Model_with_Geo-Aligned_Implicit_Representations.pdf": (
        "8bc82df82463c87d2b5d3a085f3557dd6ca2f2a4"
    ),
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def norm(s: str) -> str:
    return "".join(c.lower() for c in (s or "") if c.isalnum())


def title_sim(a: str, b: str) -> float:
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


def headers(api_key: str | None) -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if api_key:
        h["x-api-key"] = api_key
    return h


def s2_get(url: str, params: dict[str, str], api_key: str | None) -> requests.Response | None:
    for attempt in range(6):
        try:
            r = requests.get(url, params=params, headers=headers(api_key), timeout=30)
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 200 or r.status_code == 404:
            return r
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        print(f"  s2 {r.status_code} {r.text[:100]}", file=sys.stderr)
        return r
    return None


def s2_post(url: str, params: dict[str, str], body: dict, api_key: str | None) -> requests.Response | None:
    for attempt in range(6):
        try:
            r = requests.post(url, params=params, json=body, headers=headers(api_key), timeout=60)
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 200:
            return r
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        print(f"  s2 {r.status_code} {r.text[:100]}", file=sys.stderr)
        return r
    return None


def title_match(query: str, api_key: str | None) -> str | None:
    r = s2_get(S2_MATCH_URL, {"query": query, "fields": "paperId,title"}, api_key)
    if r is None or r.status_code != 200:
        return None
    data = (r.json().get("data") or [])
    return data[0]["paperId"] if data else None


def title_search(query: str, api_key: str | None) -> str | None:
    r = s2_get(S2_SEARCH_URL, {"query": query, "limit": "1", "fields": "paperId,title"}, api_key)
    if r is None or r.status_code != 200:
        return None
    data = (r.json().get("data") or [])
    return data[0]["paperId"] if data else None


def fetch_batch(tokens: list[str], fields: str, api_key: str | None) -> list[dict[str, Any] | None]:
    out: list[dict[str, Any] | None] = []
    chunk = 100
    for i in range(0, len(tokens), chunk):
        part = tokens[i : i + chunk]
        r = s2_post(S2_BATCH_URL, {"fields": fields}, {"ids": part}, api_key)
        if r is None or r.status_code != 200:
            out.extend([None] * len(part))
        else:
            out.extend(r.json())
        time.sleep(0.4)
    return out


def resolve_paper_id(pid: str, ext: dict[str, Any], lookup: dict[str, Any], api_key: str | None) -> str | None:
    """Best-effort S2 paperId resolution for a canonical pid."""
    if pid in MANUAL_S2_IDS:
        return MANUAL_S2_IDS[pid]
    arxiv = lookup.get("arxiv_from_pdf")
    if not arxiv:
        # Sometimes arxiv lives in OpenAlex location URLs; not bothering here — title-match is enough.
        pass
    # Build candidate query tokens for direct batch resolution
    candidates: list[str] = []
    if arxiv:
        candidates.append(f"ARXIV:{arxiv}")
    doi = lookup.get("doi_from_pdf") or (lookup.get("work") or {}).get("doi")
    if doi:
        if doi.startswith("http"):
            doi = doi.split("doi.org/", 1)[-1]
        candidates.append(f"DOI:{doi}")
    title = ext.get("title") or pid.replace(".pdf", "").replace("_", " ")
    for token in candidates:
        r = s2_post(S2_BATCH_URL, {"fields": "paperId,title"}, {"ids": [token]}, api_key)
        if r is None or r.status_code != 200:
            continue
        rec = (r.json() or [None])[0]
        if rec and rec.get("paperId") and title_sim(rec.get("title") or "", title) > 0.6:
            return rec["paperId"]
        # Direct id resolved but to a wrong-titled paper — fall through to title-match.
    sid = title_match(title, api_key)
    if sid:
        return sid
    # Short bare-name fallback like "RingMo" — augment domain hint then retry, then relevance-search.
    if len(title) < 30:
        sid = title_match(f"{title} remote sensing foundation model", api_key)
        if sid:
            return sid
    return title_search(f"{title} remote sensing", api_key)


def main() -> None:
    api_key = os.environ.get("S2_API_KEY") or os.environ.get("S2_API_TOKEN")
    if api_key:
        print("using S2 api key from env")

    extracted = read_jsonl(EXTRACTED_PATH)
    canonical = {e["_source_pdf"]: e for e in extracted}
    lookups = json.loads(LOOKUPS_PATH.read_text())
    emb_cache = json.loads(EMB_PATH.read_text()) if EMB_PATH.exists() else {}
    tf = json.loads(TF_PATH.read_text())

    # 1. Drop phantoms from embedding cache (papers in cache but not canonical).
    phantoms = sorted(set(emb_cache) - set(canonical))
    for p in phantoms:
        emb_cache.pop(p, None)
    print(f"dropped {len(phantoms)} phantom embeddings")

    # 2. Identify pids needing (re)resolution: missing, no embedding, manual-override mismatch, or title mismatch.
    needs_resolve: list[str] = []
    for pid, ext in canonical.items():
        rec = emb_cache.get(pid) or {}
        has_emb = bool((rec.get("embedding") or {}).get("vector"))
        cached_title = rec.get("title") or ""
        our_title = ext.get("title") or pid.replace(".pdf", "").replace("_", " ")
        bad_title = bool(cached_title) and title_sim(cached_title, our_title) < 0.55
        wrong_pin = pid in MANUAL_S2_IDS and rec.get("paperId") != MANUAL_S2_IDS[pid]
        if not has_emb or bad_title or wrong_pin:
            needs_resolve.append(pid)
    print(f"need to (re)resolve {len(needs_resolve)} papers")

    # 3. Resolve to S2 paperId per paper, then batch-fetch the embedding payload.
    resolved: list[tuple[str, str]] = []  # (pid, paperId)
    for pid in needs_resolve:
        ext = canonical[pid]
        sid = resolve_paper_id(pid, ext, lookups.get(pid) or {}, api_key)
        time.sleep(0.4)
        if sid:
            resolved.append((pid, sid))
        else:
            print(f"  unresolved: {pid}")
    if resolved:
        print(f"  {len(resolved)} resolved, fetching embeddings")
        responses = fetch_batch([sid for _, sid in resolved], EMB_FIELDS, api_key)
        replaced = 0
        for (pid, _), resp in zip(resolved, responses, strict=True):
            if not resp:
                continue
            our_title = canonical[pid].get("title") or pid
            new_title = resp.get("title") or ""
            if pid not in MANUAL_S2_IDS and title_sim(new_title, our_title) < 0.4:
                # Probably still wrong; skip rather than poison the cache.
                print(f"  rejecting low-similarity match for {pid}: '{new_title[:60]}'")
                continue
            emb_cache[pid] = resp
            replaced += 1
        print(f"  cache updated for {replaced} papers")
        EMB_PATH.write_text(json.dumps(emb_cache))

    # 3b. Refresh per-reference isInfluential flags. The batch endpoint doesn't expose nested
    # reference fields, so we hit /paper/{id}/references per paper to pick up S2's influence flag.
    refs_pids = [pid for pid in canonical if (emb_cache.get(pid) or {}).get("paperId")]
    refs_stale = [
        pid for pid in refs_pids
        if any("isInfluential" not in r for r in (emb_cache[pid].get("references") or []))
    ]
    if refs_stale:
        print(f"refreshing references (with isInfluential) for {len(refs_stale)} papers")
        for i, pid in enumerate(refs_stale, 1):
            sid = emb_cache[pid]["paperId"]
            r = s2_get(
                f"https://api.semanticscholar.org/graph/v1/paper/{sid}/references",
                {"fields": "paperId,isInfluential", "limit": "1000"},
                api_key,
            )
            time.sleep(0.4)
            if r is None or r.status_code != 200:
                continue
            payload = r.json()
            items = payload.get("data") or []
            if items is None:
                # Some publishers elide references; leave the existing list alone.
                continue
            refs = []
            for it in items:
                cited = it.get("citedPaper") or {}
                if cited.get("paperId"):
                    refs.append({
                        "paperId": cited["paperId"],
                        "isInfluential": bool(it.get("isInfluential")),
                    })
            if refs:
                emb_cache[pid]["references"] = refs
            if i % 20 == 0:
                print(f"  {i}/{len(refs_stale)}")
                EMB_PATH.write_text(json.dumps(emb_cache))
        EMB_PATH.write_text(json.dumps(emb_cache))

    # 4. Refresh citationCount for every canonical paper we have a resolved S2 id for.
    s2_ids: list[tuple[str, str]] = []
    for pid in canonical:
        rec = emb_cache.get(pid) or {}
        sid = rec.get("paperId")
        if sid:
            s2_ids.append((pid, sid))
    print(f"fetching fresh citation metadata for {len(s2_ids)} papers")
    citations: dict[str, dict[str, Any]] = {}
    if s2_ids:
        responses = fetch_batch([sid for _, sid in s2_ids], CIT_FIELDS, api_key)
        for (pid, _), resp in zip(s2_ids, responses, strict=True):
            if resp:
                citations[pid] = {
                    "paperId": resp.get("paperId"),
                    "externalIds": resp.get("externalIds"),
                    "title": resp.get("title"),
                    "citationCount": resp.get("citationCount"),
                    "influentialCitationCount": resp.get("influentialCitationCount"),
                    "year": resp.get("year"),
                    "venue": resp.get("venue"),
                    "journal": (resp.get("journal") or {}).get("name"),
                    "publicationDate": resp.get("publicationDate"),
                    "tldr": (resp.get("tldr") or {}).get("text"),
                    "openAccess": bool((resp.get("openAccessPdf") or {}).get("url")),
                    # Trim author records to the fields the app actually renders.
                    "authors": [
                        {
                            "authorId": a.get("authorId"),
                            "name": a.get("name"),
                            "hIndex": a.get("hIndex"),
                            "paperCount": a.get("paperCount"),
                            "citationCount": a.get("citationCount"),
                        }
                        for a in (resp.get("authors") or [])
                    ],
                }
        CITATIONS_PATH.write_text(json.dumps(citations))
        print(f"  wrote {CITATIONS_PATH.relative_to(ROOT)}")

    # 5. text_features cleanup.
    stale = sorted(set(tf) - set(canonical))
    for p in stale:
        tf.pop(p, None)
    fixed_compute = 0
    for pid, t in tf.items():
        if (
            t.get("has_compute_info") is True
            and t.get("gpu_count_max") is None
            and t.get("training_days_median") is None
            and not t.get("gpus")
        ):
            t["has_compute_info"] = False
            fixed_compute += 1
    TF_PATH.write_text(json.dumps(tf, indent=2))
    print(f"text_features: dropped {len(stale)} stale, downgraded {fixed_compute} empty-compute flags")

    # 6. Final summary
    print("\n--- summary ---")
    print(f"canonical papers:      {len(canonical)}")
    print(f"with SPECTER2:         {sum(1 for p in canonical if (emb_cache.get(p) or {}).get('embedding'))}")
    print(f"with citation refresh: {len(citations)}")


if __name__ == "__main__":
    main()
