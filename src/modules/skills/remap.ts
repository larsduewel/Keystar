/**
 * Neural remap optimiser: which attribute remap trains the current skill queue the fastest. Pure: no database, no ESI.
 *
 * A remap redistributes the base attributes: each stays between 17 and 27 and they always add up to 99. Implants add
 * to the base attributes, and ESI's /characters/{id}/attributes already includes them, so the remappable base is the
 * ESI value minus the implant bonuses. Training speed is primary + secondary / 2 SP per minute (Omega).
 */
import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_NAMES,
  remainingSp,
  summarizeQueue,
  type AttributeName,
  type QueueEntry,
  type SkillTrainingAttributes,
} from "./queue";

export type AttributeSet = Record<AttributeName, number>;

export const REMAP_BASE_MIN = 17;
export const REMAP_BASE_MAX = 27;
export const REMAP_BASE_TOTAL = 99;

/**
 * A remap locks the attributes in: the yearly remap comes back after 365 days and bonus remaps never come back. A
 * queue shorter than this is flagged, as the remap would mostly go to waste.
 */
export const REMAP_MIN_QUEUE_DAYS = 180;
const MINUTES_PER_DAY = 1440;

/** Dogma attributes of an implant: its bonus to each character attribute. */
export const DOGMA_IMPLANT_BONUS: Record<AttributeName, number> = {
  charisma: 175,
  intelligence: 176,
  memory: 177,
  perception: 178,
  willpower: 179,
};

const NAME_BY_ID = new Map<number, AttributeName>(ATTRIBUTE_NAMES.map((name) => [ATTRIBUTE_IDS[name], name]));

export const zeroAttributes = (): AttributeSet => ({ charisma: 0, intelligence: 0, memory: 0, perception: 0, willpower: 0 });

/** Attribute bonuses from a type's `dogma_attributes`, or null when it boosts no attribute (most implants). */
export function parseImplantDogma(dogma: { attribute_id: number; value: number }[] | undefined): AttributeSet | null {
  const bonus = zeroAttributes();
  let any = false;
  for (const name of ATTRIBUTE_NAMES) {
    const value = dogma?.find((a) => a.attribute_id === DOGMA_IMPLANT_BONUS[name])?.value;
    if (value) {
      bonus[name] = Math.round(value);
      any = true;
    }
  }
  return any ? bonus : null;
}

/** Training speed in SP per minute for a skill with these primary/secondary attributes (dogma ids). */
export function spPerMinute(attributes: AttributeSet, primaryAttribute: number, secondaryAttribute: number): number {
  const primary = NAME_BY_ID.get(primaryAttribute);
  const secondary = NAME_BY_ID.get(secondaryAttribute);
  return (primary ? attributes[primary] : 0) + (secondary ? attributes[secondary] : 0) / 2;
}

/** SP to train, summed per primary/secondary attribute pair. */
export interface SpGroup {
  primaryAttribute: number;
  secondaryAttribute: number;
  sp: number;
}

/** Minutes to train all groups with these (effective) attributes. */
export function queueTrainingMinutes(groups: SpGroup[], attributes: AttributeSet): number {
  let minutes = 0;
  for (const g of groups) {
    const speed = spPerMinute(attributes, g.primaryAttribute, g.secondaryAttribute);
    if (g.sp > 0) minutes += speed > 0 ? g.sp / speed : Infinity;
  }
  return minutes;
}

/** Whether these base attributes are a legal remap (17–27 each, 99 in total). */
export function isValidBase(base: AttributeSet): boolean {
  let total = 0;
  for (const name of ATTRIBUTE_NAMES) {
    const v = base[name];
    if (!Number.isInteger(v) || v < REMAP_BASE_MIN || v > REMAP_BASE_MAX) return false;
    total += v;
  }
  return total === REMAP_BASE_TOTAL;
}

/** Every legal remap. */
export function allRemaps(): AttributeSet[] {
  const out: AttributeSet[] = [];
  const values: number[] = [];
  const walk = (i: number, left: number) => {
    const remainingSlots = ATTRIBUTE_NAMES.length - i;
    if (remainingSlots === 0) {
      if (left === 0) out.push(Object.fromEntries(ATTRIBUTE_NAMES.map((n, k) => [n, values[k]])) as AttributeSet);
      return;
    }
    for (let v = REMAP_BASE_MIN; v <= REMAP_BASE_MAX; v++) {
      const rest = left - v;
      // The other attributes must still fit within their bounds.
      if (rest < (remainingSlots - 1) * REMAP_BASE_MIN || rest > (remainingSlots - 1) * REMAP_BASE_MAX) continue;
      values[i] = v;
      walk(i + 1, rest);
    }
  };
  walk(0, REMAP_BASE_TOTAL);
  return out;
}

let remapCache: AttributeSet[] | null = null;

const distance = (a: AttributeSet, b: AttributeSet) => ATTRIBUTE_NAMES.reduce((sum, n) => sum + Math.abs(a[n] - b[n]), 0);

export interface RemapInput {
  entries: QueueEntry[];
  /** Primary/secondary attribute and rank per skill id; queue entries for unknown skills are left out. */
  skillAttributes: Map<number, SkillTrainingAttributes>;
  /** Attributes as ESI reports them (base + implants). */
  effective: AttributeSet;
  /** Summed implant bonuses; null when unknown (implants not shared or not synced yet). */
  implants: AttributeSet | null;
  now: Date;
}

