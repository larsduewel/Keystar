/** Browser results are untrusted: validate shape for display only, never shared-cache writes. */
export function validBrowserStats(characterId: unknown, raw: unknown): raw is Record<string, unknown> {
  if (!Number.isSafeInteger(characterId) || Number(characterId) <= 0 || !raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const stats = raw as Record<string, unknown>;
  const info = stats.info as { id?: unknown } | undefined;
  return Number(info?.id) === characterId && typeof stats.error !== "string" &&
    [stats.shipsDestroyed, stats.shipsLost].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0);
}
