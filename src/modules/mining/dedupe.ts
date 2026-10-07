/**
 * Postgres rejects an upsert that touches the same key twice in one statement
 * ("ON CONFLICT DO UPDATE command cannot affect row a second time"), which
 * would fail the ledger import on every run until the day leaves ESI's 30-day
 * window. These collapse ESI rows to one per primary key before inserting.
 */

export interface CharacterLedgerRow {
  date: string;
  solarSystemId: number;
  typeId: number;
  quantity: number;
}

/**
 * The personal ledger has no field beyond its key, so a repeat is the same
 * daily total seen twice (pages shifting between requests): keep the larger.
 */
export function dedupeCharacterLedger<T extends CharacterLedgerRow>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.date}|${r.solarSystemId}|${r.typeId}`;
    const prev = byKey.get(key);
    if (!prev || r.quantity > prev.quantity) byKey.set(key, r);
  }
  return [...byKey.values()];
}

export interface ObserverLedgerRow {
  characterId: number;
  date: string;
  typeId: number;
  recordedCorporationId: number;
  quantity: number;
}

/**
 * Observer rows also carry the pilot's corporation, which is not part of the
 * stored key. The same pilot/ore/day under one corporation is a repeat (keep
 * the larger total); under different corporations (the pilot changed corp
 * that day) it is separate ore, so the totals add up and the last listed
 * corporation is kept.
 */
export function dedupeObserverLedger<T extends ObserverLedgerRow>(rows: T[]): T[] {
  const perCorp = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.characterId}|${r.date}|${r.typeId}|${r.recordedCorporationId}`;
    const prev = perCorp.get(key);
    // Delete first so the Map's order follows the last occurrence of each corporation.
    perCorp.delete(key);
    perCorp.set(key, !prev || r.quantity > prev.quantity ? r : prev);
  }
  const byKey = new Map<string, T>();
  for (const r of perCorp.values()) {
    const key = `${r.characterId}|${r.date}|${r.typeId}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...r, quantity: prev.quantity + r.quantity } : r);
  }
  return [...byKey.values()];
}