export interface RemapResult {
  /** Base attributes now (ESI attributes minus implants; just the ESI attributes when not `comparable`). */
  currentBase: AttributeSet;
  /** The fastest remap; null when not `comparable`, as unknown implants can change which remap is fastest. */
  recommendedBase: AttributeSet | null;
  /** Implant bonuses assumed (zero when unknown or inconsistent). */
  implants: AttributeSet;
  /** Minutes to train the queue with the current attributes. */
  currentMinutes: number;
  /** Minutes after the recommended remap, and the difference; null when not `comparable`. */
  recommendedMinutes: number | null;
  savedMinutes: number | null;
  /**
   * The base attributes are known (ESI attributes minus implants is a legal remap). Otherwise unknown implants (or a
   * booster) add points that a remap keeps; they change which remap is fastest too, so nothing is recommended.
   */
  comparable: boolean;
  /** The current attributes are already the best remap. */
  optimal: boolean;
  /** Queue entries without SP or skill data, left out of the calculation. */
  unknownEntries: number;
  /** Entries taken into account. */
  countedEntries: number;
  /** Implants were not known, or ESI attributes minus implants is not a legal remap (e.g. an active booster). */
  implantsUncertain: boolean;
}

/**
 * The remap that trains the whole remaining queue the fastest. Tries every legal remap (a few thousand); on equal
 * time the current attributes win, then the remap closest to them, so the advice never moves points for nothing.
 */
export function optimizeRemap({ entries, skillAttributes, effective, implants, now }: RemapInput): RemapResult {
  const pending = summarizeQueue(entries, now).entries;
  const groups = new Map<string, SpGroup>();
  let unknownEntries = 0;
  for (const e of pending) {
    const sp = remainingSp(e, now);
    const attrs = skillAttributes.get(e.skillId);
    if (sp === null || !attrs) {
      unknownEntries++;
      continue;
    }
    const key = `${attrs.primaryAttribute}:${attrs.secondaryAttribute}`;
    const group = groups.get(key);
    if (group) group.sp += sp;
    else groups.set(key, { primaryAttribute: attrs.primaryAttribute, secondaryAttribute: attrs.secondaryAttribute, sp });
  }
  const spGroups = [...groups.values()];

  let assumedImplants = implants ?? zeroAttributes();
  let currentBase = subtract(effective, assumedImplants);
  let implantsUncertain = implants === null;
  if (!isValidBase(currentBase)) {
    implantsUncertain = true;
    // Implant data doesn't match the attributes: fall back to none, which is right for most characters.
    assumedImplants = zeroAttributes();
    currentBase = { ...effective };
  }

  const currentMinutes = queueTrainingMinutes(spGroups, effective);
  const comparable = isValidBase(currentBase);
  const result = {
    currentBase,
    implants: assumedImplants,
    currentMinutes,
    comparable,
    unknownEntries,
    countedEntries: pending.length - unknownEntries,
    implantsUncertain,
  };
  if (!comparable) return { ...result, recommendedBase: null, recommendedMinutes: null, savedMinutes: null, optimal: false };

  // Thousands of candidates per character: resolve attribute names once and score without allocating.
  const scored = spGroups
    .filter((g) => g.sp > 0)
    .map((g) => ({ p: NAME_BY_ID.get(g.primaryAttribute), s: NAME_BY_ID.get(g.secondaryAttribute), sp: g.sp }));
  const minutesWith = (base: AttributeSet) => {
    let minutes = 0;
    for (const g of scored) {
      const speed = (g.p ? base[g.p] + assumedImplants[g.p] : 0) + (g.s ? base[g.s] + assumedImplants[g.s] : 0) / 2;
      minutes += speed > 0 ? g.sp / speed : Infinity;
    }
    return minutes;
  };
  let best = currentBase;
  let bestMinutes = minutesWith(currentBase);
  const EPSILON = 1e-9;
  for (const candidate of (remapCache ??= allRemaps())) {
    const minutes = minutesWith(candidate);
    const better =
      minutes < bestMinutes - EPSILON ||
      (minutes <= bestMinutes + EPSILON && distance(candidate, currentBase) < distance(best, currentBase));
    if (better) {
      best = candidate;
      bestMinutes = minutes;
    }
  }
  const optimal = distance(best, currentBase) === 0;
  const recommendedMinutes = optimal ? currentMinutes : bestMinutes;
  return { ...result, recommendedBase: best, recommendedMinutes, savedMinutes: Math.max(0, currentMinutes - recommendedMinutes), optimal };
}

function subtract(a: AttributeSet, b: AttributeSet): AttributeSet {
  const out = zeroAttributes();
  for (const name of ATTRIBUTE_NAMES) out[name] = a[name] - b[name];
  return out;
}

export interface RemapAvailability {
  /** A remap can be done now (yearly or bonus). */
  available: boolean;
  yearlyAvailable: boolean;
  /** When the yearly remap is available again (null when it already is). */
  yearlyAt: Date | null;
  bonusRemaps: number;
}

export function remapAvailability(c: { accruedRemapCooldownDate: Date | null; bonusRemaps: number | null }, now: Date): RemapAvailability {
  const yearlyAvailable = !c.accruedRemapCooldownDate || c.accruedRemapCooldownDate.getTime() <= now.getTime();
  const bonusRemaps = c.bonusRemaps ?? 0;
  return {
    available: yearlyAvailable || bonusRemaps > 0,
    yearlyAvailable,
    yearlyAt: yearlyAvailable ? null : c.accruedRemapCooldownDate,
    bonusRemaps,
  };
}

/** The queue (after the remap) is shorter than REMAP_MIN_QUEUE_DAYS: too short to make good use of a remap. */
export function isShortQueue(minutes: number): boolean {
  return minutes < REMAP_MIN_QUEUE_DAYS * MINUTES_PER_DAY;
}
