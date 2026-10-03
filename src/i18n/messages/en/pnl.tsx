import type { ReactNode } from "react";
import type { DateBucket } from "@/lib/dates";
import { FORMATTERS } from "@/lib/format";
import type { ExpenseCategory, ExpenseStatus } from "@/modules/mining/pnl/categories";
import type { StatusFilter } from "@/modules/mining/pnl/filters";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Mining P&L: overview, expense review and settings (wallet import, income valuation, ore prices). */
export const pnl = {
  title: "Mining P&L",
  metaTitle: {
    overview: "Mining P&L",
    expenses: "Mining P&L · Expenses",
    settings: "Mining P&L · Settings",
  },
  tabs: {
    label: "Mining P&L",
    overview: "Overview",
    expenses: "Expenses",
    settings: "Settings",
  },
  filters: {
    characters: "Characters",
    groupBy: "Group by",
    reset: "Reset",
  },
  buckets: {
    day: "Day",
    week: "Week",
    month: "Month",
  } satisfies Record<DateBucket, string>,
  categories: {
    crystals: { label: "Mining crystals", hint: "Mining and Mercoxit mining crystals" },
    fuel: { label: "Fuel", hint: "Heavy Water for Orca / Rorqual industrial cores" },
    bursts: { label: "Burst charges", hint: "Mining Foreman burst charges" },
    drones: { label: "Mining drones", hint: "Mining, ice and excavator drones" },
    ships: { label: "Ships & fittings", hint: "Mining hulls, mining modules, rigs, compressors" },
    subscription: { label: "PLEX / Omega", hint: "Game time for mining alts" },
    other: { label: "Other", hint: "Anything else you count as a mining cost" },
  } satisfies Record<ExpenseCategory, { label: string; hint: string }>,
  statuses: {
    counted: { label: "Counted", hint: "Included in your expenses" },
    suggested: { label: "Suggested", hint: "Tagged as a mining cost, waiting for you to include it" },
    excluded: { label: "Excluded", hint: "You excluded it" },
    untagged: { label: "Other purchases", hint: "Not recognised as a mining cost; tag it to count it" },
  } satisfies Record<ExpenseStatus, { label: string; hint: string }>,
  statusFilters: {
    mining: "Mining costs",
    suggested: "Suggested",
    counted: "Counted",
    excluded: "Excluded",
    untagged: "Other purchases",
  } satisfies Record<StatusFilter, string>,
  spread: (days: number) => (days === 1 ? "One day" : `${n(days)} days`),
  hours: (value: string) => `${value} h`,
  accountWide: "Account-wide entries",
  characterFallback: (id: number) => `Character ${id}`,
  switch: { on: "On", off: "Off" },

  chart: {
    legend: "Legend",
    view: "Chart or table",
    chart: "Chart",
    table: "Table",
    expenses: "Expenses",
    net: "Net profit",
    netShort: "Net",
    partial: "partial",
    income: "Income",
  },

  overview: {
    description: "Income and expenses of your own characters. Only you can see this sheet.",
    empty: {
      title: "Nothing to show for this period",
      action: "P&L settings",
      body: "Income comes from your characters' mining ledgers (synced every 15 minutes). Expenses come from wallet purchases you include and from manual entries. Wallet import is optional and off until you enable it per character.",
    },
    tiles: {
      net: (from: string, to: string) => `Net profit · ${from} – ${to}`,
      netHint: (income: string, expenses: string, margin: string | null) =>
        `${income} income − ${expenses} expenses${margin ? ` · ${margin} margin` : ""}`,
      income: "Income",
      rate: (percent: string) => `${percent} of valuation`,
      rules: (count: number) => plural(count, "price rule", "price rules"),
      expenses: "Expenses",
      suggested: (count: number, amount: string) => `${n(count)} suggested (${amount})`,
      manual: (amount: string) => `${amount} manual`,
      iskPerHour: "ISK per hour",
      noActivity: "No measured activity yet",
      iskPerHourHint: (net: string, hours: string) => `net ${net} · ${hours} active`,
      costPerM3: "Cost per m³",
      mined: (volume: string) => `${volume} mined`,
    },
    chartTitle: {
      day: "Income and expenses by day",
      week: "Income and expenses by week",
      month: "Income and expenses by month",
    } satisfies Record<DateBucket, string>,
    chartSubtitle: "EVE time (UTC); weeks start on Monday",
    expenses: {
      title: "Expenses",
      subtitle: "Counted purchases and manual entries",
      review: "Review",
      empty: "No expenses counted in this period.",
      split: "Wallet purchases · manual entries",
      walletOff: (enable: ReactNode) => (
        <>Wallet import is off for all your characters. {enable} to pick up crystals, fuel, burst charges, drones and hulls you buy.</>
      ),
      enable: "Enable it",
    },
    columns: {
      character: "Character",
      activity: "Activity",
      income: "Income",
      volume: "m³",
      active: "Active",
      iskPerHour: "ISK/h",
      expenses: "Expenses",
      net: "Net",
    },
    byCharacter: { title: "By character", subtitle: "Expenses of the character that paid" },
    byActivity: {
      title: "By activity",
      subtitle: {
        hours: "Expenses split by active hours",
        volume: "Expenses split by m³ mined",
        none: "Ore, moon, ice and gas",
      },
      empty: "No mining in this period.",
    },
    how: {
      title: "How this is calculated",
      income: (valuation: string, rate: string | null, base: string | null) => (
        <>
          <b className="text-ink">Income</b> is the ore your characters mined, valued like the mining dashboard ({valuation})
          {rate ? `, at ${rate} of that value` : ""}. Ores with a price rule use your price instead.
          {base ? ` At the plain dashboard value it would be ${base}.` : ""}
        </>
      ),
      expenses: () => (
        <>
          <b className="text-ink">Expenses</b> are wallet purchases you counted (or that are counted automatically for
          characters where you switched that on) plus manual entries; spread entries are divided evenly over their days.
          Trades between your own characters don&apos;t count.
        </>
      ),
      iskPerHour: (wallClock: string, characterHours: string, since: string | null, share: string) => (
        <>
          <b className="text-ink">ISK per hour</b> comes from how much your ledgers grew between 15-minute syncs (precision
          ±15 min per session). Characters mining at the same time count once ({wallClock} wall-clock, {characterHours}{" "}
          character hours).{" "}
          {since
            ? `Tracked since ${since}; covers ${share} of this period's income.`
            : "Tracking starts with the next ledger sync; earlier mining has no activity data."}
        </>
      ),
      costPerM3: (unpriced: number) => (
        <>
          <b className="text-ink">Cost per m³</b> is all expenses divided by the volume mined.
          {unpriced > 0 ? ` ${plural(unpriced, "ledger row has", "ledger rows have")} no price yet and count as 0 ISK.` : ""}
        </>
      ),
    },
  },

  expenses: {
    description: "Decide which wallet purchases were mining costs, and add costs ESI can't see.",
    purchases: {
      title: "Wallet purchases",
      subtitle: "Auto-tagged by item group: crystals, Heavy Water, burst charges, mining drones, mining hulls and fittings",
      includeAll: (count: number) => `Include all ${n(count)} suggested`,
      includeAllHint: "Count every suggested purchase in this period",
      walletOff:
        "Wallet import is off for all your characters. Turn it on per character to have mining purchases suggested here; nothing counts until you include it (or switch on automatic counting for that character).",
      enableWallet: "Enable wallet import",
      statusNav: "Purchase status",
      tabCount: (count: number, amount: string) => `${n(count)} · ${amount}`,
      empty: "No purchases here for this period.",
      columns: {
        date: "Date",
        item: "Item",
        quantity: "Qty",
        total: "Total",
        category: "Category",
        status: "Status",
        countIt: "Count it?",
      },
      unitPrice: (price: string) => `@ ${price}`,
      categoryLabel: "Category",
      auto: (label: string) => `${label} (auto)`,
      notMiningCost: "Not a mining cost",
      include: "Include",
      includeHint: "Count this purchase as a mining cost",
      exclude: "Exclude",
      excludeHint: "Exclude: not a mining cost",
      reset: "Back to automatic",
      page: (page: number, pages: number, total: number) => `Page ${n(page)} of ${n(pages)} · ${plural(total, "purchase", "purchases")}`,
      newer: "Newer",
      older: "Older",
    },
    add: {
      title: "Add a cost",
      subtitle: "PLEX / Omega for alts, contracts, anything ESI can't see",
      date: "Date",
      amount: "Amount (ISK)",
      amountPlaceholder: "e.g. 2.1b or 450,000,000",
      category: "Category",
      spread: "Spread over",
      character: "Character",
      accountWide: "Account-wide",
      note: "Note",
      notePlaceholder: "e.g. 12 months Omega",
      submit: "Add cost",
    },
    manual: {
      title: "Manual costs",
      subtitle: "Entries overlapping the selected period",
      empty: "No manual costs in this period.",
      columns: { date: "Date", category: "Category", character: "Character", note: "Note", amount: "Amount", actions: "Actions" },
      spreadDays: (days: number) => `+${n(days - 1)}d`,
      deleteHint: "Delete this cost",
      footer: (back: ReactNode) => (
        <>Spread costs count a share per day, so a year of Omega shows up evenly instead of on one day. {back}</>
      ),
      back: "Back to the overview",
    },
  },

  settings: {
    description: "Wallet import per character, how ore income is valued, and what you really sell for.",
    wallet: {
      title: "Wallet import",
      subtitle: "Optional and per character. Keystar then reads that character's market purchases and sales; only you see them.",
      revoked: "Token revoked",
      on: "Wallet import on",
      off: "Wallet import off",
      imported: (count: number, since: string, synced: string) =>
        `${plural(count, "transaction", "transactions")} since ${since} · synced ${synced}`,
      noTransactions: (synced: string) => `No market transactions in the last 30 days · synced ${synced}`,
      firstImport: "First import within a few minutes",
      kept: (count: number) => `${plural(count, "imported transaction", "imported transactions")} kept`,
      nothing: "Nothing imported",
      activitySince: (date: string) => `Mining activity measured since ${date}`,
      activityNext: "Mining activity is measured from the next ledger sync",
      activityNone: "No mining ledger access: activity can't be measured",
      autoCount: "Count tagged purchases automatically",
      enable: "Enable wallet import",
      stop: "Stop wallet import",
      demo: "Not available in demo mode",
      deleteHistory: "Delete history",
      deleteHistoryHint: "Delete this character's imported wallet transactions",
      /** Toasts for deleting the imported history. */
      toast: {
        deleted: (name: string) => `Wallet history of ${name} deleted`,
        failed: (name: string) => `Couldn't delete the wallet history of ${name}`,
        errors: {
          forbidden: "You no longer have access to the mining P&L.",
          notOwned: "That character isn't linked to your account any more.",
          stillImporting: "Stop wallet import for this character first.",
          unknown: "Something went wrong. Reload the page and try again.",
        },
      },
      notes: {
        enable: () => (
          <>
            Enabling sends you to the EVE login with your current scopes plus wallet read access.{" "}
            <b>Pick the same character there</b>; EVE replaces a character&apos;s scopes on every login.
          </>
        ),
        autoCount:
          "“Count tagged purchases automatically” is off by default: purchases tagged as mining costs are only suggested until you include them. Switch it on for characters that buy for mining only; you can still exclude single purchases.",
        stop: "Stopping switches wallet import off in Keystar right away; re-authorise the character on My Characters to remove the scope from its EVE token too. Imported history is kept until you delete it.",
      },
    },
    income: {
      title: "Income valuation",
      base: (valuation: string) => `Base: ${valuation}`,
      share: "Share of the valuation you actually get",
      hint: "E.g. 90 if you sell to a buyback at 90% of Jita buy. Ores with a price rule use that price instead.",
      save: "Save",
    },
    prices: {
      title: "Ore prices",
      subtitle: "What you get per unit of a specific ore (overrides the %)",
      columns: { ore: "Ore", unitPrice: "ISK / unit", from: "From", to: "To", actions: "Actions" },
      always: "always",
      deleteHint: "Delete this rule",
      empty: (days: number) => `Ore you mined in the last ${n(days)} days can be priced here.`,
      ore: "Ore",
      unitPrice: "ISK / unit",
      unitPricePlaceholder: "e.g. 18.5",
      from: "From (optional)",
      to: "To (optional)",
      add: "Add price",
      hints: {
        title: (days: number) => `From your wallet sells · last ${n(days)} days`,
        empty:
          "No market sales of the ore you mined (raw or compressed) in imported wallets. Sales via contracts or a buyback don't show up here; use the % above for those.",
        columns: { ore: "Ore", sold: "Sold (raw units)", got: "You got / unit", valuation: "Valuation / unit" },
        sales: (count: number) => plural(count, "sale", "sales"),
        use: "Use",
        useHint: "Use this as the ore's price (no date limits)",
      },
    },
  },
};
