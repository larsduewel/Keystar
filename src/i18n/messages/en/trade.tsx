import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** Trade module: appraisals at Jita 4-4 prices. */
export const trade = {
  module: {
    navSection: "Trade",
    nav: { appraisal: "Appraisal" },
    /** "This page" help for the nav items (NavItem.help), one to three sentences each. */
    help: {
      appraisal:
        "Paste cargo, a contract, a fitting, a d-scan or an item list to value it at Jita 4-4 buy and sell prices from ESI, " +
        "optionally at a percentage of Jita. Each appraisal is kept for a year with a link anyone with appraisal access can open; " +
        "you can appraise it again at today's prices or delete your own.",
    },
    permissionGroup: "Trade",
    permissions: {
      appraisal: {
        label: "Use appraisals",
        description: "Appraise items at Jita prices and open appraisal links shared by others.",
      },
    },
    jobs: { housekeeping: "Appraisal housekeeping" },
  },
  appraisal: {
    metaTitle: "Appraisal",
    eyebrow: "Trade",
    title: "Appraisal",
    description:
      "Value cargo, contracts, fittings, d-scans or item lists at Jita 4-4 prices and share the result with a link.",
    paste: "Paste items",
    recent: "Your recent appraisals",
    recentEmpty: "Nothing appraised yet.",
    /** Recent appraisal label: first item names, then how many more. */
    more: (count: number) => `+${n(count)}`,
  },
  /** Deleting one of your own appraisals (small trash button in the list and on the result). */
  delete: {
    button: "Delete",
    /** Tooltip and accessible name of the icon-only button. */
    hint: "Delete this appraisal",
    confirm: "Delete this appraisal? Its share link stops working.",
    deleted: "Appraisal deleted",
    failed: "Couldn't delete the appraisal",
    errors: {
      notOwned: "Only the person who created an appraisal can delete it.",
      notFound: "This appraisal was already deleted.",
      unknown: "Something went wrong. Reload the page and try again.",
    },
  },
  result: {
    description: (date: string, by: string | null) => `Jita 4-4 prices from ${date}${by ? ` · by ${by}` : ""}`,
    newAppraisal: "New appraisal",
    jitaSell: "Jita sell",
    jitaBuy: "Jita buy",
    split: "Split",
    volume: "Volume",
    volumeHint: (types: number, items: number) =>
      `${n(types)} ${types === 1 ? "type" : "types"} · ${n(items)} ${items === 1 ? "item" : "items"}`,
    /** Banner when the appraisal is priced at a share of Jita, e.g. "90% of Jita". */
    ofJita: (percent: string) => `${percent} of Jita`,
    buy: "Buy",
    sell: "Sell",
    share: "Share",
    shareSubtitle: "Anyone signed in to Keystar with appraisal access can open this link.",
    items: "Items",
    itemsSorted: "Sorted by Jita sell value",
    unpriced: (count: number) =>
      count === 1
        ? "1 item type has no Jita price and counts as 0."
        : `${n(count)} item types have no Jita price and count as 0.`,
    item: "Item",
    columns: {
      quantity: "Qty",
      buy: "Buy / unit",
      sell: "Sell / unit",
      totalBuy: "Buy total",
      totalSell: "Sell total",
      volume: "Volume",
    },
    unparsed: (count: number) => `Not recognised (${n(count)})`,
    unparsedSubtitle: "These lines didn't match an item name and were skipped.",
    again: "Appraise again",
    againSubtitle: "Same input at today's prices, as a new appraisal.",
  },
  form: {
    placeholder: `Paste anything from EVE, for example:

Tritanium\t12,000\tMineral
[Rifter, Roam fit]
200mm AutoCannon II, EMP S
Warrior II x5
Nanite Repair Paste x 50
10 Cap Booster 800`,
    input: "Items to appraise",
    /** Label around the percentage input. */
    priceAt: (input: ReactNode) => <>Price at {input}% of Jita</>,
    submit: "Appraise",
    submitting: "Appraising…",
    note: "Prices: Jita 4-4 best buy and sell orders, refreshed from ESI when older than two hours. Items appraised for the first time take a moment to price.",
  },
  errors: {
    empty: "Paste some items first.",
    tooLong: (max: number) => `That paste is too long (${n(max)} characters at most).`,
    tooManyLines: (lines: number, max: number) =>
      `That paste has ${n(lines)} lines; appraise at most ${n(max)} at a time.`,
    tooManyTypes: (types: number, max: number) =>
      `That paste contains ${n(types)} different items; appraise at most ${n(max)} at a time.`,
    esiUnavailable: "EVE's ESI is unavailable right now, so the items couldn't be identified or priced. Nothing was saved; try again in a few minutes.",
    rateLimited: "That is a lot of appraisals in a short time. Try again in a few minutes.",
    noItems: "No known items found. Paste item names from EVE (inventory, contract, fitting, d-scan or a list).",
  },
};
