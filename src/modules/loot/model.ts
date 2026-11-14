import type { Ledger, LootItem } from "./types";
export function parseLoot(text: string, collector: string, day?: string) {
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
    const copied =
      /^(\d{2}:\d{2}:\d{2})\s+(.+?)\s+has looted\s+([\d,]+)\s+x\s+(.+)$/.exec(
        line.trim(),
      );
    const cols = line.split("\t").map((s) => s.trim());
    if (copied && (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)))
      throw new Error("date");
    const name = copied ? copied[4] : cols[hasHeader ? item : 0];
    const raw = copied ? copied[3] : cols[hasHeader ? qty : 1];
    const quantity =
      raw && /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)
        ? Number(raw.replaceAll(",", ""))
        : NaN;
    const person = copied
      ? copied[2]
      : hasHeader && who >= 0
        ? cols[who]
        : collector.trim();
    const rawTime = copied
      ? `${day}T${copied[1]}Z`
      : hasHeader && time >= 0
        ? cols[time]
        : "";
    // EVE export times are UTC; never interpret them in the web server's local zone.
    const stamp = rawTime
      ? Date.parse(
          rawTime
            .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3")
            .replace(" ", "T") + (/Z$|[+-]\d\d:\d\d$/.test(rawTime) ? "" : "Z"),
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
      (rawTime && !Number.isFinite(stamp)) ||
      (copied && !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(copied[1]))
    )
      throw new Error(`line:${i + (hasHeader ? 2 : 1)}`);
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
  const poolCents = Math.round((net - corp) * 100);
  const groupsArray = [...groups.values()];
  let unallocated = 0;
  const allocations = groupsArray.map(() => 0);
  const allocate = (cents: number, weights: number[]) => {
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (!total) {
      unallocated += cents / 100;
      return;
    }
    const parts = weights.map((value) => Math.floor((cents * value) / total));
    let remainder = cents - parts.reduce((sum, value) => sum + value, 0);
    for (let i = 0; remainder > 0 && i < parts.length; i++)
      if (weights[i] > 0) {
        parts[i]++;
        remainder--;
      }
    parts.forEach((value, index) => (allocations[index] += value));
  };
  if (ledger.splitMode === "atLoot") {
    const values = eligible.map((item) => ({
      item,
      value:
        ledger.basis === "sales"
          ? item.status === "sold"
            ? (item.proceeds ?? 0)
            : item.status === "retained"
              ? (item.price ?? 0) * item.quantity
              : 0
          : (item.price ?? 0) * item.quantity,
    }));
    let remaining = poolCents;
    const nonzero = values.filter((row) => row.value > 0);
    nonzero.forEach(({ item, value }, index) => {
      const cents =
        index === nonzero.length - 1
          ? remaining
          : Math.floor((poolCents * value) / gross);
      remaining -= cents;
      const at = item.time ? Date.parse(item.time) : NaN;
      const covered =
        ledger.attendanceFrom !== undefined &&
        at >= Date.parse(ledger.attendanceFrom);
      const weights = groupsArray.map((group) =>
        Math.max(
          0,
          ...ledger.participants
            .filter(
              (p) =>
                covered && p.eligible !== false &&
                (p.payee.trim() || p.name).toLowerCase() ===
                  group.name.toLowerCase() &&
                p.attendance?.some(
                  (visit) =>
                    at >= Date.parse(visit.joined) &&
                    (visit.left
                      ? at < Date.parse(visit.left)
                      : at <= Date.parse(visit.lastSeen)),
                ),
            )
            .map((p) => p.weight),
        ),
      );
      allocate(cents, weights);
    });
  } else
    allocate(
      poolCents,
      groupsArray.map((p) => p.weight),
    );
  const shares = groupsArray.map((p, index) => {
    const entitlement = allocations[index] / 100;
    return {
      ...p,
      entitlement,
      balance: Math.round((entitlement - p.paid - p.retained) * 100) / 100,
    };
  });
  return {
    unallocated,
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
