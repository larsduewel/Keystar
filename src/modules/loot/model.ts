import type { Ledger, LootItem } from "./types";
export function parseLoot(text: string, collector: string) {
  if (text.length > 200000) throw new Error("limit");
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length || lines.length > 1001) throw new Error("limit");
  const header = lines[0]
    .split("\t")
    .map((s) => s.trim().toLowerCase().replace(/[ _-]/g, ""));
  const item = header.findIndex((s) =>
    ["item", "itemtype", "type", "gegenstand"].includes(s),
  );
  const qty = header.findIndex((s) => ["quantity", "qty", "menge"].includes(s));
  const who = header.findIndex((s) =>
    ["character", "pilot", "player", "collector", "charakter"].includes(s),
  );
  const time = header.findIndex((s) =>
    ["time", "timestamp", "zeit"].includes(s),
  );
  const hasHeader = item >= 0 && qty >= 0;
  return (hasHeader ? lines.slice(1) : lines).map((line, i) => {
    const cols = line.split("\t").map((s) => s.trim());
    const name = cols[hasHeader ? item : 0];
    const raw = cols[hasHeader ? qty : 1];
    const quantity = Number(raw?.replace(/(?<=\d)[, ](?=\d{3}(?:\D|$))/g, ""));
    const person = hasHeader && who >= 0 ? cols[who] : collector.trim();
    const rawTime = hasHeader && time >= 0 ? cols[time] : "";
    // EVE export times are UTC; never interpret them in the web server's local zone.
    const stamp = rawTime
      ? Date.parse(
          rawTime.replaceAll(".", "-").replace(" ", "T") +
            (/Z$|[+-]\d\d:\d\d$/.test(rawTime) ? "" : "Z"),
        )
      : NaN;
    if (
      !name ||
      name.length > 150 ||
      !person ||
      person.length > 100 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 1000000000 ||
      (rawTime && !Number.isFinite(stamp))
    )
      throw new Error(`line:${i + 1}`);
    return {
      name,
      quantity,
      collector: person,
      time: rawTime ? new Date(stamp).toISOString() : null,
    };
  });
}
export function settlement(ledger: Ledger) {
  const eligible = ledger.items.filter((i) => i.status !== "excluded");
  const estimated = eligible.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0,
  );
  const sales = eligible.reduce(
    (sum, i) => sum + (i.status === "sold" ? (i.proceeds ?? 0) : 0),
    0,
  );
  const retained = eligible
    .filter((i) => i.status === "retained")
    .reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const gross = ledger.basis === "sales" ? sales + retained : estimated;
  const missing = eligible.filter(
    (i) =>
      (ledger.basis === "estimate" || i.status === "retained") &&
      i.price === null,
  ).length;
  const net = Math.max(0, gross - ledger.expenses),
    corp = (net * ledger.corpPercent) / 100;
  const groups = new Map<
    string,
    {
      name: string;
      weight: number;
      paid: number;
      retained: number;
      characters: string[];
    }
  >();
  for (const p of ledger.participants) {
    const key = (p.payee.trim() || p.name).toLowerCase();
    const group = groups.get(key) ?? {
      name: p.payee.trim() || p.name,
      weight: 0,
      paid: 0,
      retained: 0,
      characters: [],
    };
    // Alts share one entitlement: use the highest assigned weight, not their sum.
    group.weight = Math.max(group.weight, p.eligible === false ? 0 : p.weight);
    group.paid += p.paid;
    group.characters.push(p.name);
    group.retained += eligible
      .filter((i) => i.status === "retained" && i.retainedBy === p.id)
      .reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);
    groups.set(key, group);
  }
  const weight = [...groups.values()].reduce((s, p) => s + p.weight, 0);
  const poolCents = Math.round((net - corp) * 100);
  const groupsArray = [...groups.values()];
  const allocations = groupsArray.map((p) =>
    weight ? Math.floor((poolCents * p.weight) / weight) : 0,
  );
  let remainder = weight
    ? poolCents - allocations.reduce((sum, n) => sum + n, 0)
    : 0;
  for (let i = 0; remainder > 0 && i < groupsArray.length; i++)
    if (groupsArray[i].weight > 0) {
      allocations[i]++;
      remainder--;
    }
  const shares = groupsArray.map((p, index) => {
    const entitlement = allocations[index] / 100;
    return {
      ...p,
      entitlement,
      balance: Math.round((entitlement - p.paid - p.retained) * 100) / 100,
    };
  });
  return {
    estimated,
    sales,
    retained,
    gross,
    missing,
    corp,
    distributable: net - corp,
    shortfall: Math.max(0, ledger.expenses - gross),
    shares,
  };
}
export function matchLoot(items: LootItem[], ledger: Ledger, end: number) {
  return items.map((item) => {
    const at = item.time ? Date.parse(item.time) : end;
    const candidates = ledger.kills
      .filter(
        (k) =>
          Date.parse(k.time) <= at &&
          k.items.some(
            (drop) =>
              drop.typeId === item.typeId && drop.quantity >= item.quantity,
          ),
      )
      .map((k) => k.id);
    return {
      ...item,
      candidates,
      match:
        item.match === "confirmed" || item.match === "disputed"
          ? item.match
          : candidates.length
            ? ("possible" as const)
            : ("unmatched" as const),
    };
  });
}
export function canReadOperation(
  operation: { ownerId: string; shared: boolean; ledger: Ledger },
  userId: string,
  characterIds: number[],
) {
  return (
    operation.ownerId === userId ||
    (operation.shared &&
      operation.ledger.participants.some(
        (p) => p.characterId !== null && characterIds.includes(p.characterId),
      ))
  );
}

export function flattenedLootItems(
  items: import("@/modules/killboard/zkill").ZkillItem[],
  depth = 0,
): import("@/modules/killboard/zkill").ZkillItem[] {
  if (depth > 10) return [];
  return items.flatMap((item) => [
    item,
    ...flattenedLootItems(item.items ?? [], depth + 1),
  ]);
}
