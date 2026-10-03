import type { ReactNode } from "react";
import type { DateBucket } from "@/lib/dates";
import { FORMATTERS } from "@/lib/format";
import type { JournalCategory } from "@/modules/wallet/corp/classify";
import type { JournalFlowFilter } from "@/modules/wallet/corp/filters";

const n = FORMATTERS.en.integer;
const ordinal = (d: number) => `${d}${d === 2 ? "nd" : d === 3 ? "rd" : "th"}`;

/** Wallet module: opt-in character wallet import (mining P&L) and the corporation wallet archive (Finances). */
export const wallet = {
  module: {
    scopes: {
      characterWallet: "Reads market purchases and sales so the mining P&L can count mining costs and sale prices (opt-in).",
      characterWalletLabel: "Wallet import",
      corporationWallets:
        "Reads corporation wallet balances, journal and market transactions for the finances pages (needs Accountant or Junior Accountant).",
      divisions: "Reads the names of the corporation's wallet divisions (needs Director).",
    },
    jobs: {
      transactions: "Wallet transactions",
      corporationWallets: "Corporation wallets",
      corporationDivisions: "Wallet division names",
    },
    permissionGroup: "Finances",
    permissions: {
      corpView: {
        label: "View corporation wallets",
        description: "Balances, income, expenses and the wallet journal of the home corporation.",
      },
    },
    navSection: "Finances",
    nav: {
      corporationWallet: "Corporation wallet",
      journal: "Corp wallet journal",
    },
  },

  corp: {
    defaultDivisionName: (division: number) =>
      division === 1 ? "Master wallet" : `${ordinal(division)} wallet division`,
    metaTitle: {
      overview: "Corporation wallet",
      journal: "Corp wallet journal",
    },
    categories: {
      bounties: "Bounties & ESS",
      corpTax: "Corporation tax",
      market: "Market",
      industry: "Industry",
      planetary: "Planetary",
      contracts: "Contracts",
      missions: "Missions & LP",
      rewards: "Rewards & events",
      transfers: "Payments & donations",
      structures: "Offices & structures",
      character: "Insurance & clones",
      corpAdmin: "Corporation & wars",
      fines: "Fines & wagers",
      store: "Store & HyperNet",
      other: "Other",
    } satisfies Record<JournalCategory, string>,
    flows: {
      all: "All",
      income: "Income",
      expense: "Expenses",
      transfer: "Transfers",
    } satisfies Record<JournalFlowFilter, string>,
    buckets: {
      day: "Day",
      week: "Week",
      month: "Month",
    } satisfies Record<DateBucket, string>,
    filters: {
      divisions: "Divisions",
      categories: "Categories",
      flow: "Show",
      groupBy: "Group by",
      reset: "Reset",
    },
    noHomeCorp: {
      title: "No home corporation set",
      body: "Corporation wallets are read for the home corporation. An admin can set it under Settings.",
    },
    empty: {
      title: "No wallet data yet",
      body: (strong: (text: string) => ReactNode) => (
        <>
          Link a character of the corporation with corporation access (My Characters → “Link with corporation access”).
          The character needs the in-game {strong("Accountant")} or {strong("Junior Accountant")} role to read the
          wallets; a {strong("Director")} also brings the division names. The first import runs within a few minutes.
        </>
      ),
      action: "My Characters",
    },
    historySince: (date: string) => `Archive since ${date}`,
    lastSync: (when: string) => `last import ${when}`,
    gaps: {
      title: "The archive has gaps",
      body: "ESI only keeps about 30 days of wallet history. Entries from these periods could not be imported, because nobody with the Accountant role had a valid token for longer than that, or more than 10,000 entries arrived in between:",
      range: (division: string, from: string, to: string) => `${division}: ${from} – ${to}`,
    },

    overview: {
      description:
        "Balances, income and expenses of every wallet division. Keystar keeps the journal for good; ESI only returns the last 30 days.",
      journalLink: "Corp wallet journal",
      tiles: {
        balance: "Balance",
        balanceHint: (when: string) => `as of ${when}`,
        income: "Income",
        expenses: "Expenses",
        net: "Net",
        netHint: (income: string, expenses: string) => `${income} in, ${expenses} out`,
        transfers: "Moved between divisions",
        transfersHint: "Not counted as income or expenses",
      },
      chartTitle: {
        day: "Income and expenses per day",
        week: "Income and expenses per week",
        month: "Income and expenses per month",
      } satisfies Record<DateBucket, string>,
      chartSubtitle: "All selected divisions; transfers between divisions left out",
      divisions: {
        title: "Divisions",
        subtitle: "Current balance and the selected period",
      },
      columns: {
        division: "Division",
        balance: "Balance",
        income: "Income",
        expenses: "Expenses",
        transfers: "Transfers",
        net: "Net",
      },
      how: {
        title: "How this is counted",
        transfers:
          "ISK moved between the corporation's own divisions shows up in both journals. It is listed as a transfer and never counted as income or expense.",
        archive:
          "The worker imports new journal entries and market transactions every hour and never deletes them, so the history grows beyond what ESI keeps.",
        times: "Days are EVE days (UTC). Balances are read hourly.",
      },
    },

    chart: {
      legend: "Legend",
      view: "Chart or table",
      chart: "Chart",
      table: "Table",
      income: "Income",
      expenses: "Expenses",
      net: "Net",
      partial: "partial",
    },

    journal: {
      description: "Every entry of the corporation wallets, newest first.",
      overview: "Overview",
      entries: (count: number, value: ReactNode) => (
        <>
          {value} {count === 1 ? "entry" : "entries"}
        </>
      ),
      pageOf: (page: number, pages: number) => `Page ${n(page)} of ${n(pages)}`,
      empty: "No journal entries match these filters.",
      transfer: "Transfer",
      unknownParty: "—",
      columns: {
        date: "Date",
        division: "Division",
        type: "Type",
        from: "From",
        to: "To",
        amount: "Amount",
        balance: "Balance",
        details: "Details",
      },
      pagination: "Pagination",
      previous: "Previous",
      next: "Next",
    },
  },
};
