import { addDays, bucketEnd, bucketStart, type DateBucket } from "@/lib/dates";
import { CHART_CLASSES, chartClassOf, type ChartClass } from "../class-colors";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseStatus } from "./categories";
import type { ActivityStats, ExpenseRow, IncomeRow, ManualDailyRow, SaleRow } from "./queries";
import type { IncomeSource } from "./scope";

/**
 * Turns P&L query rows into the sheet: totals, day/week/month buckets,
 * per-character and per-activity splits, ISK/hour and cost per m³. Pure.
 *
 * Income is either the mined ore at the P&L valuation or the counted wallet sales (`incomeSource`); the other figure
 * is still reported for comparison. Mined volume, active hours and ISK/hour always come from the mined ore.
 */

/** Below this share of income covered by measured activity, expenses are split by m³ instead of hours. */
export const HOURS_ALLOCATION_MIN_SHARE = 0.9;

export type ClassValues = Record<ChartClass, number>;

const zeroClasses = (): ClassValues => ({ moon: 0, ore: 0, ice: 0, gas: 0, other: 0 });

export interface PnlBucket {
  start: string;
  end: string;
  income: number;
  incomeByClass: ClassValues;
  /** Counted wallet purchases and broker fees. */
  wallet: number;
  /** Manual entries (spread ones divided over their days). */
  manual: number;
  expenses: number;
  net: number;
  /** The bucket extends beyond the selected range. */
  partial: boolean;
}

export interface PnlCharacterRow {
  /** null: account-wide manual entries. */
  characterId: number | null;
  /** null for account-wide entries or a character no longer linked. */
  name: string | null;
  income: number;
  volume: number;
  hours: number;
  iskPerHour: number | null;
  expenses: number;
  net: number;
}

export interface PnlActivityRow {
  activity: ChartClass;
  income: number;
  volume: number;
  hours: number;
  iskPerHour: number | null;
  /** Share of all expenses, allocated by `allocation`. */
  expenses: number;
  net: number;
}

export interface StatusTotal {
  amount: number;
  count: number;
}

export interface PnlReport {
  incomeSource: IncomeSource;
  totals: {
    /** Mined value or counted sales, depending on `incomeSource`. */
    income: number;
    /** Mined ore at the P&L valuation (rate and price rules). */
    minedIncome: number;
    /** The same ore at the dashboard valuation (no rate or price rules). */
    baseIncome: number;
    /** Counted wallet sales, net of sales tax. */
    salesIncome: number;
    /** Sales tax deducted from the counted sales. */
    salesTax: number;
    /** Counted wallet purchases and broker fees. */
    wallet: number;
    /** Of `wallet`: counted broker fees. */
    fees: number;
    manual: number;
    expenses: number;
    net: number;
    volume: number;
    unpricedRows: number;
  };
  purchases: Record<ExpenseStatus, StatusTotal>;
  sales: Record<ExpenseStatus, StatusTotal>;
  fees: Record<ExpenseStatus, StatusTotal>;
  byCategory: { category: ExpenseCategory; amount: number }[];
  buckets: PnlBucket[];
  characters: PnlCharacterRow[];
  activities: PnlActivityRow[];
  /** How expenses were split across activities. */
  allocation: "hours" | "volume" | null;
  activity: {
    /** Wall-clock hours: several characters mining at once count once. */
    wallClockHours: number;
    characterHours: number;
    /** P&L value of the ore mined in measured windows. */
    measuredIncome: number;
    /** measuredIncome / mined income (0–1). */
    measuredShare: number;
    trackedSince: Date | null;
  };
  iskPerHour: { gross: number | null; net: number | null };
  costPerM3: number | null;
}

/** Splits `total` proportionally to the weights (all zero → nothing allocated). */
export function allocateByShare<K>(total: number, weights: Map<K, number>): Map<K, number> {
  const sum = [...weights.values()].reduce((a, b) => a + Math.max(0, b), 0);
  return new Map([...weights].map(([k, w]) => [k, sum > 0 ? (total * Math.max(0, w)) / sum : 0]));
}

const perHour = (value: number, hours: number) => (hours > 0 ? value / hours : null);

