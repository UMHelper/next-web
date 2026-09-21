export function shouldShowOfferedBadge(isPreenrollmentOpen: boolean, isOffered: unknown): boolean {
  return !isPreenrollmentOpen && Boolean(isOffered);
}
