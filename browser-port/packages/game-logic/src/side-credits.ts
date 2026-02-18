export function canAffordSideCredits(
  sideCredits: ReadonlyMap<string, number>,
  normalizedSide: string,
  buildCost: number,
): boolean {
  if (!normalizedSide) {
    return false;
  }
  return Math.max(0, sideCredits.get(normalizedSide) ?? 0) >= Math.max(0, Math.trunc(buildCost));
}

export function withdrawSideCredits(
  sideCredits: Map<string, number>,
  normalizedSide: string,
  amount: number,
): number {
  if (!normalizedSide) {
    return 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const current = sideCredits.get(normalizedSide) ?? 0;
  const requested = Math.max(0, Math.trunc(amount));
  const withdrawn = Math.min(requested, current);
  if (withdrawn === 0) {
    return 0;
  }
  sideCredits.set(normalizedSide, current - withdrawn);
  return withdrawn;
}

export function depositSideCredits(
  sideCredits: Map<string, number>,
  normalizedSide: string,
  amount: number,
): void {
  if (!normalizedSide) {
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const current = sideCredits.get(normalizedSide) ?? 0;
  const deposit = Math.max(0, Math.trunc(amount));
  sideCredits.set(normalizedSide, current + deposit);
}
