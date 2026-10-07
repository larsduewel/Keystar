import { FORMATTERS } from "@/lib/format";
import type { OrderOutcome, OrderSide, OrderView } from "@/modules/market/orders";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Market module: buy and sell orders of the viewer's own characters. */
export const market = {
  module: {
    scopes: {
      orders: "Reads the open and recently closed buy and sell orders of your characters (opt-in).",
      structures: "Names the player structures your market orders are placed in (opt-in; shared with industry access).",
      ordersLabel: "Market order access",
    },
    jobs: {
      characterOrders: "Market orders",
    },
    permissionGroup: "Market",
    permissions: {
      viewOwn: {
        label: "View own market orders",
        description: "Buy and sell orders of your own characters, with price, quantity, location and expiry.",
      },
    },
    nav: {
      orders: "Market Orders",
    },
    /** "This page" help for the nav items (NavItem.help), one to three sentences each. */
    help: {
      orders: "The buy and sell orders of your own characters: item, price, remaining quantity, station or structure, when each was issued and when it expires. Choose on the Access page which characters share their orders; Keystar reads them every 20 minutes, and only you see them.",
    },
  },

  metaTitle: "Market orders",
  page: {
    description: "What your characters are selling and buying, at what price, where, and until when.",
    synced: (when: string) => `Updated ${when}`,
    settings: "Access",
  },

  views: {
    open: { label: "Open", hint: "On the market now" },
    closed: { label: "Closed", hint: "Filled, cancelled or expired (ESI keeps 90 days)" },
    all: { label: "All", hint: "Every order Keystar has seen" },
  } satisfies Record<OrderView, { label: string; hint: string }>,
  sides: {
    all: "Buy & sell",
    sell: "Sell",
    buy: "Buy",
  } satisfies Record<OrderSide, string>,
  outcomes: {
    open: "Open",
    filled: "Filled",
    closed: "Closed",
    cancelled: "Cancelled",
    expired: "Expired",
  } satisfies Record<OrderOutcome, string>,
  closedHint: "No longer on the market: filled, or closed in game since the order history was last read.",
  ranges: {
    station: "Station",
    solarsystem: "Solar system",
    region: "Region",
    jumps: (jumps: number) => plural(jumps, "jump", "jumps"),
  },

  filters: {
    view: "Orders",
    side: "Side",
    characters: "Characters",
    location: "Location",
    reset: "Reset filters",
    unknownLocation: (id: number) => `Structure ${n(id)}`,
  },

  stats: {
    selling: "Selling",
    sellOrders: (count: number) => plural(count, "sell order", "sell orders"),
    buying: "Buying",
    buyOrders: (count: number) => plural(count, "buy order", "buy orders"),
    escrow: "In escrow",
    escrowHint: "ISK held for your buy orders",
    expiringSoon: "Expiring within 3 days",
    nextExpiry: (when: string) => `Next one expires ${when}`,
    byLocation: "Where your orders are",
    byLocationHint: "Open orders by station or structure, most ISK first",
    locationOrders: (count: number) => plural(count, "order", "orders"),
  },

  table: {
    character: "Character",
    item: "Item",
    price: "Price",
    quantity: "Quantity",
    location: "Location",
    expires: "Expires",
    status: "Status",
    sell: "Sell",
    buy: "Buy",
    corporation: "Corp",
    corporationHint: "Placed on behalf of the corporation",
    perUnit: "Per unit",
    total: (isk: string) => `${isk} total`,
    escrow: (isk: string) => `${isk} in escrow`,
    of: (total: string) => `of ${total}`,
    minVolume: (min: string) => `min. ${min}`,
    range: (range: string) => `Range: ${range}`,
    expiresIn: (when: string) => `expires ${when}`,
    issued: (when: string) => `issued ${when}`,
    issuedHint: "When the order was placed or last modified; modifying an order in game restarts its duration.",
    closed: (when: string) => `noticed ${when}`,
    pageOf: (page: number, pages: number) => `Page ${n(page)} of ${n(pages)}`,
    previous: "Previous",
    next: "Next",
    noLocation: "Unknown structure",
    noLocationHint: "This structure could not be named: the character has no docking access there, or it is gone.",
  },

  coverage: {
    title: "Coverage",
    subtitle: "Which of your characters report their orders",
    tracked: "Characters tracked",
    notEnabled: "Market access off",
    notEnabledHint: "Enable market access for these characters on the Access page to see their orders.",
    invalidTokens: "Revoked ESI tokens",
    lastSync: "Last update",
    note: "ESI refreshes open orders every 20 minutes and keeps cancelled and expired orders for 90 days. An order that left the market between two updates shows as closed.",
  },

  empty: {
    noCharacters: {
      title: "No characters linked",
      body: "Link a character on My Characters; its market orders appear here after the first update.",
      action: "My Characters",
    },
    notEnabled: {
      title: "Market access is off",
      body: "Choose on the Access page which of your characters share their market orders with Keystar. Orders show up a few minutes after enabling.",
      action: "Enable market access",
    },
    noOrders: {
      title: "No market orders yet",
      body: "None of your characters has a market order on record. Orders show up within 20 minutes after they are placed in game.",
    },
    filtered: "No order matches the filters.",
    noOpenOrders: "No open orders.",
  },

  settings: {
    metaTitle: "Market access",
    description: "Choose for each character whether Keystar may read its market orders and name the structures they are placed in.",
    title: "Market access per character",
    subtitle: "Enabling re-authorises the character with EVE and adds the two market scopes.",
    on: "Enabled",
    off: "Off",
    revoked: "Token revoked",
    partial: "Partly enabled",
    enable: "Enable market access",
    stop: "Switch off",
    reauthorize: "Re-authorise",
    demo: "Not available in demo mode",
    lastSync: (when: string) => `Last update ${when}`,
    firstSync: "The first update runs within a few minutes.",
    nothing: "Nothing stored.",
    kept: "Market orders from earlier are still stored.",
    deleteData: "Delete market data",
    deleteDataHint: "Removes the stored market orders of this character from Keystar.",
    accessLabel: "Market access",
    toast: {
      deleted: (name: string) => `Stored market orders of ${name} deleted`,
      failed: (name: string) => `Couldn't delete the market orders of ${name}`,
      errors: {
        forbidden: "You no longer have access to market orders in Keystar.",
        notOwned: "That character isn't linked to your account any more.",
        stillEnabled: "Switch market access off for this character first.",
        unknown: "Something went wrong. Reload the page and try again.",
      },
    },
    notes: {
      scopes: "Keystar reads the character's open orders every 20 minutes, and its cancelled and expired orders of the last 90 days, and names the stations and structures they are in; structures only where the character may dock. Only you see your characters' orders.",
      stop: "Switching off stops the reading in Keystar at once; stored orders stay until you delete them. Re-authorise the character on My Characters to remove the scopes from its EVE token too.",
      shared: "Industry access names structures with the same scope: switching one of them off keeps it while the other is on.",
    },
  },
};
