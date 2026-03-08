/**
 * Resolve the EVA faction audio prefix from a side/faction name.
 *
 * Source parity: Eva.cpp maps player sides to faction-specific EVA
 * event name prefixes (EvaUSA, EvaChina, EvaGLA).
 */
export function resolveEvaFactionPrefix(side: string): string {
  const upper = side.toUpperCase();
  if (upper.includes('CHINA')) return 'EvaChina';
  if (upper.includes('GLA')) return 'EvaGLA';
  return 'EvaUSA';
}
