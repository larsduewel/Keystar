import { BookOpenText, Landmark } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";
import { MINING_PERMISSIONS } from "@/modules/mining/module";

export const WALLET_SCOPE = "esi-wallet.read_character_wallet.v1";
export const CORP_WALLET_SCOPE = "esi-wallet.read_corporation_wallets.v1";
export const CORP_DIVISIONS_SCOPE = "esi-corporations.read_divisions.v1";

export const WALLET_PERMISSIONS = {
  corpView: "wallet.corp.view",
} as const;

/**
 * Character and corporation wallets. Character wallet access is sensitive, so that scope is opt-in per character
 * (enabled from the mining P&L) rather than requested from every member; pages that use it live in the modules that
 * need it. Corporation wallets are archived long-term (ESI only keeps about 30 days) and shown under Finances.
 */
export const walletModule: KeystarModule = {
  id: "wallet",
  name: "Wallet",
  description: "Character wallet transactions (opt-in) and the corporation wallet archive with income and expenses.",
  scopes: [
    {
      scope: WALLET_SCOPE,
      level: "character",
      optional: true,
      manageHref: "/mining/pnl/settings",
      managePermission: MINING_PERMISSIONS.pnl,
      reason: (t) => t.wallet.module.scopes.characterWallet,
      label: (t) => t.wallet.module.scopes.characterWalletLabel,
    },
    {
      scope: CORP_WALLET_SCOPE,
      level: "corporation",
      reason: (t) => t.wallet.module.scopes.corporationWallets,
      corpRoles: ["Accountant", "Junior_Accountant", "Director"],
    },
    {
      scope: CORP_DIVISIONS_SCOPE,
      level: "corporation",
      reason: (t) => t.wallet.module.scopes.divisions,
      corpRoles: ["Director"],
    },
  ],
  permissions: [
    {
      key: WALLET_PERMISSIONS.corpView,
      label: (t) => t.wallet.module.permissions.corpView.label,
      description: (t) => t.wallet.module.permissions.corpView.description,
      group: (t) => t.wallet.module.permissionGroup,
      defaultMinRole: "director",
    },
  ],
  nav: [
    {
      id: "finances",
      label: (t) => t.wallet.module.navSection,
      order: 25,
      items: [
        {
          href: "/finances",
          label: (t) => t.wallet.module.nav.corporationWallet,
          icon: Landmark,
          anyPermission: [WALLET_PERMISSIONS.corpView],
        },
        {
          href: "/finances/journal",
          label: (t) => t.wallet.module.nav.journal,
          icon: BookOpenText,
          anyPermission: [WALLET_PERMISSIONS.corpView],
        },
      ],
    },
  ],
};
