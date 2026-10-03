import type { LatestEvent, PilotProfile } from "./types";

/** Never confuse the lost hull with the final-blow attacker's hull. */
export const eventTargetHull = (event: LatestEvent) => (event.isLoss ? event.shipTypeId : event.otherShipTypeId);

export const newestEvents = (events: LatestEvent[]) => [...events].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));

export function latestEvidence(profile: PilotProfile | null) {
  const events = newestEvents(profile?.recent.latest ?? []);
  return { kill: events.find((e) => !e.isLoss) ?? null, loss: events.find((e) => e.isLoss) ?? null };
}

export function cynoEvidence(profile: PilotProfile | null) {
  return (["covertCyno", "cyno", "industrialCyno"] as const).flatMap((kind) => {
    const fit = profile?.fits[kind];
    return fit && fit.count > 0 ? [{ kind, ...fit }] : [];
  });
}

export interface ObservedGroup {
  time: string;
  systemId: number;
  killmailIds: number[];
  events: LatestEvent[];
  members: { characterId: number; shipTypeId: number | null; time: string; changed: boolean }[];
}

/** Partial local-only reconstruction. Same killmail proves co-attack, never fleet membership.
 * Merge only within 30 minutes of the newest event, same system, with two shared pilots.
 * Losses cannot turn the victim's opponents into associates. No stats-only associations.
 */
export function observedGroups(pilots: { characterId: number; profile: PilotProfile | null }[], now: Date): ObservedGroup[] {
  const encounters = new Map<number, ObservedGroup>();
  for (const pilot of pilots) {
    for (const event of pilot.profile?.recent.latest ?? []) {
      const age = now.getTime() - Date.parse(event.time);
      if (event.isLoss || !Number.isFinite(age) || age < 0 || age > 6 * 60 * 60_000) continue;
      const group = encounters.get(event.killmailId) ?? {
        time: event.time,
        systemId: event.systemId,
        killmailIds: [event.killmailId],
        events: [event],
        members: [],
      };
      if (!group.members.some((m) => m.characterId === pilot.characterId)) {
        group.members.push({ characterId: pilot.characterId, shipTypeId: event.shipTypeId, time: event.time, changed: false });
      }
      encounters.set(event.killmailId, group);
    }
  }
  const groups: ObservedGroup[] = [];
  for (const encounter of [...encounters.values()]
    .filter((g) => g.members.length >= 2)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))) {
    const matches = groups.filter(
      (g) =>
        g.systemId === encounter.systemId &&
        Date.parse(g.time) - Date.parse(encounter.time) <= 30 * 60_000 &&
        encounter.members.filter((m) => g.members.some((n) => n.characterId === m.characterId)).length >= 2,
    );
    if (!matches.length) {
      groups.push(encounter);
      continue;
    }
    // An encounter that bridges several groups joins them: the newest group absorbs the rest.
    const [group, ...rest] = matches;
    for (const other of [...rest, encounter]) absorb(group, other);
    for (const other of rest) groups.splice(groups.indexOf(other), 1);
  }
  return groups;
}

/** `into` is newer than `from`, so its hulls stay and a different older hull marks a change. */
function absorb(into: ObservedGroup, from: ObservedGroup) {
  into.killmailIds.push(...from.killmailIds);
  into.events = newestEvents([...into.events, ...from.events]);
  for (const member of from.members) {
    const existing = into.members.find((m) => m.characterId === member.characterId);
    if (!existing) into.members.push(member);
    else if (member.changed || existing.shipTypeId !== member.shipTypeId) existing.changed = true;
  }
}
