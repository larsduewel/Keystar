import type { ReactNode } from "react";
import type { DateBucket } from "@/lib/dates";
import { FORMATTERS } from "@/lib/format";
import type { ExpenseCategory, ExpenseStatus, FeeKind, IncomeCategory } from "@/modules/mining/pnl/categories";
import type { StatusFilter } from "@/modules/mining/pnl/filters";
import type { IncomeSource } from "@/modules/mining/pnl/scope";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Mining P&L: overview, income and expense review, and settings (wallet import, income basis, ore prices). */
export const pnl = {
  title: "Mining P&L",
  metaTitle: {
    overview: "Mining P&L",
    income: "Mining P&L · Income",
    expenses: "Mining P&L · Expenses",
    settings: "Mining P&L · Settings",
  },
  tabs: {
    label: "Mining P&L",
    overview: "Overview",
    income: "Income",
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
    ships: { label: "Ships & fittings", hint: "Mining hulls, mining modules, rigs, compressors, industrial cores" },
    fees: { label: "Broker fees", hint: "Broker fees from your wallet journal" },
    subscription: { label: "PLEX / Omega", hint: "Game time for mining alts" },
    other: { label: "Other", hint: "Anything else you count as a mining cost" },
  } satisfies Record<ExpenseCategory, { label: string; hint: string }>,
  incomeCategories: {
    ore: { label: "Ore & minerals", hint: "Asteroid ore, raw or compressed, and minerals" },
    moon: { label: "Moon ore & materials", hint: "Moon ore, raw or compressed, and moon materials" },
    ice: { label: "Ice & ice products", hint: "Ice, raw or compressed, and ice products" },
    gas: { label: "Gas", hint: "Gas clouds, raw or compressed" },
    other: { label: "Other", hint: "Anything else you count as mining income" },
  } satisfies Record<IncomeCategory, { label: string; hint: string }>,
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
  saleStatuses: {
    counted: { label: "Counted", hint: "Included in your income" },
    suggested: { label: "Suggested", hint: "Tagged as mining income, waiting for you to include it" },
    excluded: { label: "Excluded", hint: "You excluded it" },
    untagged: { label: "Other sales", hint: "Not recognised as mining income; tag it to count it" },
  } satisfies Record<ExpenseStatus, { label: string; hint: string }>,
  saleStatusFilters: {
    mining: "Mining sales",
    suggested: "Suggested",
    counted: "Counted",
    excluded: "Excluded",
    untagged: "Other sales",
  } satisfies Record<StatusFilter, string>,
  spread: (days: number) => (days === 1 ? "One day" : `${n(days)} days`),
  hours: (value: string) => `${value} h`,
  accountWide: "Account-wide entries",
  typeFallback: (id: number) => `Type ${id}`,
  characterFallback: (id: number) => `Character ${id}`,
  switch: { on: "On", off: "Off" },
  /** Toasts for the changes made on the P&L pages (error codes: `PnlActionError`). */
  toast: {
    failed: "Couldn't save the change",
    errors: {
      forbidden: "You no longer have access to the mining P&L.",
      notOwned: "That character isn't linked to your account any more.",
      notFound: "That entry no longer exists. Reload the page.",
      invalidRate: "Enter a share between 1 and 1000 %.",
      invalidSource: "Pick how income is counted.",
      invalidPrice: "Enter the ISK you get per unit, e.g. 18.5.",
      invalidDate: "Enter a valid date.",
      invalidRange: "The end date is before the start date.",
      invalidAmount: "Enter an amount in ISK, e.g. 2.1b or 450,000,000.",
      invalidCategory: "Pick one of the listed categories.",
      invalidSpread: "Pick one of the listed periods.",
      unknownType: "Keystar doesn't know that ore. Reload the page.",
      salesTaxFollowsSale: "Sales tax counts with its sale: include or exclude the sale on the Income tab instead.",
      unknown: "Something went wrong. Reload the page and try again.",
    },
    incomeSource: {
      mined: "Income now counts the value of the ore you mine",
      sales: "Income now counts your wallet sales",
    } satisfies Record<IncomeSource, string>,
    incomeRate: "Share of the valuation saved",
    autoCount: (name: string, on: boolean) =>
      on ? `Tagged purchases of ${name} now count automatically` : `Tagged purchases of ${name} are only suggested again`,
    autoCountSales: (name: string, on: boolean) =>
      on ? `Tagged sales of ${name} now count automatically` : `Tagged sales of ${name} are only suggested again`,
    priceAdded: "Ore price added",
    priceDeleted: "Ore price deleted",
    priceApplied: (ore: string, price: string) => `${ore} is now priced at ${price} ISK per unit`,
    purchasesIncluded: (count: number) => `${plural(count, "purchase", "purchases")} included`,
    salesIncluded: (count: number) => `${plural(count, "sale", "sales")} included`,
    feesIncluded: (count: number) => `${plural(count, "broker fee", "broker fees")} included`,
    costAdded: "Cost added",
    costDeleted: "Cost deleted",
  },

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
      body: "Income comes from your characters' mining ledgers (synced every 15 minutes once you switch them on under Mining access). Expenses come from wallet purchases you include and from manual entries. Wallet import is optional and off until you enable it per character.",
    },
    tiles: {
      net: (from: string, to: string) => `Net profit · ${from} – ${to}`,
      netHint: (income: string, expenses: string, margin: string | null) =>
        `${income} income − ${expenses} expenses${margin ? ` · ${margin} margin` : ""}`,
      income: "Income",
      rate: (percent: string) => `${percent} of valuation`,
      fromSales: (count: number, mined: string) => `${plural(count, "wallet sale", "wallet sales")} · ${mined} mined`,
      salesSuggested: (count: number, amount: string) => `${n(count)} sales suggested (${amount})`,
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
      split: "Wallet · manual entries",
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
      incomeSales: (mined: string) => (
        <>
          <b className="text-ink">Income</b> is what the wallet sales you counted brought in (ore, minerals, moon
          materials, ice products and gas) after their sales tax, on the day of the sale. The ore mined in this period is worth {mined} at the
          valuation; ISK per hour still values the mined ore.
        </>
      ),
      expenses: () => (
        <>
          <b className="text-ink">Expenses</b> are wallet purchases you counted (or that are counted automatically for
          characters where you switched that on) plus manual entries; spread entries are divided evenly over their days.
          When income comes from wallet sales, the broker fees you include come from the wallet journal (sales tax is
          deducted from the sales instead). Trades between your own characters don&apos;t count.
        </>
      ),
      iskPerHour: (wallClock: string, characterHours: string, since: string | null, share: string) => (
        <>
          <b className="text-ink">ISK per hour</b> comes from how much your ledgers grew between 15-minute syncs (precision
          ±15 min per session). Characters mining at the same time count once ({wallClock} wall-clock, {characterHours}{" "}
          character hours).{" "}
          {since
            ? `Tracked since ${since}; covers ${share} of the ore mined in this period (by value).`
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

  income: {
    description: "Decide which wallet sales were mining income: ore, minerals, moon materials, ice products and gas.",
    minedNotice: (settings: ReactNode) => (
      <>Income is currently the value of the ore you mine, so these sales don&apos;t count yet. {settings} to count them instead.</>
    ),
    switchToSales: "Switch to wallet sales",
    sales: {
      salesTax: {
        none: "No sales tax imported for these sales.",
        counted: (amount: string, count: number) =>
          `Sales tax: ${amount} deducted from ${plural(count, "counted sale", "counted sales")}.`,
        pending: (amount: string) => ` ${amount} more on sales you haven't reviewed yet, deducted once you include them.`,
      },
      columns: { tax: "Sales tax" },
      net: (amount: string) => `net ${amount}`,
      title: "Wallet sales",
      subtitle: "Auto-tagged by item group: ore (raw or compressed), minerals, moon materials, ice products and gas",
      includeAll: (count: number) => `Include all ${n(count)} suggested`,
      includeAllHint: "Count every suggested sale in this period",
      walletOff:
        "Wallet import is off for all your characters. Turn it on per character to have ore and mineral sales suggested here; nothing counts until you include it (or switch on automatic counting for that character).",
      enableWallet: "Enable wallet import",
      statusNav: "Sale status",
      empty: "No sales here for this period.",
      notMiningIncome: "Not mining income",
      includeHint: "Count this sale as mining income",
      excludeHint: "Exclude: not mining income",
      page: (page: number, pages: number, total: number) => `Page ${n(page)} of ${n(pages)} · ${plural(total, "sale", "sales")}`,
      footer: (back: ReactNode) => (
        <>
          Market sales from your imported wallets. Trades between your own characters don&apos;t count. {back}
        </>
      ),
    },
    flows: {
      title: "Mined vs sold",
      subtitle: "Per ore, in raw units: compressed ore counts 1:1, it only takes less room",
      summary: (sold: string, atValuation: string | null, left: string, volume: string) =>
        `Sold for ${sold}${atValuation ? ` (${atValuation} at the valuation)` : ""} · ${left} still unsold at today's valuation (${volume} uncompressed)`,
      columns: {
        ore: "Ore",
        mined: "Mined",
        sold: "Sold",
        left: "Left",
        got: "You got / unit",
        valuation: "Valuation / unit",
        isk: "Sold for",
      },
      compressed: (share: string) => `${share} compressed`,
      notes:
        "Left below zero means you sold ore mined before this period. Sales you excluded and trades between your own characters don't count; only market sales are matched. Gas isn't matched to its compressed variant.",
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
    fees: {
      title: "Broker fees",
      subtitle: "Charged when you place or change a market order, from your wallet journal",
      columns: { description: "Fee" },
      kinds: { transaction_tax: "Sales tax", brokers_fee: "Broker fee" } satisfies Record<FeeKind, string>,
      time: (time: string) => `${time} EVE`,
      empty: "No broker fees here for this period.",
      includeAll: (count: number) => `Include all ${n(count)} broker fees`,
      includeAllHint: "Count every suggested broker fee in this period",
      includeHint: "Count this broker fee as a mining cost",
      excludeHint: "Exclude: not a mining order",
      page: (page: number, pages: number, total: number) =>
        `Page ${n(page)} of ${n(pages)} · ${plural(total, "broker fee", "broker fees")}`,
      notes:
        "ESI doesn't say which order a broker fee was for, so the journal's own description is all there is; they only count once you include them. Sales tax isn't listed here: it is deducted from the sale it was paid on (Income tab).",
      minedNote:
        "Income is currently the value of the ore you mine, so broker fees don't count; your income rate covers them. They count once income comes from wallet sales (Settings → Income).",
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
    description: "Wallet import per character, how income is counted, and what you really sell for.",
    wallet: {
      title: "Wallet import",
      subtitle: "Optional and per character. Keystar then reads that character's market purchases and sales and the taxes and fees paid on them; only you see them.",
      revoked: "Token revoked",
      on: "Wallet import on",
      off: "Wallet import off",
      imported: (count: number, since: string, synced: string) =>
        `${plural(count, "transaction", "transactions")} since ${since} · synced ${synced}`,
      noTransactions: (synced: string) => `No market transactions in the last 30 days · synced ${synced}`,
      firstImport: "First import within a few minutes",
      kept: (count: number) => `${plural(count, "imported wallet entry", "imported wallet entries")} kept`,
      nothing: "Nothing imported",
      activitySince: (date: string) => `Mining activity measured since ${date}`,
      activityNext: "Mining activity is measured from the next ledger sync",
      /** `link` renders the link to the Mining access page. */
      activityNone: (link: (text: string) => ReactNode) => (
        <>Mining ledger is off, so activity can&apos;t be measured. Switch it on under {link("Mining access")}.</>
      ),
      autoCount: "Count tagged purchases automatically",
      autoCountSales: "Count tagged sales automatically",
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
        autoCountSales:
          "“Count tagged sales automatically” works the same for sales of ore, minerals, moon materials, ice products and gas. It only matters when income comes from wallet sales.",
        stop: "Stopping switches wallet import off in Keystar right away; re-authorise the character on My Characters to remove the scope from its EVE token too. Imported history is kept until you delete it.",
      },
    },
    income: {
      title: "Income",
      source: {
        label: "Count income from",
        options: {
          mined: "Value of the ore you mine",
          sales: "Your wallet sales",
        } satisfies Record<IncomeSource, string>,
        hints: {
          mined: "When you mine it, at the valuation below. Works without wallet import.",
          sales: "When you sell it, at the price you got. Review the sales on the Income tab.",
        } satisfies Record<IncomeSource, string>,
      },
      valuation: "Valuation of mined ore",
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
