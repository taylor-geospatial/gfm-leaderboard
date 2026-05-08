import type { Paper } from "./types";

export type Family = "MAE" | "Contrastive" | "VLM" | "Generative" | "JEPA" | "Other";

export const FAMILIES: Family[] = ["MAE", "Contrastive", "VLM", "Generative", "JEPA", "Other"];

export const FAMILY_COLOR: Record<Family, string> = {
  MAE: "#ff4f2c",
  Contrastive: "#80a0d8",
  VLM: "#a7d0dc",
  Generative: "#cff29e",
  JEPA: "#C8803E",
  Other: "#94a3b8",
};

export function classifyMethod(method: string, isVLM = false): Family {
  const m = method.toLowerCase();
  if (/jepa/.test(m)) return "JEPA";
  if (/(mae|masked image|masked autoenc|mim\b|reconstruction)/.test(m)) return "MAE";
  if (/(contrastive|simclr|moco|dino|byol|info\s?nce|simsiam)/.test(m)) return "Contrastive";
  if (isVLM || /(vlm|vision[- ]?language|clip|caption|text|multimodal)/.test(m)) return "VLM";
  if (/(generative|diffus|gan|autoreg|next[- ]token)/.test(m)) return "Generative";
  return "Other";
}

export function classifyFamily(p: Paper): Family {
  const blob = `${p.pretraining.method ?? ""} ${p.pretraining.objective ?? ""}`;
  return classifyMethod(blob, p.pretraining.is_vision_language === true);
}
