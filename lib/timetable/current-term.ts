export function plannerCurrentTerm(): { year: number; sem: number } {
  const year = Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026);
  const sem = Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1);
  return { year, sem };
}
