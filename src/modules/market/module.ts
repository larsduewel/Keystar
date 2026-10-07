import { Store } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";
import { STRUCTURES_SCOPE } from "@/modules/industry/module";

export const MARKET_ORDERS_SCOPE = "esi-markets.read_character_orders.v1";
/**
 * Both scopes are turned on and off together from the market access page. The structure scope names the player
 * structures orders are placed in; industry access uses it too, so switching one off keeps it for the other.
 */
export const MARKET_SCOPES = [MARKET_ORDERS_SCOPE, STRUCTURES_SCOPE] as const;
export const MARKET_MANAGE_HREF = "/market/settings";

export const MARKET_PERMISSIONS = {
  viewOwn: "market.view.own",
} as const;

/**
 * Market orders: the open buy and sell orders of the viewer's own characters (item, price, quantity, station or
 * structure, when issued and when they expire), plus closed ones from the last 90 days. The scopes are optional per
 * character, enabled on the market access page, so nobody is asked for them at sign-up. There is no
 * corporation-wide view: a member's orders are only shown to the member.
 */
export const marketModule: KeystarModule = {
  id: "market",
  name: "Market",
  description: "Buy and sell orders of your own characters with price, quantity, location and expiry.",
  scopes: [
    {
      scope: MARKET_ORDERS_SCOPE,
      level: "character",
      optional: true,
      manageHref: MARKET_MANAGE_HREF,
      managePermission: MARKET_PERMISSIONS.viewOwn,
      reason: (t) => t.market.module.scopes.orders,
      label: (t) => t.market.module.scopes.ordersLabel,
    },
    {
      scope: STRUCTURES_SCOPE,
      level: "character",
      optional: true,
      manageHref: MARKET_MANAGE_HREF,
      managePermission: MARKET_PERMISSIONS.viewOwn,
      reason: (t) => t.market.module.scopes.structures,
      label: (t) => t.industry.module.scopes.structuresLabel,
    },
  ],
  permissions: [
    {
      key: MARKET_PERMISSIONS.viewOwn,
      label: (t) => t.market.module.permissions.viewOwn.label,
      description: (t) => t.market.module.permissions.viewOwn.description,
      group: (t) => t.market.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      // Shares the trade module's section; the tone is declared there.
      id: "trade",
      label: (t) => t.trade.module.navSection,
      order: 20,
      items: [
        {
          href: "/market",
          label: (t) => t.market.module.nav.orders,
          icon: Store,
          help: (t) => t.market.module.help.orders,
          ownDataOnly: true,
          anyPermission: [MARKET_PERMISSIONS.viewOwn],
        },
      ],
    },
  ],
};
