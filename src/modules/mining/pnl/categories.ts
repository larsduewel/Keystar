import { ASTEROID_CATEGORY_ID, GAS_GROUP_IDS, ICE_GROUP_IDS } from "@/core/eve/ore";
import type { ChartClass } from "../class-colors";

/**
 * Mining expense categories and the auto-tagging of wallet purchases by item
 * type/group, plus the income categories of wallet sales. Isomorphic; labels are in the dictionaries (`t.pnl.categories`). Group and type ids from ESI /universe/groups and
 * /universe/types (checked against Tranquility).
 */
export const EXPENSE_CATEGORIES = ["crystals", "fuel", "bursts", "drones", "ships", "fees", "subscription", "other"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Types in generic groups (Venture is a "Frigate", Pioneer a "Destroyer"; industrial
 * cores share "Siege Module" with dreadnought sieges, foreman bursts "Command Burst"
 * with combat bursts, drone mining rigs "Rig Drones" with combat rigs); checked before groups.
 */
const TYPE_CATEGORIES: Record<number, ExpenseCategory> = {
  16272: "fuel", // Heavy Water
  32880: "ships", // Venture
  89240: "ships", // Pioneer
  89647: "ships", // Pioneer Consortium Issue
  62590: "ships", // Medium Industrial Core I
  62591: "ships", // Medium Industrial Core II
  58945: "ships", // Large Industrial Core I
  58950: "ships", // Large Industrial Core II
  28583: "ships", // Capital Industrial Core I
  42890: "ships", // Capital Industrial Core II
  42528: "ships", // Mining Foreman Burst I
  43551: "ships", // Mining Foreman Burst II
  92456: "ships", // Presidential Mining Foreman Burst
  32041: "ships", // Small Drone Mining Augmentor I
  32045: "ships", // Small Drone Mining Augmentor II
  32043: "ships", // Medium Drone Mining Augmentor I
  32047: "ships", // Medium Drone Mining Augmentor II
  25918: "ships", // Large Drone Mining Augmentor I
  26328: "ships", // Large Drone Mining Augmentor II
  33285: "ships", // Capital Drone Mining Augmentor I
  33287: "ships", // Capital Drone Mining Augmentor II
};

const GROUP_CATEGORIES: Record<number, ExpenseCategory> = {
  482: "crystals", // Mining Crystal
  663: "crystals", // Mercoxit Mining Crystal
  1771: "bursts", // Mining Foreman Burst Charges
  101: "drones", // Mining Drone
  463: "ships", // Mining Barge
  543: "ships", // Exhumer
  941: "ships", // Industrial Command Ship
  883: "ships", // Capital Industrial Ship
  1283: "ships", // Expedition Frigate
  54: "ships", // Mining Laser
  464: "ships", // Strip Miner
  483: "ships", // Frequency Mining Laser
  546: "ships", // Mining Upgrade
  737: "ships", // Gas Cloud Scoops
  4138: "ships", // Gas Cloud Harvesters
  904: "ships", // Rig Mining
  4174: "ships", // Compressors
  49: "ships", // Mining Survey Chipset
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

/** Category a purchase is auto-tagged with, or null when it isn't an obvious mining cost. */
export function classifyPurchase(typeId: number, groupId: number | null | undefined): ExpenseCategory | null {
  return TYPE_CATEGORIES[typeId] ?? (groupId == null ? null : (GROUP_CATEGORIES[groupId] ?? null));
}

/** SQL CASE equivalent of classifyPurchase (NULL when untagged). */
export function purchaseCategorySqlCase(typeCol: string, groupCol: string): string {
  const types = Object.entries(TYPE_CATEGORIES).map(([id, c]) => `WHEN ${typeCol} = ${id} THEN '${c}'`);
  const groups = Object.entries(GROUP_CATEGORIES).map(([id, c]) => `WHEN ${groupCol} = ${id} THEN '${c}'`);
  return `CASE ${[...types, ...groups].join(" ")} ELSE NULL END`;
}

/**
 * Income categories of wallet sales: the activity the sold item comes from, so sales line up with the mining
 * activities (and their chart colours).
 */
export const INCOME_CATEGORIES = ["ore", "moon", "ice", "gas", "other"] as const satisfies readonly ChartClass[];

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

const MINERAL_GROUP_ID = 18;
const MOON_MATERIALS_GROUP_ID = 427;
const ICE_PRODUCT_GROUP_ID = 423;
const COMPRESSED_GAS_GROUP_ID = 4168;
const MOON_ORE_GROUP_IDS = [1884, 1920, 1921, 1922, 1923];

/**
 * Sale groups checked before the Asteroid category: moon ore, ice and gas (raw or compressed; compressed ore and ice
 * share the raw groups) and what they refine into. Minerals count as ore, the bulk of them comes from asteroid ore.
 */
const SALE_GROUPS: Record<number, IncomeCategory> = {
  ...Object.fromEntries(MOON_ORE_GROUP_IDS.map((g) => [g, "moon"])),
  ...Object.fromEntries(ICE_GROUP_IDS.map((g) => [g, "ice"])),
  ...Object.fromEntries(GAS_GROUP_IDS.map((g) => [g, "gas"])),
  [COMPRESSED_GAS_GROUP_ID]: "gas",
  [MINERAL_GROUP_ID]: "ore",
  [MOON_MATERIALS_GROUP_ID]: "moon",
  [ICE_PRODUCT_GROUP_ID]: "ice",
};

export function isIncomeCategory(value: unknown): value is IncomeCategory {
  return typeof value === "string" && (INCOME_CATEGORIES as readonly string[]).includes(value);
}

/** Category a sale is auto-tagged with (ore, minerals, moon materials, ice products, gas), or null. */
export function classifySale(groupId: number | null | undefined, categoryId: number | null | undefined): IncomeCategory | null {
  if (groupId != null && SALE_GROUPS[groupId]) return SALE_GROUPS[groupId];
  return categoryId === ASTEROID_CATEGORY_ID ? "ore" : null;
}

/** SQL CASE equivalent of classifySale (NULL when untagged). */
export function saleCategorySqlCase(groupCol: string, categoryCol: string): string {
  const groups = Object.entries(SALE_GROUPS).map(([id, c]) => `WHEN ${groupCol} = ${id} THEN '${c}'`);
  return `CASE ${groups.join(" ")} WHEN ${categoryCol} = ${ASTEROID_CATEGORY_ID} THEN 'ore' ELSE NULL END`;
}

/** Wallet journal fees the P&L counts as "fees" expenses; labels in `t.pnl.expenses.fees.kinds`. */
export type FeeKind = "transaction_tax" | "brokers_fee";

/** Review state of a wallet transaction; purchases and sales share it. */
export type ExpenseStatus = "counted" | "suggested" | "excluded" | "untagged";

/**
 * Effective state of a wallet purchase or sale. Mirrors the SQL in pnl/queries.ts:
 * your category wins over the auto-tag; your include/exclude wins over the
 * character's "count automatically" switch, which only covers tagged transactions.
 */
export function expenseStatus<C extends string>(input: {
  autoCategory: C | null;
  overrideCategory: C | null;
  overrideIncluded: boolean | null;
  autoInclude: boolean;
}): { category: C | null; included: boolean; status: ExpenseStatus } {
  const category = input.overrideCategory ?? input.autoCategory;
  const included = input.overrideIncluded ?? (input.autoCategory !== null && input.autoInclude);
  const status: ExpenseStatus = included
    ? "counted"
    : input.overrideIncluded === false
      ? "excluded"
      : category === null
        ? "untagged"
        : "suggested";
  return { category, included, status };
}
