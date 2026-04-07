/**
 * Normalized capacity from `maxMember` for join rules and detail `permissions.canJoin`.
 * Undefined, null, non-finite, or negative values after truncation are treated as unlimited.
 */
export function computeSpotsTotal(maxMember: number | undefined | null) {
  if (maxMember === undefined || maxMember === null || !Number.isFinite(maxMember)) {
    return Infinity;
  }
  const normalized = Math.trunc(maxMember);
  if (normalized < 0) return Infinity;
  return normalized;
}
