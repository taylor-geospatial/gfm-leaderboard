import { type Route, navigate, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Github, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/Button";

const NAV: { label: string; route: Route }[] = [
  { label: "Findings", route: "findings" },
  { label: "Reported numbers", route: "leaderboard" },
  { label: "Insights", route: "insights" },
  { label: "Map", route: "map" },
  { label: "Papers", route: "papers" },
  { label: "UMAP", route: "umap" },
  { label: "Network", route: "network" },
  { label: "About", route: "about" },
];

export function Header() {
  const { route } = useRoute();
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="container flex h-14 items-center gap-6">
        <button
          type="button"
          onClick={() => navigate("findings")}
          className="flex items-center gap-2.5 text-left shrink-0"
        >
          {/* TG brandmark — brown square, periwinkle dot, red accent line */}
          <span className="relative grid h-7 w-7 place-items-center rounded-sm bg-foreground overflow-hidden">
            <span className="h-2.5 w-2.5 rounded-full bg-periwinkle" />
            <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-accent" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-semibold tracking-tight whitespace-nowrap">
              State of GeoFMs
            </span>
            <span className="hidden sm:inline text-2xs text-muted-foreground whitespace-nowrap font-mono uppercase tracking-wider">
              Taylor Geospatial
            </span>
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-0.5">
          {NAV.map((item) => (
            <button
              type="button"
              key={item.route}
              onClick={() => navigate(item.route)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                route === item.route
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled
            className="gap-1.5 opacity-50 cursor-not-allowed"
          >
            Paper (Coming Soon)
          </Button>
          <Button asChild size="icon" variant="ghost" aria-label="GitHub">
            <a
              href="https://github.com/isaaccorley/state-of-geofms"
              target="_blank"
              rel="noreferrer noopener"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Toggle theme"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {NAV.map((item) => (
          <button
            type="button"
            key={item.route}
            onClick={() => navigate(item.route)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap",
              route === item.route ? "text-foreground bg-muted" : "text-muted-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
