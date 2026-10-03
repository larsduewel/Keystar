import type { LucideIcon } from "lucide-react";
import type { Msg } from "@/i18n/messages";
import type { PermissionDef } from "@/core/rbac/permissions";

/**
 * The contract every Keystar feature module implements. A module declares
 * what it needs (ESI scopes, permissions) and what it offers (navigation).
 * User-facing text is a `Msg` that picks from the dictionaries, so every
 * language can render it: `label: (t) => t.mining.module.nav.ledger`.
 * Background jobs live separately in the module's `jobs.ts` so the web bundle
 * never pulls in worker code — see src/core/sync/types.ts.
 */
export interface ScopeRequirement {
  scope: string;
  /**
   * `character`: requested from every member when they link a character.
   * `corporation`: only requested when a director/officer links a character
   * for corporation data; usually needs an in-game corp role as well.
   */
  level: "character" | "corporation";
  reason: Msg;
  /** In-game corporation roles that make this scope useful (any of). */
  corpRoles?: string[];
  /**
   * Opt-in per character (e.g. wallet access for the mining P&L): never part of
   * the member/corporation scope sets, never reported as missing. Requested only
   * when a user enables it for a character (`/auth/login?with=<scope>`).
   */
  optional?: boolean;
  /** For an optional scope: the page where users turn it on or off per character. */
  manageHref?: string;
}

export interface NavItem {
  href: string;
  label: Msg;
  icon: LucideIcon;
  /** Visible if the user has any of these permissions (omit = always visible). */
  anyPermission?: string[];
}

/** Section colours, defined as `--color-section-*` in globals.css. */
export type SectionTone = "industry" | "combat" | "trade";

export interface NavSection {
  id: string;
  /** Sections with the same id are merged; the first module's label wins. */
  label: Msg;
  order: number;
  /**
   * Colours the page headings, sidebar marker and header glow on this section's
   * pages. Omit to keep the accent. When sections merge, the first tone set wins.
   */
  tone?: SectionTone;
  items: NavItem[];
}

export interface KeystarModule {
  id: string;
  name: string;
  description: string;
  scopes: ScopeRequirement[];
  permissions: PermissionDef[];
  nav: NavSection[];
}
