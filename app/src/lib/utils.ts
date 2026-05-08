import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: digits });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "/");
export const dataUrl = (rel: string) => `${BASE_URL}${rel.replace(/^\//, "")}`;

// results.csv pdf_filename is truncated to 80 chars before .pdf; normalize paper ids to match
export function pdfKey(id: string): string {
  const stem = id.endsWith(".pdf") ? id.slice(0, -4) : id;
  return `${stem.slice(0, 80)}.pdf`;
}
