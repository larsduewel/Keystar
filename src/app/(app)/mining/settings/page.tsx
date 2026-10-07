import { KeyRound, Pickaxe, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { getI18n } from "@/i18n/server";
import { MINING_LEDGER_SCOPE, MINING_MANAGE_HREF, MINING_PERMISSIONS } from "@/modules/mining/module";
import { getMiningAccess } from "@/modules/mining/queries";
import { setOptionalScope } from "@/app/(app)/characters/actions";
import { deleteMiningData } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.mining.settings.metaTitle };
}

/** Mining access: which of the viewer's characters share their personal mining ledger with Keystar (opt-in). */
export default async function MiningSettingsPage() {
  const user = await requirePermission(MINING_PERMISSIONS.viewOwn);
  const { t, f } = await getI18n();
  const m = t.mining.settings;
  const sw = t.characters.scopeSwitch;
  const label = t.mining.module.scopes.characterMiningLabel;
  const demo = env().KEYSTAR_DEMO_MODE;
  const access = await getMiningAccess(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.mining.module.navSection} title={m.metaTitle} description={m.description} />

      <Panel title={m.title} subtitle={m.subtitle}>
        <div className="space-y-3">
          {access.map((a) => {
            const enable = reauthorizeHref(a.grantedScopes, {
              add: [MINING_LEDGER_SCOPE],
              returnTo: MINING_MANAGE_HREF,
              characterId: a.characterId,
            });
            const stored = a.firstDate && a.lastDate ? m.kept(f.shortDate(a.firstDate), f.shortDate(a.lastDate)) : m.nothing;
            return (
              <Glass key={a.characterId} className="flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
                <Portrait id={a.characterId} size={44} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.name}</span>
                    {a.granted && a.tokenStatus === "invalid" ? (
                      <StatusBadge status="error" label={m.revoked} />
                    ) : a.granted ? (
                      <StatusBadge status={a.lastStatus === "error" ? "warning" : "ok"} label={m.on} />
                    ) : (
                      <StatusBadge status="pending" label={m.off} />
                    )}
                  </div>
                  <p className="text-xs text-ink-3">
                    {a.granted ? (a.lastSuccessAt ? m.lastSync(f.relativeTime(a.lastSuccessAt)) : m.firstSync) : stored}
                    {a.granted && a.lastStatus === "error" && a.lastError ? ` · ${a.lastError}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {a.granted || a.switchedOff ? (
                    // In Keystar only: the token keeps the scope until the character is re-authorised.
                    <ActionForm
                      action={setOptionalScope.bind(null, a.characterId, MINING_LEDGER_SCOPE, !a.granted)}
                      success={a.granted ? sw.off(label, a.name) : sw.on(label, a.name)}
                      successDetail={a.granted ? sw.offDetail : undefined}
                      failed={sw.failed(label, a.name)}
                      errors={sw.errors}
                    >
                      {a.granted ? (
                        <Button type="submit" size="sm" variant="ghost">
                          {m.stop}
                        </Button>
                      ) : (
                        <Button type="submit" size="sm" variant="primary">
                          <Pickaxe className="size-3.5" aria-hidden /> {m.enable}
                        </Button>
                      )}
                    </ActionForm>
                  ) : demo ? (
                    <Button size="sm" disabled title={m.demo}>
                      <KeyRound className="size-3.5" aria-hidden /> {m.enable}
                    </Button>
                  ) : (
                    <ButtonLink href={enable} size="sm" variant="primary">
                      <Pickaxe className="size-3.5" aria-hidden /> {m.enable}
                    </ButtonLink>
                  )}
                  {/* A revoked token needs the EVE login to share the ledger again. */}
                  {a.granted && a.tokenStatus === "invalid" && !demo && (
                    <ButtonLink href={enable} size="sm" variant="primary">
                      <KeyRound className="size-3.5" aria-hidden /> {m.reauthorize}
                    </ButtonLink>
                  )}
                  {!a.granted && a.firstDate && (
                    <ActionForm
                      action={deleteMiningData.bind(null, a.characterId)}
                      // ESI only keeps 30 days: older history can't be fetched again.
                      confirm={m.deleteDataConfirm(a.name)}
                      success={m.toast.deleted(a.name)}
                      failed={m.toast.failed(a.name)}
                      errors={m.toast.errors}
                    >
                      <Button type="submit" size="sm" variant="danger" title={m.deleteDataHint}>
                        <Trash2 className="size-3.5" aria-hidden /> {m.deleteData}
                      </Button>
                    </ActionForm>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-ink-3">
          <li>{m.notes.scopes}</li>
          <li>{m.notes.stop}</li>
          <li>{m.notes.observers}</li>
        </ul>
      </Panel>
    </div>
  );
}
