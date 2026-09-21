import unidecode from "unidecode";

export function normalizeProfName(raw: string): string {
  return unidecode(raw ?? "").trim();
}

export function splitProfNames(raw: string): string[] {
  const normalized = normalizeProfName(raw);
  if (!normalized) return [];
  return Array.from(new Set(normalized.split(" / ").map((name) => name.trim()).filter(Boolean)));
}
