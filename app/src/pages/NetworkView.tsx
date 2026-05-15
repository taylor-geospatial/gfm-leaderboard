import type { Dataset } from "@/lib/data";
import { FAMILIES, FAMILY_COLOR, type Family } from "@/lib/families";
import { navigate } from "@/lib/router";
import type { NetworkEdge, NetworkNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import * as React from "react";

interface ViewState {
  tx: number;
  ty: number;
  scale: number;
}

interface Camera3D {
  rotX: number;
  rotY: number;
  tx: number;
  ty: number;
  scale: number;
}

function worldToScreen2D(x: number, y: number, vs: ViewState, W: number, H: number) {
  return { sx: x * vs.scale + vs.tx + W / 2, sy: y * vs.scale + vs.ty + H / 2 };
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
  const fov = 5;
  const depth = z2 + fov;
  const persp = fov / (depth > 0.1 ? depth : 0.1);
  return {
    sx: x1 * persp * cam.scale + cam.tx + W / 2,
    sy: y2 * persp * cam.scale + cam.ty + H / 2,
    depth: z2,
  };
}

export function NetworkView({ data }: { data: Dataset }) {
  const { network, byPaperId } = data;

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState({ W: 800, H: 600 });
  const [vs, setVs] = React.useState<ViewState>({ tx: 0, ty: 0, scale: 80 });
  const [cam3, setCam3] = React.useState<Camera3D>({
    rotX: -0.45,
    rotY: 0.5,
    tx: 0,
    ty: 0,
    scale: 90,
  });
  const [is3D, setIs3D] = React.useState(true);
  const [autoRotate, setAutoRotate] = React.useState(true);
  const [hovered, setHovered] = React.useState<NetworkNode | null>(null);
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);
  const [selectedFamily, setSelectedFamily] = React.useState<Family | "all">("all");
  const [query, setQuery] = React.useState("");
  const [influentialOnly, setInfluentialOnly] = React.useState(false);
  const [growMode, setGrowMode] = React.useState(false);
  const [yearProgress, setYearProgress] = React.useState(1);
  const [, bumpFrame] = React.useState(0);
  const dragging = React.useRef(false);
  const lastMouse = React.useRef({ x: 0, y: 0 });
  const tRef = React.useRef(0);

  // Enrich nodes; compute z = year-axis (newest at front) and center the cloud around origin
  // so the camera's scale renders it in-frame for any input coord range.
  const { nodes, yearMin, yearMax } = React.useMemo(() => {
    const raw = network?.nodes ?? [];
    const ys = raw.map((n) => n.year ?? 2020).filter((y) => y > 0);
    const ymin = ys.length ? Math.min(...ys) : 2019;
    const ymax = ys.length ? Math.max(...ys) : 2025;
    const span = Math.max(ymax - ymin, 1);
    const cx = raw.length ? raw.reduce((s, n) => s + n.x, 0) / raw.length : 0;
    const cy = raw.length ? raw.reduce((s, n) => s + n.y, 0) / raw.length : 0;
    const enriched = raw.map((n) => {
      const yr = n.year ?? ymin;
      const z = ((yr - ymin) / span - 0.5) * 4.4;
      return {
        ...n,
        x: n.x - cx,
        y: n.y - cy,
        z,
        hasPaper: byPaperId.has(n.id),
      };
    });
    return { nodes: enriched, yearMin: ymin, yearMax: ymax };
  }, [network, byPaperId]);

  const fitScale2D = React.useMemo(() => {
    if (nodes.length === 0) return 80;
    const ext = Math.max(...nodes.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y))));
    if (!ext || !Number.isFinite(ext)) return 80;
    return Math.min(dims.W, dims.H) * 0.35 / ext;
  }, [nodes, dims]);
  const fitScale3D = React.useMemo(() => {
    if (nodes.length === 0) return 90;
    const ext = Math.max(...nodes.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))));
    if (!ext || !Number.isFinite(ext)) return 90;
    return Math.min(dims.W, dims.H) * 0.25 / ext;
  }, [nodes, dims]);
  const didFit = React.useRef(false);
  React.useEffect(() => {
    if (didFit.current || nodes.length === 0) return;
    didFit.current = true;
    setVs({ tx: 0, ty: 0, scale: fitScale2D });
    setCam3((c) => ({ ...c, scale: fitScale3D }));
  }, [nodes.length, fitScale2D, fitScale3D]);

  const edges = network?.edges ?? ([] as NetworkEdge[]);

  const nodeByS2 = React.useMemo(() => {
    const m = new Map<string, (typeof nodes)[0]>();
    for (const n of nodes) m.set(n.s2_id, n);
    return m;
  }, [nodes]);

  const filteredIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(
      nodes
        .filter(
          (n) =>
            (selectedFamily === "all" || n.family === selectedFamily) &&
            (!q || n.label.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)),
        )
        .map((n) => n.s2_id),
    );
  }, [nodes, selectedFamily, query]);

  const yearCutoff = yearMin + (yearMax - yearMin) * yearProgress;

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

  React.useEffect(() => {
    if (!is3D && !growMode) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tRef.current += dt;
      if (is3D && autoRotate && !dragging.current) {
        setCam3((c) => ({ ...c, rotY: c.rotY + dt * 0.25 }));
      }
      if (growMode) {
        setYearProgress((p) => {
          const next = p + dt / 8;
          if (next >= 1.05) return 0;
          return next;
        });
      } else {
        setYearProgress((p) => (p < 1 ? Math.min(1, p + dt * 1.5) : 1));
      }
      // Force a re-render so the canvas redraws with the updated pulse phase even when
      // no other state changed this frame.
      bumpFrame((n) => n + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [is3D, autoRotate, growMode]);

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

    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "hsl(2 33% 10%)" : "hsl(60 11% 94%)";
    ctx.fillRect(0, 0, W, H);

    const maxDeg = Math.max(...nodes.map((n) => n.in_degree), 1);
    const t = tRef.current;

    if (is3D) {
      const proj = new Map<
        string,
        { sx: number; sy: number; depth: number; node: (typeof nodes)[0] }
      >();
      for (const n of nodes) {
        if ((n.year ?? yearMin) > yearCutoff) continue;
        const p = project3D(n.x, n.y, n.z, cam3, W, H);
        proj.set(n.s2_id, { ...p, node: n });
      }

      // Edges (only between visible nodes)
      for (const e of edges) {
        if (influentialOnly && !e.influential) continue;
        const src = proj.get(e.source);
        const tgt = proj.get(e.target);
        if (!src || !tgt) continue;
        const srcActive = filteredIds.has(e.source);
        const tgtActive = filteredIds.has(e.target);
        if (!srcActive && !tgtActive) continue;
        const isHovEdge = hovered?.s2_id === e.source || hovered?.s2_id === e.target;
        ctx.beginPath();
        ctx.moveTo(src.sx, src.sy);
        ctx.lineTo(tgt.sx, tgt.sy);
        ctx.strokeStyle = e.influential
          ? `rgba(255,79,44,${isHovEdge ? 0.5 : 0.25})`
          : isDark
            ? `rgba(255,255,255,${isHovEdge ? 0.2 : 0.06})`
            : `rgba(0,0,0,${isHovEdge ? 0.2 : 0.06})`;
        ctx.lineWidth = e.influential ? 1.4 : 0.7;
        ctx.stroke();
      }

      // Nodes (sorted back-to-front)
      const sorted = [...proj.values()].sort((a, b) => b.depth - a.depth);
      for (const { sx, sy, depth, node: nd } of sorted) {
        if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
        const active = filteredIds.has(nd.s2_id);
        const isHov = hovered?.s2_id === nd.s2_id;
        const fov = 5;
        const persp = fov / (depth + fov > 0.1 ? depth + fov : 0.1);
        const baseR = 3 + (nd.in_degree / maxDeg) * 7;
        // Pulse on highly-connected nodes
        const pulseAmp = (nd.in_degree / maxDeg) * 1.6;
        const pulse = 1 + pulseAmp * 0.06 * Math.sin(t * 2 + nd.x * 1.3);
        const r = baseR * persp * (cam3.scale / 90) * pulse;

        // Glow for hubs
        if (nd.in_degree / maxDeg > 0.5 && active) {
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
          const baseColor = FAMILY_COLOR[nd.family as Family] ?? FAMILY_COLOR.Other;
          grad.addColorStop(0, `${baseColor}55`);
          grad.addColorStop(1, `${baseColor}00`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, isHov ? r + 2 : r, 0, Math.PI * 2);
        ctx.fillStyle = active
          ? `${FAMILY_COLOR[nd.family as Family] ?? FAMILY_COLOR.Other}${isHov ? "ff" : "dd"}`
          : isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.08)";
        ctx.fill();
        if (isHov) {
          ctx.strokeStyle = isDark ? "#f4f4eb" : "#3b1e1c";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (hovered) {
        const hp = proj.get(hovered.s2_id);
        if (hp) {
          const label = hovered.label || hovered.title.slice(0, 28);
          ctx.font = `500 11px "Space Grotesk", ui-sans-serif`;
          const tw = ctx.measureText(label).width;
          const pad = 5;
          const bx = Math.min(hp.sx + 10, W - tw - pad * 2 - 4);
          const by = hp.sy - 24;
          ctx.fillStyle = isDark ? "rgba(59,30,28,0.92)" : "rgba(244,244,235,0.95)";
          ctx.beginPath();
          ctx.roundRect(bx - pad, by - 13, tw + pad * 2, 20, 4);
          ctx.fill();
          ctx.fillStyle = isDark ? "#f4f4eb" : "#3b1e1c";
          ctx.fillText(label, bx, by);
        }
      }

      // Year readout when growing
      if (growMode || yearProgress < 0.999) {
        ctx.font = `600 22px "Space Grotesk", ui-sans-serif`;
        ctx.fillStyle = isDark ? "rgba(244,244,235,0.45)" : "rgba(59,30,28,0.4)";
        ctx.fillText(`${Math.floor(yearCutoff)}`, 14, 30);
      }

      // Hint
      ctx.font = `400 10px "Space Grotesk", ui-sans-serif`;
      ctx.fillStyle = isDark ? "rgba(244,244,235,0.32)" : "rgba(59,30,28,0.32)";
      ctx.fillText("Drag to rotate · scroll to zoom · z-axis = year", 12, H - 12);
      return;
    }

    for (const e of edges) {
      if (influentialOnly && !e.influential) continue;
      const src = nodeByS2.get(e.source);
      const tgt = nodeByS2.get(e.target);
      if (!src || !tgt) continue;
      if ((src.year ?? yearMin) > yearCutoff || (tgt.year ?? yearMin) > yearCutoff) continue;
      const srcActive = filteredIds.has(e.source);
      const tgtActive = filteredIds.has(e.target);
      if (!srcActive && !tgtActive) continue;
      const { sx: x1, sy: y1 } = worldToScreen2D(src.x, src.y, vs, W, H);
      const { sx: x2, sy: y2 } = worldToScreen2D(tgt.x, tgt.y, vs, W, H);
      const isHovEdge = hovered?.s2_id === e.source || hovered?.s2_id === e.target;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isDark
        ? isHovEdge
          ? "rgba(244,244,235,0.35)"
          : e.influential
            ? "rgba(255,79,44,0.25)"
            : "rgba(255,255,255,0.05)"
        : isHovEdge
          ? "rgba(59,30,28,0.35)"
          : e.influential
            ? "rgba(255,79,44,0.25)"
            : "rgba(0,0,0,0.05)";
      ctx.lineWidth = e.influential ? 1.5 : 0.75;
      ctx.stroke();
    }

    for (const nd of nodes) {
      if ((nd.year ?? yearMin) > yearCutoff) continue;
      const { sx, sy } = worldToScreen2D(nd.x, nd.y, vs, W, H);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const active = filteredIds.has(nd.s2_id);
      const isHov = hovered?.s2_id === nd.s2_id;
      const baseR = 3 + (nd.in_degree / maxDeg) * 6;
      const pulse = 1 + (nd.in_degree / maxDeg) * 0.08 * Math.sin(t * 2 + nd.x * 1.3);
      const R = baseR * pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, isHov ? R + 2 : R, 0, Math.PI * 2);
      ctx.fillStyle = active
        ? `${FAMILY_COLOR[nd.family as Family] ?? FAMILY_COLOR.Other}${isHov ? "ff" : "cc"}`
        : isDark
          ? "rgba(255,255,255,0.07)"
          : "rgba(0,0,0,0.09)";
      ctx.fill();
      if (isHov) {
        ctx.strokeStyle = isDark ? "#f4f4eb" : "#3b1e1c";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (hovered) {
      const { sx, sy } = worldToScreen2D(hovered.x, hovered.y, vs, W, H);
      const label = hovered.label || hovered.title.slice(0, 28);
      ctx.font = `500 11px "Space Grotesk", ui-sans-serif`;
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

    if (growMode || yearProgress < 0.999) {
      ctx.font = `600 22px "Space Grotesk", ui-sans-serif`;
      ctx.fillStyle = isDark ? "rgba(244,244,235,0.45)" : "rgba(59,30,28,0.4)";
      ctx.fillText(`${Math.floor(yearCutoff)}`, 14, 30);
    }
  });

  const hitTest = React.useCallback(
    (sx: number, sy: number): NetworkNode | null => {
      const { W, H } = dims;
      const maxDeg = Math.max(...nodes.map((n) => n.in_degree), 1);
      let best: NetworkNode | null = null;
      let bestD = 16 * 16;
      for (const nd of nodes) {
        if (!filteredIds.has(nd.s2_id)) continue;
        if ((nd.year ?? yearMin) > yearCutoff) continue;
        let screenX: number;
        let screenY: number;
        if (is3D) {
          const p = project3D(nd.x, nd.y, nd.z, cam3, W, H);
          screenX = p.sx;
          screenY = p.sy;
        } else {
          const s = worldToScreen2D(nd.x, nd.y, vs, W, H);
          screenX = s.sx;
          screenY = s.sy;
        }
        const R = 3 + (nd.in_degree / maxDeg) * 7;
        const d = (screenX - sx) ** 2 + (screenY - sy) ** 2;
        if (d < bestD && d < (R + 6) * (R + 6)) {
          bestD = d;
          best = nd;
        }
      }
      return best;
    },
    [nodes, vs, cam3, dims, filteredIds, is3D, yearCutoff, yearMin],
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
          rotY: c.rotY + dx * 0.01,
          rotX: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, c.rotX + dy * 0.01)),
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
      setCam3((c) => ({ ...c, scale: Math.max(20, Math.min(400, c.scale * factor)) }));
    } else {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { W, H } = dims;
      setVs((v) => {
        const newScale = Math.max(8, Math.min(500, v.scale * factor));
        const wx = (sx - W / 2 - v.tx) / v.scale;
        const wy = (sy - H / 2 - v.ty) / v.scale;
        return { scale: newScale, tx: sx - W / 2 - wx * newScale, ty: sy - H / 2 - wy * newScale };
      });
    }
  };
  const onMouseLeave = () => {
    dragging.current = false;
    setHovered(null);
    setCursor(null);
  };

  const resetView = () => {
    setVs({ tx: 0, ty: 0, scale: 80 });
    setVs({ tx: 0, ty: 0, scale: fitScale2D });
    setCam3({ rotX: -0.45, rotY: 0.5, tx: 0, ty: 0, scale: fitScale3D });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Citation Network</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Within-corpus citations — {nodes.length} papers, {influentialOnly ? `${edges.filter((e) => e.influential).length} influential` : edges.length}{" "}
            edges. Z-axis = publication year ({yearMin}–{yearMax}). Drag to rotate · scroll to zoom
            · click hub to open paper.
          </p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="h-8 pl-8 pr-3 rounded-md border border-border bg-background text-[13px] w-36 focus:outline-none focus:ring-2 focus:ring-ring"
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
          {is3D && (
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
          <button
            type="button"
            onClick={() => {
              if (growMode) {
                setGrowMode(false);
                setYearProgress(1);
              } else {
                setYearProgress(0);
                setGrowMode(true);
              }
            }}
            className={cn(
              "h-8 px-3 rounded-md border text-[12.5px] transition-colors",
              growMode
                ? "border-brand-500 bg-brand-500/10 text-brand-500"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {growMode ? "Stop replay" : "Replay growth"}
          </button>
          <button
            type="button"
            onClick={() => setInfluentialOnly((v) => !v)}
            className={cn(
              "h-8 px-3 rounded-md border text-[12.5px] transition-colors",
              influentialOnly
                ? "border-brand-500 bg-brand-500/10 text-brand-500"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {influentialOnly ? "Influential" : "All edges"}
          </button>
          <button
            type="button"
            onClick={resetView}
            className="h-8 px-3 rounded-md border border-border text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

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
                : "grab",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onWheel={onWheel}
        />

        {hovered && cursor && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover shadow-pop p-3 max-w-[260px]"
            style={{
              left: Math.min(
                cursor.x - (wrapRef.current?.getBoundingClientRect().left ?? 0) + 14,
                dims.W - 280,
              ),
              top: Math.max(cursor.y - (wrapRef.current?.getBoundingClientRect().top ?? 0) - 90, 8),
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: FAMILY_COLOR[hovered.family as Family] ?? FAMILY_COLOR.Other,
                }}
              />
              <span className="text-[13px] font-semibold truncate">{hovered.label || "—"}</span>
              {hovered.year && (
                <span className="ml-auto shrink-0 text-[11px] font-mono text-muted-foreground">
                  {hovered.year}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug">
              {hovered.title}
            </p>
            <div className="flex gap-3 mt-1">
              {hovered.citation_count != null && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  {hovered.citation_count} citations
                </p>
              )}
              <p className="text-[11px] text-muted-foreground font-mono">
                in-degree: {hovered.in_degree}
              </p>
            </div>
            {hovered.hasPaper && (
              <p className="text-[11px] text-periwinkle mt-1">Click to open →</p>
            )}
          </div>
        )}

        <div className="absolute bottom-3 right-3 rounded-md border border-border bg-background/80 backdrop-blur px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
          {filteredIds.size} / {nodes.length}
        </div>
      </div>
    </div>
  );
}
