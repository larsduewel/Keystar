import { oreGrade } from "./estimator/parse";
import type { TypeRow } from "./queries";

/** A table row: one type, or one ore family with its grades and variants combined. */
export interface OreRow extends TypeRow {
  key: string;
  typeIds: number[];
}

export const singleOreRow = (r: TypeRow): OreRow => ({ ...r, key: String(r.typeId), typeIds: [r.typeId] });

/** The ore family a type belongs to: Scordite II-Grade → Scordite, keyed by class so families never span classes. */
export function oreFamily(name: string, oreClass: TypeRow["oreClass"]): { key: string; name: string; rank: number } {
  const { base, rank } = oreGrade(name);
  return { key: `${oreClass}:${base}`, name: base, rank };
}

/** Combines the grades and variants of each ore (Scordite, Scordite II-Grade, …) into one row named after the family. */
export function groupOreTypes(rows: TypeRow[]): OreRow[] {
  const families = new Map<string, { rank: number; first: TypeRow; row: OreRow }>();
  for (const r of rows) {
    const { key, name: base, rank } = oreFamily(r.name, r.oreClass);
    const family = families.get(key);
    if (!family) {
      families.set(key, { rank, first: r, row: { ...r, name: base, key, typeIds: [r.typeId] } });
      continue;
    }
    const row = family.row;
    // The icon is the lowest grade's, i.e. the plain ore.
    if (rank < family.rank) {
      family.rank = rank;
      row.typeId = r.typeId;
    }
    row.typeIds.push(r.typeId);
    row.quantity += r.quantity;
    row.volume += r.volume;
    row.value += r.value;
    row.groupName ??= r.groupName;
  }
  return [...families.values()].map(({ first, row }) =>
    row.typeIds.length > 1
      ? { ...row, unitPrice: row.quantity && row.value ? row.value / row.quantity : 0 }
      : { ...singleOreRow(first), key: row.key },
  );
}