const statusTotals = (): Record<ExpenseStatus, StatusTotal> => ({
  counted: { amount: 0, count: 0 },
  suggested: { amount: 0, count: 0 },
  excluded: { amount: 0, count: 0 },
  untagged: { amount: 0, count: 0 },
});

export function buildPnlReport(input: {
  from: string;
  to: string;
  bucket: DateBucket;
  /** Defaults to the mined ore. */
  incomeSource?: IncomeSource;
  income: IncomeRow[];
  /** Wallet sales; only counted ones are income, and only with `incomeSource` "sales". */
  sales?: SaleRow[];
  expenses: ExpenseRow[];
  /** Broker fees (category "fees"); counted ones are wallet expenses, with `incomeSource` "sales" only. */
  fees?: ExpenseRow[];
  manual: ManualDailyRow[];
  activity: ActivityStats;
  characters: { characterId: number; name: string }[];
}): PnlReport {
  const { from, to, bucket, income, expenses, manual, activity } = input;
  const incomeSource = input.incomeSource ?? "mined";
  const fromSales = incomeSource === "sales";

  // Buckets covering the range, in order.
  const buckets = new Map<string, PnlBucket>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const start = bucketStart(d, bucket);
    if (!buckets.has(start)) {
      const end = bucketEnd(start, bucket);
      buckets.set(start, {
        start,
        end,
        income: 0,
        incomeByClass: zeroClasses(),
        wallet: 0,
        manual: 0,
        expenses: 0,
        net: 0,
        partial: start < from || end > to,
      });
    }
  }
  const bucketOf = (date: string) => buckets.get(bucketStart(date, bucket));

  const chars = new Map<number | null, PnlCharacterRow>();
  const names = new Map(input.characters.map((c) => [c.characterId, c.name]));
  const charRow = (id: number | null) => {
    let row = chars.get(id);
    if (!row) {
      row = {
        characterId: id,
        name: id === null ? null : (names.get(id) ?? null),
        income: 0,
        volume: 0,
        hours: 0,
        iskPerHour: null,
        expenses: 0,
        net: 0,
      };
      chars.set(id, row);
    }
    return row;
  };

  const classIncome = zeroClasses();
  const classVolume = zeroClasses();
  const addIncome = (date: string, characterId: number, cls: ChartClass, value: number) => {
    classIncome[cls] += value;
    const b = bucketOf(date);
    if (b) {
      b.income += value;
      b.incomeByClass[cls] += value;
    }
    charRow(characterId).income += value;
  };
  let minedIncome = 0;
  let baseIncome = 0;
  let volume = 0;
  let unpricedRows = 0;
  for (const r of income) {
    const cls = chartClassOf(r.oreClass);
    minedIncome += r.value;
    baseIncome += r.baseValue;
    volume += r.volume;
    unpricedRows += r.unpricedRows;
    classVolume[cls] += r.volume;
    charRow(r.characterId).volume += r.volume;
    if (!fromSales) addIncome(r.date, r.characterId, cls, r.value);
  }

  const sales = statusTotals();
  let salesIncome = 0;
  let salesTax = 0;
  // Sale amounts are net of the sales tax paid on them.
  for (const r of input.sales ?? []) {
    sales[r.status].amount += r.amount;
    sales[r.status].count += r.count;
    if (r.status !== "counted") continue;
    salesIncome += r.amount;
    salesTax += r.tax;
    if (fromSales) addIncome(r.date, r.characterId, r.category ?? "other", r.amount);
  }
  const totalIncome = fromSales ? salesIncome : minedIncome;

  const purchases = statusTotals();
  const byCategory = new Map<ExpenseCategory, number>();
  const fees = statusTotals();
  let wallet = 0;
  let feeTotal = 0;
  const countWallet = (r: ExpenseRow, stats: Record<ExpenseStatus, StatusTotal>) => {
    stats[r.status].amount += r.amount;
    stats[r.status].count += r.count;
    if (r.status !== "counted") return 0;
    wallet += r.amount;
    const category = r.category ?? "other";
    byCategory.set(category, (byCategory.get(category) ?? 0) + r.amount);
    const b = bucketOf(r.date);
    if (b) b.wallet += r.amount;
    charRow(r.characterId).expenses += r.amount;
    return r.amount;
  };
  for (const r of expenses) countWallet(r, purchases);
  // Broker fees are a cost of selling: they only count when the sales are the income (a mined-value rate covers them).
  if (fromSales) for (const r of input.fees ?? []) feeTotal += countWallet(r, fees);
  let manualTotal = 0;
  for (const r of manual) {
    manualTotal += r.amount;
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
    const b = bucketOf(r.date);
    if (b) b.manual += r.amount;
    charRow(r.characterId).expenses += r.amount;
  }
  for (const b of buckets.values()) {
    b.expenses = b.wallet + b.manual;
    b.net = b.income - b.expenses;
  }

  for (const [id, figure] of activity.byCharacter) {
    const c = charRow(id);
    c.hours = figure.hours;
    c.iskPerHour = perHour(figure.value, figure.hours);
  }
  for (const c of chars.values()) c.net = c.income - c.expenses;

  const totalExpenses = wallet + manualTotal;
  const measuredIncome = activity.total.value;
  // Activity values the mined ore, so its share is of the mined income whatever the income basis.
  const measuredShare = minedIncome > 0 ? Math.min(1, measuredIncome / minedIncome) : 0;
  const wallClockHours = activity.total.hours;
  const characterHours = [...activity.byCharacter.values()].reduce((a, f) => a + f.hours, 0);

  // Split expenses by active hours when activity covers (nearly) all income, else by m³.
  const classHours = new Map(CHART_CLASSES.map((c) => [c.id, activity.byActivity.get(c.id)?.hours ?? 0]));
  const allocation: PnlReport["allocation"] =
    totalExpenses <= 0
      ? null
      : wallClockHours > 0 && measuredShare >= HOURS_ALLOCATION_MIN_SHARE
        ? "hours"
        : volume > 0
          ? "volume"
          : null;
  const allocated =
    allocation === "hours"
      ? allocateByShare(totalExpenses, classHours)
      : allocation === "volume"
        ? allocateByShare(totalExpenses, new Map(CHART_CLASSES.map((c) => [c.id, classVolume[c.id]])))
        : new Map<ChartClass, number>();

  const activities: PnlActivityRow[] = CHART_CLASSES.map((c) => {
    const figure = activity.byActivity.get(c.id);
    const expensesShare = allocated.get(c.id) ?? 0;
    return {
      activity: c.id,
      income: classIncome[c.id],
      volume: classVolume[c.id],
      hours: figure?.hours ?? 0,
      iskPerHour: figure ? perHour(figure.value, figure.hours) : null,
      expenses: expensesShare,
      net: classIncome[c.id] - expensesShare,
    };
  }).filter((a) => a.income !== 0 || a.volume !== 0 || a.hours !== 0);

  const characters = [...chars.values()].sort((a, b) =>
    a.characterId === null
      ? 1
      : b.characterId === null
        ? -1
        : b.income - a.income || (a.name ?? "").localeCompare(b.name ?? ""),
  );

  return {
    incomeSource,
    totals: {
      income: totalIncome,
      minedIncome,
      baseIncome,
      salesIncome,
      salesTax,
      wallet,
      fees: feeTotal,
      manual: manualTotal,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      volume,
      unpricedRows,
    },
    purchases,
    sales,
    fees,
    byCategory: EXPENSE_CATEGORIES.filter((c) => byCategory.has(c)).map((c) => ({ category: c, amount: byCategory.get(c)! })),
    buckets: [...buckets.values()],
    characters,
    activities,
    allocation,
    activity: { wallClockHours, characterHours, measuredIncome, measuredShare, trackedSince: activity.trackedSince },
    iskPerHour: {
      gross: perHour(measuredIncome, wallClockHours),
      // Expenses scaled to the share of income the measured hours produced.
      net: perHour(measuredIncome - totalExpenses * measuredShare, wallClockHours),
    },
    costPerM3: volume > 0 ? totalExpenses / volume : null,
  };
}
