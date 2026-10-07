import type { ExpenseStatus } from "./categories";

/** Badge tone of each review status in the purchases, fees and sales tables. */
export const statusTone: Record<ExpenseStatus, "good" | "accent" | "neutral"> = {
  counted: "good",
  suggested: "accent",
  excluded: "neutral",
  untagged: "neutral",
};
