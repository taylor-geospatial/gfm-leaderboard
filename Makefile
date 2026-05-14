.PHONY: help install install-bun install-uv install-python install-js app build preview lint clean data embeddings audit

help:
	@echo "make install     install bun + uv (if missing), Python deps, JS deps"
	@echo "make app         serve the web app at http://localhost:5173"
	@echo "make build       production-build the app into app/dist/"
	@echo "make preview     preview the production build"
	@echo "make data        regenerate app/data/* from data/ (no network)"
	@echo "make embeddings  refresh SPECTER2 cache + UMAP + citation graph (S2 API)"
	@echo "make audit       run the data-quality audit fixer (S2 API)"
	@echo "make lint        biome check on the app sources"
	@echo "make clean       remove node_modules, dist, .venv"

install: install-bun install-uv install-python install-js
	@echo "✓ install complete — run 'make app' to launch the web app"

install-bun:
	@if ! command -v bun >/dev/null 2>&1; then \
		echo "installing bun…"; \
		curl -fsSL https://bun.sh/install | bash; \
	else \
		echo "✓ bun already installed: $$(bun --version)"; \
	fi

install-uv:
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "installing uv…"; \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	else \
		echo "✓ uv already installed: $$(uv --version)"; \
	fi

install-python:
	@if [ -d .venv ]; then \
		echo "✓ .venv already exists, reusing"; \
	else \
		echo "creating uv-managed Python env in .venv…"; \
		uv venv; \
	fi
	uv pip install -r requirements.txt

install-js:
	@echo "installing app JS deps with bun…"
	cd app && bun install

app:
	cd app && bun run dev

build:
	cd app && bun run build

preview:
	cd app && bun run preview

lint:
	cd app && bunx biome check --write src

data:
	cd app && bun run build:data

embeddings:
	uv run --script src/build_embeddings.py

audit:
	uv run --script src/audit_fix.py

clean:
	rm -rf app/node_modules app/dist app/.vite .venv
