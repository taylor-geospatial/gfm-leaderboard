# State of GeoFMs

Leaderboard, data, and analyses for the State of Geospatial Foundation Models review.

## Quickstart

```bash
make install   # installs bun + uv (if missing), Python + JS deps
make app       # serves the web app at http://localhost:5173
```

That's it.

## Other targets

| target | what it does |
|---|---|
| `make build` | production-build the web app into `app/dist/` |
| `make preview` | preview the production build |
| `make data` | regenerate `app/data/*` from `data/` (no network) |
| `make embeddings` | refresh SPECTER2 + UMAP + citation graph (Semantic Scholar API) |
| `make audit` | re-run the data-quality audit fixer (Semantic Scholar API) |
| `make lint` | biome check on the app sources |
| `make clean` | remove `node_modules`, `dist`, `.venv` |

`make embeddings` and `make audit` use the Semantic Scholar API. Set
`S2_API_KEY` (or `S2_API_TOKEN`) for higher rate limits.

## Layout

```
data/                   canonical corpus (jsonl + caches)
src/                    Python pipelines (build_embeddings, audit_fix, paper figures)
app/                    React + Vite web app (Bun for tooling)
  scripts/build-data.mjs  transforms data/ → app/data/ for the app to consume
```
