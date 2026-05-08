.PHONY: install build clean dev lint preview

install:
	bun install

dev:
	bun run dev

build:
	bun run build

preview:
	bun run preview

lint:
	bunx biome check --write src

clean:
	rm -rf node_modules dist .vite
