import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { CorpLogo } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { outsideGuestIds } from "@/core/auth/manage-users";
import { getCorporation } from "@/core/corp";
import { getDb, eveCorporations } from "@/core/db";
import { env, ssoCallbackUrl, ssoConfigured } from "@/core/env";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { allPermissions } from "@/core/modules/registry";
import { effectiveMinRole } from "@/core/rbac/permissions";
import { ROLES } from "@/core/rbac/roles";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { SaveSettingsButton, SettingsForm } from "./settings-form";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.settings.metaTitle };
}

const selectClass = "glass-inset h-9 rounded-lg px-3 text-sm text-ink";

export default async function SettingsPage() {
  const actor = await requirePermission("app.settings.manage");
  const { t } = await getI18n();
  const ts = t.admin.settings;
  const settings = await getSettings();
  const home = await getCorporation(settings["corp.homeCorporationId"]);
  const knownCorps = await getDb().select().from(eveCorporations).orderBy(eveCorporations.name);
  const perms = allPermissions();
  const groups = [...new Set(perms.map((p) => p.group(t)))];
  const overrides = settings["permissions.overrides"];
  const e = env();
  const outsideGuests = settings["access.restrictToMembers"] ? (await outsideGuestIds()).length : 0;

  return (
    <SettingsForm className="space-y-6">
      <PageHeader
        eyebrow={t.shell.navSections.admin}
        title={t.shell.nav.settings}
        description={ts.description}
        actions={<SaveSettingsButton />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={ts.home.title} subtitle={ts.home.subtitle}>
          <div className="space-y-4">
            {home && (
              <div className="flex items-center gap-3 rounded-2xl glass-inset px-4 py-3">
                <CorpLogo id={home.corporationId} size={36} />
                <div>
                  <div className="font-medium">
                    {home.name} [{home.ticker}]
                  </div>
                  <div className="text-xs text-ink-3">ID {home.corporationId}</div>
                </div>
              </div>
            )}
            <label className="block text-sm">
              <span className="text-ink-2">{ts.home.corporationId}</span>
              <input
                name="homeCorporationId"
                defaultValue={settings["corp.homeCorporationId"] ?? ""}
                list="known-corps"
                inputMode="numeric"
                className="glass-inset mt-1.5 h-9 w-full rounded-lg px-3 text-sm text-ink"
                placeholder={ts.home.placeholder}
              />
              <datalist id="known-corps">
                {knownCorps.map((c) => (
                  <option key={c.corporationId} value={c.corporationId}>
                    {c.name} [{c.ticker}]
                  </option>
                ))}
              </datalist>
            </label>
            <p className="text-xs text-ink-3">{ts.home.hint}</p>
          </div>
        </Panel>

        <Panel title={ts.access.title} subtitle={ts.access.subtitle}>
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-3 rounded-2xl glass-inset px-4 py-3">
              <input
                type="checkbox"
                name="autoApproveCorpMembers"
                defaultChecked={settings["access.autoApproveCorpMembers"]}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="font-medium">{ts.access.autoCorp}</span>
                <span className="block text-xs text-ink-3">
                  {ts.access.autoCorpHint(t.common.roles.member.label, t.common.roles.guest.label)}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl glass-inset px-4 py-3">
              <input
                type="checkbox"
                name="autoApproveAllianceMembers"
                defaultChecked={settings["access.autoApproveAllianceMembers"]}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="font-medium">{ts.access.autoAlliance}</span>
                <span className="block text-xs text-ink-3">{ts.access.autoAllianceHint}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl glass-inset px-4 py-3">
              <input
                type="checkbox"
                name="restrictToMembers"
                defaultChecked={settings["access.restrictToMembers"]}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="font-medium">{ts.access.restrict}</span>
                <span className="block text-xs text-ink-3">{ts.access.restrictHint}</span>
                {outsideGuests > 0 && (
                  <span className="mt-1.5 block text-xs text-ink-2">
                    {ts.access.outsideGuests(outsideGuests)}{" "}
                    {actor.can("users.view") && (
                      <Link href="/admin/users" className="inline-flex items-center gap-1 text-accent hover:underline">
                        {ts.access.reviewOutsideGuests} <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    )}
                  </span>
                )}
              </span>
            </label>
            <div className="rounded-2xl glass-inset px-4 py-3 text-xs text-ink-2">
              <div className="mb-1 font-medium text-ink">EVE SSO</div>
              {ssoConfigured() ? ts.access.ssoConfigured : ts.access.ssoNotConfigured}
              <div className="mt-1 text-ink-3">
                {ts.access.callbackUrl(<code className="text-ink-2">{ssoCallbackUrl()}</code>)}
              </div>
              <div className="mt-1 text-ink-3">{ts.access.compatibilityDate(e.ESI_COMPATIBILITY_DATE)}</div>
            </div>
          </div>
        </Panel>

        <Panel title={ts.valuation.title} subtitle={ts.valuation.subtitle}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-2">{ts.valuation.source}</span>
              <select name="valuationSource" defaultValue={settings["mining.valuationSource"]} className={`${selectClass} mt-1.5 w-full`}>
                {VALUATION_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {t.eve.valuationSources[source]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-2">{ts.valuation.mode}</span>
              <select name="valuationMode" defaultValue={settings["mining.valuationMode"]} className={`${selectClass} mt-1.5 w-full`}>
                <option value="current">{ts.valuation.modes.current}</option>
                <option value="historical">{ts.valuation.modes.historical}</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-ink-3">{ts.valuation.hint}</p>
        </Panel>
      </div>

      <Panel id="permissions" title={ts.permissions.title} subtitle={ts.permissions.subtitle}>
        <div className="overflow-x-auto">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{ts.permissions.columns.permission}</th>
                <th>{ts.permissions.columns.description}</th>
                <th>{ts.permissions.columns.minRole}</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((g) => [
                <tr key={`g-${g}`}>
                  <td colSpan={3} className="eve-label pt-4 text-xs text-accent">
                    {g}
                  </td>
                </tr>,
                ...perms
                  .filter((p) => p.group(t) === g)
                  .map((p) => (
                    <tr key={p.key}>
                      <td>
                        <div className="font-medium">{p.label(t)}</div>
                        <code className="text-2xs text-ink-3">{p.key}</code>
                      </td>
                      <td className="text-ink-2">{p.description(t)}</td>
                      <td>
                        {p.locked ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                            <Lock className="size-3.5" aria-hidden /> {ts.permissions.fixed(t.common.roles[p.defaultMinRole].label)}
                          </span>
                        ) : (
                          <select name={`perm:${p.key}`} defaultValue={effectiveMinRole(p, overrides)} className={selectClass}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r === p.defaultMinRole
                                  ? ts.permissions.withDefault(t.common.roles[r].label)
                                  : t.common.roles[r].label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
      </Panel>
    </SettingsForm>
  );
}
