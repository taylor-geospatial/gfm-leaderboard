# Anonymous repro bundle

Minimal inputs for the paper numbers and figures.

## Run

```bash
uv venv --python 3.12
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python src/critique_analyses.py
.venv/bin/python src/make_paper_figures.py
```

`src/critique_analyses.py` writes `data/meta/critique.json`.

## Inputs

- `data/extracted_info.jsonl`
- `data/reported_numbers.jsonl`
- `data/cache/paper_lookups.json`
- `data/cache/text_features.json`
- `data/meta/critique.json`
- `src/aliases.py`
- `src/critique_analyses.py`
- `src/make_paper_figures.py`
