import { mapModule } from "@/modules/map/module";
import { fleetModule } from "@/modules/fleet/module";
import { intelModule } from "@/modules/intel/module";
import { killboardModule } from "@/modules/killboard/module";
import { miningModule } from "@/modules/mining/module";
import { socialModule } from "@/modules/social/module";
import { tradeModule } from "@/modules/trade/module";
import { walletModule } from "@/modules/wallet/module";
import type { PermissionDef } from "@/core/rbac/permissions";
import type { Settings } from "@/core/settings";
import type { Messages } from "@/i18n/messages";
import { coreModule } from "./core-module";
import type { AlertDef, KeystarModule, NavSection, ScopeRequirement } from "./types";

/**
 * Every enabled module. To add a feature (skills, assets, wallets …) create
 * src/modules/<name>/module.ts and list it here; register its jobs in
 * src/modules/jobs.ts. See docs/modules.md.
 */
export const MODULES: KeystarModule[] = [
  coreModule,
  mapModule,
  miningModule,
  killboardModule,
  fleetModule,
  intelModule,
  tradeModule,
  walletModule,
  socialModule,
];

export function allPermissions(): PermissionDef[] {
  return MODULES.flatMap((m) => m.permissions);
}

export function allScopeRequirements(): (ScopeRequirement & { module: string })[] {
  return MODULES.flatMap((m) => m.scopes.map((s) => ({ ...s, module: m.name })));
}

/** Scope requirements every member grants when linking a character (no opt-in scopes). */
export function memberScopeRequirements(): (ScopeRequirement & { module: string })[] {
  return allScopeRequirements().filter((s) => s.level === "character" && !s.optional);
}

/** Scopes every member grants when linking a character. */
export function characterScopes(): string[] {
  return [...new Set(memberScopeRequirements().map((s) => s.scope))].sort();
}

/** Character scopes plus corporation-level scopes for directors/accountants. */
export function corporationScopes(): string[] {
  return [...new Set(allScopeRequirements().filter((s) => !s.optional).map((s) => s.scope))].sort();
}

/** Opt-in scopes a user can add to individual characters (see ScopeRequirement.optional). */
export function optionalScopes(): string[] {
  return [...new Set(allScopeRequirements().filter((s) => s.optional).map((s) => s.scope))].sort();
}

/** Every scope Keystar may request: what the EVE developer application must allow. */
export function applicationScopes(): string[] {
  return [...new Set(allScopeRequirements().map((s) => s.scope))].sort();
}

/** The permission needed to switch an opt-in scope on or off (`managePermission`), if it declares one. */
export function optionalScopePermission(scope: string): string | undefined {
  return allScopeRequirements().find((s) => s.optional && s.scope === scope)?.managePermission;
}

/** Short names of the opt-in scopes ("Fleet access"), falling back to the scope id. */
export function optionalScopeLabels(t: Messages): Record<string, string> {
  return Object.fromEntries(allScopeRequirements().flatMap((s) => (s.optional ? [[s.scope, s.label?.(t) ?? s.scope]] : [])));
}

export const LOGIN_INTENTS = ["login", "join", "link", "link-corp"] as const;
export type LoginIntent = (typeof LOGIN_INTENTS)[number];

/**
 * Scopes to request for an SSO intent. `extra` may add known opt-in scopes, and
 * only when linking (signing in or joining never asks for them).
 */
export function scopesForIntent(intent: LoginIntent, extra: readonly string[] = []): string[] {
  if (intent === "login") return [];
  const base = intent === "link-corp" ? corporationScopes() : characterScopes();
  if (intent === "join") return base;
  const allowed = new Set(optionalScopes());
  return [...new Set([...base, ...extra.filter((s) => allowed.has(s))])].sort();
}

/** Known opt-in scopes from a `with=`/`drop=` list (comma or space separated). */
export function parseOptionalScopes(value: string | null | undefined): string[] {
  const allowed = new Set(optionalScopes());
  return [...new Set((value ?? "").split(/[\s,]+/).filter((s) => allowed.has(s)))];
}

/**
 * SSO link that re-authorises a character without losing what it already has:
 * EVE replaces a token's scopes on every login, so corporation and opt-in
 * scopes the character holds are requested again (`add`/`remove` change the
 * opt-in set). With `characterId`, the callback refuses a login with any other
 * character, whose token would otherwise get this character's scope set.
 */
export function reauthorizeHref(
  granted: readonly string[],
  opts: { add?: readonly string[]; remove?: readonly string[]; returnTo?: string; characterId?: number } = {},
): string {
  const member = new Set(characterScopes());
  const corpOnly = corporationScopes().filter((s) => !member.has(s));
  const intent: LoginIntent = corpOnly.some((s) => granted.includes(s)) ? "link-corp" : "link";
  const remove = new Set(opts.remove ?? []);
  const extra = optionalScopes().filter((s) => (granted.includes(s) || opts.add?.includes(s)) && !remove.has(s));
  const dropped = optionalScopes().filter((s) => granted.includes(s) && remove.has(s));
  const params = new URLSearchParams({ intent });
  if (extra.length) params.set("with", extra.join(","));
  if (dropped.length) params.set("drop", dropped.join(","));
  if (opts.returnTo) params.set("returnTo", opts.returnTo);
  if (opts.characterId) params.set("character", String(opts.characterId));
  return `/auth/login?${params}`;
}

export function navSections(): NavSection[] {
  const byId = new Map<string, NavSection>();
  for (const m of MODULES) {
    for (const section of m.nav) {
      const existing = byId.get(section.id);
      if (existing) {
        existing.items.push(...section.items);
        existing.tone ??= section.tone;
      } else byId.set(section.id, { ...section, items: [...section.items] });
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

/** Live alerts a user may switch on: their permissions and the app settings allow them. */
export function availableAlerts(user: { can: (permission: string) => boolean }, settings: Settings): AlertDef[] {
  return MODULES.flatMap((m) => m.alerts ?? []).filter(
    (a) => (!a.anyPermission || a.anyPermission.some((p) => user.can(p))) && (!a.available || a.available(settings)),
  );
}
