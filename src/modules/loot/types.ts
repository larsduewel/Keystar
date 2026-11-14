export type Participant = {
  id: string;
  name: string;
  characterId: number | null;
  payee: string;
  weight: number;
  eligible?: boolean;
  paid: number;
  attendance?: {
    joined: string;
    lastSeen: string;
    left: string | null;
    stopped: boolean;
  }[];
  source: "manual" | "fleet" | "loot";
};
export type LootItem = {
  id: string;
  name: string;
  quantity: number;
  collector: string;
  time: string | null;
  typeId: number | null;
  price: number | null;
  pricedAt: string | null;
  status: "collected" | "handed" | "sold" | "retained" | "excluded";
  proceeds: number | null;
  retainedBy: string | null;
  killmailId: number | null;
  match: "unmatched" | "possible" | "confirmed" | "disputed";
  candidates: number[];
  importKey: string;
};
export type LootKill = {
  id: number;
  time: string;
  victim: number | null;
  items: { typeId: number; quantity: number }[];
};
export type Ledger = {
  participants: Participant[];
  items: LootItem[];
  imports: string[];
  kills: LootKill[];
  killIds: number[];
  expenses: number;
  corpPercent: number;
  basis: "estimate" | "sales";
  splitMode?: "equal" | "atLoot";
  attendanceFrom?: string;
  audit: { at: string; action: string }[];
};
export const emptyLedger = (): Ledger => ({
  participants: [],
  items: [],
  imports: [],
  kills: [],
  killIds: [],
  expenses: 0,
  corpPercent: 0,
  basis: "estimate",
  audit: [],
});
