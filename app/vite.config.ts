import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Static-deploy friendly: build output goes to app/dist/, base is "./" so it
// can be served from any sub-path (e.g. GitHub Pages /state-of-geofms/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  publicDir: "data",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1100, // maplibre is ~1MB; flagged but acceptable for /map
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("maplibre-gl")) return "vendor-map";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("@tanstack/react-table")) return "vendor-table";
            if (id.includes("@radix-ui")) return "vendor-radix";
          }
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true },
});
