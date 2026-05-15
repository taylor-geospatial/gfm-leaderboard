import type { Dataset } from "@/lib/data";
import { FAMILIES, FAMILY_COLOR, type Family, classifyMethod } from "@/lib/families";
import { navigate } from "@/lib/router";
import type { UmapPoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import * as React from "react";

interface ViewState {
  tx: number;
  ty: number;
  scale: number;
}

function worldToScreen(x: number, y: number, vs: ViewState, W: number, H: number) {
  return {
    sx: x * vs.scale + vs.tx + W / 2,
    sy: y * vs.scale + vs.ty + H / 2,
  };
}

interface Camera3D {
  rotX: number;
  rotY: number;
  tx: number;
  ty: number;
  scale: number;
}

function project3D(
  x: number,
  y: number,
  z: number,
  cam: Camera3D,
  W: number,
  H: number,
): { sx: number; sy: number; depth: number } {
  const cosY = Math.cos(cam.rotY);
  const sinY = Math.sin(cam.rotY);
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;
  const cosX = Math.cos(cam.rotX);
  const sinX = Math.sin(cam.rotX);
  const y2 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  const fov = 4;
  const depth = z2 + fov;
  const persp = fov / (depth > 0.1 ? depth : 0.1);
  return {
    sx: x1 * persp * cam.scale + cam.tx + W / 2,
    sy: y2 * persp * cam.scale + cam.ty + H / 2,
    depth: z2,
  };
}

export function UmapView({ data }: { data: Dataset }) {
  const { umap, byPaperId } = data;

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState({ W: 800, H: 600 });
  const [vs, setVs] = React.useState<ViewState>({ tx: 0, ty: 0, scale: 60 });
  const [cam3, setCam3] = React.useState<Camera3D>({
    rotX: -0.4,
    rotY: 0.3,
    tx: 0,
    ty: 0,
    scale: 60,
  });
  const [is3D, setIs3D] = React.useState(false);
  const [autoRotate, setAutoRotate] = React.useState(true);
  const [hovered, setHovered] = React.useState<
    (UmapPoint & { family: Family; hasPaper: boolean }) | null
  >(null);
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);
  const [selectedFamily, setSelectedFamily] = React.useState<Family | "all">("all");
  const [query, setQuery] = React.useState("");
  const dragging = React.useRef(false);
  const lastMouse = React.useRef({ x: 0, y: 0 });

  type EnrichedPoint = UmapPoint & { family: Family; hasPaper: boolean };

  // Enrich points with family, centering both 2D and 3D coords around origin so the camera's
  // fixed scale renders the cloud in-frame regardless of the raw coord range.
  const points = React.useMemo(() => {
    const raw = umap.map(
      (p): EnrichedPoint => ({
        ...p,
        family: classifyMethod(p.pretraining_method),
        hasPaper: byPaperId.has(p.id),
      }),
    );
    if (raw.length === 0) return raw;
    const cx2 = raw.reduce((s, p) => s + p.x, 0) / raw.length;
    const cy2 = raw.reduce((s, p) => s + p.y, 0) / raw.length;
    const pts3 = raw.filter((p) => p.x3d != null);
    const cx3 = pts3.length ? pts3.reduce((s, p) => s + p.x3d!, 0) / pts3.length : 0;
    const cy3 = pts3.length ? pts3.reduce((s, p) => s + p.y3d!, 0) / pts3.length : 0;
    const cz3 = pts3.length ? pts3.reduce((s, p) => s + p.z3d!, 0) / pts3.length : 0;
    return raw.map((p) => ({
      ...p,
      x: p.x - cx2,
      y: p.y - cy2,
      x3d: p.x3d != null ? p.x3d - cx3 : p.x3d,
      y3d: p.y3d != null ? p.y3d - cy3 : p.y3d,
      z3d: p.z3d != null ? p.z3d - cz3 : p.z3d,
    }));
  }, [umap, byPaperId]);

  // Auto-fit camera scale once we know the point extent so the cloud fills ~70% of the viewport.
  const fitScale2D = React.useMemo(() => {
    if (points.length === 0) return 60;
    const ext = Math.max(
      ...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))),
    );
    if (!ext || !Number.isFinite(ext)) return 60;
    return Math.min(dims.W, dims.H) * 0.35 / ext;
  }, [points, dims]);
  const fitScale3D = React.useMemo(() => {
    const pts = points.filter((p) => p.x3d != null);
    if (pts.length === 0) return 60;
    const ext = Math.max(
      ...pts.map((p) => Math.max(Math.abs(p.x3d!), Math.abs(p.y3d!), Math.abs(p.z3d ?? 0))),
    );
    if (!ext || !Number.isFinite(ext)) return 60;
    return Math.min(dims.W, dims.H) * 0.25 / ext;
  }, [points, dims]);

  const filteredIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(
      points
        .filter(
          (p) =>
            (selectedFamily === "all" || p.family === selectedFamily) &&
            (!q || p.model_name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)),
        )
        .map((p) => p.id),
    );
  }, [points, selectedFamily, query]);

  // Observe resize
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ W: Math.max(width, 400), H: Math.max(height, 400) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Once we know the extent of the point cloud, seed the camera to fit it.
  const didFit = React.useRef(false);
  React.useEffect(() => {
    if (didFit.current || points.length === 0) return;
    didFit.current = true;
    setVs({ tx: 0, ty: 0, scale: fitScale2D });
    setCam3((c) => ({ ...c, scale: fitScale3D }));
  }, [points.length, fitScale2D, fitScale3D]);

  // Auto-rotate when in 3D mode and not dragging
  React.useEffect(() => {
    if (!is3D || !autoRotate) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!dragging.current) {
        setCam3((c) => ({ ...c, rotY: c.rotY + dt * 0.35 }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [is3D, autoRotate]);

  // Draw
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { W, H } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    // bg
    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "hsl(2 33% 10%)" : "hsl(60 11% 94%)";
    ctx.fillRect(0, 0, W, H);

    const R = 5;

    if (is3D) {
      // Sort by depth for painter's algorithm
      const sorted = [...points]
        .map((pt) => {
          const proj = project3D(pt.x3d ?? pt.x, pt.y3d ?? pt.y, pt.z3d ?? 0, cam3, W, H);
          return { pt, ...proj };
        })
        .sort((a, b) => b.depth - a.depth);

      for (const { pt, sx, sy, depth } of sorted) {
        if (sx < -R || sx > W + R || sy < -R || sy > H + R) continue;
        const active = filteredIds.has(pt.id);
        const isHov = hovered?.id === pt.id;
        // Scale radius with depth
        const fov = 4;
        const persp = fov / (depth + fov > 0.1 ? depth + fov : 0.1);
        const r3 = Math.max(1.5, R * persp * (cam3.scale / Math.max(fitScale3D, 1)));

        ctx.beginPath();
        ctx.arc(sx, sy, isHov ? r3 + 2 : r3, 0, Math.PI * 2);
        ctx.fillStyle = active
          ? `${FAMILY_COLOR[pt.family]}${isHov ? "ff" : "cc"}`
          : isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.10)";
        ctx.fill();
        if (isHov) {
          ctx.strokeStyle = isDark ? "#f4f4eb" : "#3b1e1c";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // label for hovered in 3D
      if (hovered) {
        const { sx, sy } = project3D(
          hovered.x3d ?? hovered.x,
          hovered.y3d ?? hovered.y,
          hovered.z3d ?? 0,
          cam3,
          W,
          H,
        );
        const label = hovered.model_name || hovered.title.slice(0, 28);
        ctx.font = `500 11px "Space Grotesk", ui-sans-serif, sans-serif`;
        const tw = ctx.measureText(label).width;
        const pad = 5;
        const bx = Math.min(sx + 10, W - tw - pad * 2 - 4);
        const by = sy - 24;
        ctx.fillStyle = isDark ? "rgba(59,30,28,0.92)" : "rgba(244,244,235,0.95)";
        ctx.beginPath();
        ctx.roundRect(bx - pad, by - 13, tw + pad * 2, 20, 4);
        ctx.fill();
        ctx.fillStyle = isDark ? "#f4f4eb" : "#3b1e1c";
        ctx.fillText(label, bx, by);
      }

      // 3D rotation hint
      ctx.font = `400 10px "Space Grotesk", ui-sans-serif`;
      ctx.fillStyle = isDark ? "rgba(244,244,235,0.35)" : "rgba(59,30,28,0.35)";
      ctx.fillText("Drag to rotate · scroll to zoom", 10, H - 10);
    } else {
      // 2D draw
      for (const pt of points) {
        const { sx, sy } = worldToScreen(pt.x, pt.y, vs, W, H);
        if (sx < -R || sx > W + R || sy < -R || sy > H + R) continue;
        const active = filteredIds.has(pt.id);
        const isHov = hovered?.id === pt.id;
        ctx.beginPath();
        ctx.arc(sx, sy, isHov ? R + 2.5 : R, 0, Math.PI * 2);
        ctx.fillStyle = active
          ? `${FAMILY_COLOR[pt.family]}${isHov ? "ff" : "cc"}`
          : isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.10)";
        ctx.fill();
        if (isHov) {
          ctx.strokeStyle = isDark ? "#f4f4eb" : "#3b1e1c";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // label for hovered
      if (hovered) {
        const { sx, sy } = worldToScreen(hovered.x, hovered.y, vs, W, H);
        const label = hovered.model_name || hovered.title.slice(0, 28);
        ctx.font = `500 11px "Space Grotesk", ui-sans-serif, sans-serif`;
        const tw = ctx.measureText(label).width;
        const pad = 5;
        const bx = Math.min(sx + 10, W - tw - pad * 2 - 4);
        const by = sy - 24;
        ctx.fillStyle = isDark ? "rgba(59,30,28,0.92)" : "rgba(244,244,235,0.95)";
        ctx.beginPath();
        ctx.roundRect(bx - pad, by - 13, tw + pad * 2, 20, 4);
        ctx.fill();
        ctx.fillStyle = isDark ? "#f4f4eb" : "#3b1e1c";
        ctx.fillText(label, bx, by);
      }
    }
  }, [points, vs, cam3, dims, hovered, filteredIds, is3D]);

  // Hit test — handles both 2D and 3D
  const hitTest = React.useCallback(
    (sx: number, sy: number): (UmapPoint & { family: Family; hasPaper: boolean }) | null => {
      const { W, H } = dims;
      let best: (UmapPoint & { family: Family; hasPaper: boolean }) | null = null;
      let bestD = 12 * 12;
      for (const pt of points) {
        if (!filteredIds.has(pt.id)) continue;
        let screenX: number;
        let screenY: number;
        if (is3D) {
          const proj = project3D(pt.x3d ?? pt.x, pt.y3d ?? pt.y, pt.z3d ?? 0, cam3, W, H);
          screenX = proj.sx;
          screenY = proj.sy;
        } else {
          const s = worldToScreen(pt.x, pt.y, vs, W, H);
          screenX = s.sx;
          screenY = s.sy;
        }
        const d = (screenX - sx) ** 2 + (screenY - sy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = pt as UmapPoint & { family: Family; hasPaper: boolean };
        }
      }
      return best;
    },
    [points, vs, cam3, dims, filteredIds, is3D],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setCursor({ x: e.clientX, y: e.clientY });

    if (dragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (is3D) {
        setCam3((c) => ({
          ...c,
          rotY: c.rotY + dx * 0.008,
          rotX: c.rotX + dy * 0.008,
        }));
      } else {
        setVs((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      }
      setHovered(null);
    } else {
      setHovered(hitTest(sx, sy));
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const moved =
      Math.abs(e.clientX - lastMouse.current.x) < 4 &&
      Math.abs(e.clientY - lastMouse.current.y) < 4;
    dragging.current = false;
    if (moved && hovered?.hasPaper) {
      navigate("papers", { paper: hovered.id });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    if (is3D) {
      setCam3((c) => ({
        ...c,
        scale: Math.max(10, Math.min(400, c.scale * factor)),
      }));
    } else {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { W, H } = dims;
      setVs((v) => {
        const newScale = Math.max(10, Math.min(400, v.scale * factor));
        const wx = (sx - W / 2 - v.tx) / v.scale;
        const wy = (sy - H / 2 - v.ty) / v.scale;
        return {
          scale: newScale,
          tx: sx - W / 2 - wx * newScale,
          ty: sy - H / 2 - wy * newScale,
        };
      });
    }
  };

  const onMouseLeave = () => {
    dragging.current = false;
    setHovered(null);
    setCursor(null);
  };

  // Reset view
  const resetView = () => {
    if (is3D) {
      setCam3({ rotX: -0.4, rotY: 0.3, tx: 0, ty: 0, scale: fitScale3D });
    } else {
      setVs({ tx: 0, ty: 0, scale: fitScale2D });
    }
  };

  const has3D = points.some((p) => p.x3d != null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">SPECTER2 Embedding Space</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            UMAP projection of Semantic Scholar SPECTER2 embeddings — {points.length} papers. Drag
            to pan · scroll to zoom · click a point to open paper.
          </p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
          {/* search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter models…"
              className="h-8 pl-8 pr-3 rounded-md border border-border bg-background text-[13px] w-44 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
          {/* 3D toggle */}
          {has3D && (
            <button
              type="button"
              onClick={() => setIs3D((v) => !v)}
              className={cn(
                "h-8 px-3 rounded-md border text-[12.5px] font-medium transition-colors",
                is3D
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {is3D ? "3D" : "2D"}
            </button>
          )}
          {/* auto-rotate toggle, only in 3D */}
          {has3D && is3D && (
            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              className={cn(
                "h-8 px-3 rounded-md border text-[12.5px] transition-colors",
                autoRotate
                  ? "border-brand-500 bg-brand-500/10 text-brand-500"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {autoRotate ? "Auto-rotate" : "Manual"}
            </button>
          )}
          {/* reset */}
          <button
            type="button"
            onClick={resetView}
            className="h-8 px-3 rounded-md border border-border text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            Reset view
          </button>
        </div>
      </div>

      {/* Family legend / filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedFamily("all")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors",
            selectedFamily === "all"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          All
        </button>
        {FAMILIES.map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setSelectedFamily(selectedFamily === f ? "all" : f)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors",
              selectedFamily === f
                ? "border-transparent text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            style={
              selectedFamily === f
                ? { backgroundColor: FAMILY_COLOR[f], borderColor: FAMILY_COLOR[f] }
                : {}
            }
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: FAMILY_COLOR[f] }}
            />
            {f}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className="relative rounded-lg border border-border overflow-hidden"
        style={{ height: "clamp(420px, 60vh, 720px)" }}
      >
        <canvas
          ref={canvasRef}
          style={{
            cursor: hovered
              ? hovered.hasPaper
                ? "pointer"
                : "default"
              : dragging.current
                ? "grabbing"
                : is3D
                  ? "move"
                  : "grab",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onWheel={onWheel}
        />

        {/* Tooltip card */}
        {hovered && cursor && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover shadow-pop p-3 max-w-[260px]"
            style={{
              left: Math.min(
                cursor.x - (wrapRef.current?.getBoundingClientRect().left ?? 0) + 14,
                dims.W - 280,
              ),
              top: Math.max(cursor.y - (wrapRef.current?.getBoundingClientRect().top ?? 0) - 80, 8),
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: FAMILY_COLOR[classifyMethod(hovered.pretraining_method)],
                }}
              />
              <span className="text-[13px] font-semibold truncate">
                {hovered.model_name || "—"}
              </span>
              {hovered.year && (
                <span className="ml-auto shrink-0 text-[11px] font-mono text-muted-foreground">
                  {hovered.year}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug">
              {hovered.title}
            </p>
            {hovered.citation_count != null && (
              <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                {hovered.citation_count} citations
              </p>
            )}
            {hovered.hasPaper && (
              <p className="text-[11px] text-periwinkle mt-1">Click to open →</p>
            )}
          </div>
        )}

        {/* Count badge */}
        <div className="absolute bottom-3 right-3 rounded-md border border-border bg-background/80 backdrop-blur px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
          {filteredIds.size} / {points.length}
        </div>
      </div>
    </div>
  );
}
