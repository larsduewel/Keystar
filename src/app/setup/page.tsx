import { inArray } from "drizzle-orm";
import { ArrowLeft, Building2, Check, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { CorpLogo, Portrait } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { LanguageLinks } from "@/components/shell/language-switcher";
import { KeystarMark } from "@/components/shell/logo";
import { requirePermission } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { esiTokens, eveCorporations, getDb } from "@/core/db";
import { env } from "@/core/env";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { corporationScopes } from "@/core/modules/registry";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { finishSetup, saveSetupAccess, saveSetupCorporation } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.setup.metaTitle };
}

const STEPS = ["corporation", "access", "corporationData", "invite"] as const;

/**
 * First-start walkthrough for the first admin. Server secrets live in .env;
 * this only covers decisions that belong in the app.
 */
export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const user = await requirePermission("app.settings.manage");
  const { t } = await getI18n();
  const m = t.setup;
  const params = await searchParams;
  const step = Math.min(STEPS.length, Math.max(1, Number(params.step) || 1));
  const settings = await getSettings();
  const db = getDb();

  const ownCorpIds = [...new Set(user.characters.map((c) => c.corporationId))];
  const ownCorps = ownCorpIds.length
    ? await db.select().from(eveCorporations).where(inArray(eveCorporations.corporationId, ownCorpIds))
    : [];
  const home = await getCorporation(settings["corp.homeCorporationId"]);
  const tokens = user.characterIds.length
    ? await db.select().from(esiTokens).where(inArray(esiTokens.characterId, user.characterIds))
    : [];
  const corpScopes = corporationScopes();
  const failure = { failed: m.toast.failed, errors: m.toast.errors };
  const corpReady = user.characters.filter((c) => {
    const token = tokens.find((x) => x.characterId === c.characterId);
    return token?.status === "active" && corpScopes.every((s) => token.scopes.includes(s));
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[560px]">
        <div className="mb-6 flex items-center justify-center gap-2" aria-label={m.progress(step, STEPS.length)}>
          {STEPS.map((id, i) => (
            <span
              key={id}
              title={m.steps[id]}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i + 1 === step ? "w-8 bg-accent" : i + 1 < step ? "w-4 bg-accent/50" : "w-4 bg-surface-contrast/12",
              )}
            />
          ))}
        </div>

        <Glass className="rounded-2xl px-6 pt-9 sm:px-9 pb-8">
          {step === 1 && (
            <ActionForm action={saveSetupCorporation} {...failure} redirectTo="/setup?step=2">
              <StepHeader icon={Building2} title={m.corporation.title}>
                {m.corporation.intro}
              </StepHeader>
              <div className="mt-6 space-y-2">
                {ownCorps.map((c) => (
                  <label
                    key={c.corporationId}
                    className="flex cursor-pointer items-center gap-3 rounded-xl glass-inset px-4 py-3 has-[:checked]:ring-1 has-[:checked]:ring-accent/60"
                  >
                    <input
                      type="radio"
                      name="corporationId"
                      value={c.corporationId}
                      defaultChecked={c.corporationId === (home?.corporationId ?? ownCorps[0]?.corporationId)}
                      className="accent-accent"
                    />
                    <CorpLogo id={c.corporationId} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-ink-3">
                        [{c.ticker}] · {m.corporation.members(c.memberCount)}
                      </div>
                    </div>
                  </label>
                ))}
                <details className="rounded-xl glass-inset px-4 py-3 text-sm">
                  <summary className="cursor-pointer text-ink-2">{m.corporation.otherId}</summary>
                  <input
                    name="corporationId"
                    inputMode="numeric"
                    placeholder={m.corporation.otherIdPlaceholder}
                    className="glass-inset mt-3 h-9 w-full rounded-lg px-3 text-sm text-ink"
                  />
                  <p className="mt-2 text-xs text-ink-3">{m.corporation.otherIdHint}</p>
                </details>
              </div>
              <Footer />
            </ActionForm>
          )}

          {step === 2 && (
            <ActionForm action={saveSetupAccess} {...failure} redirectTo="/setup?step=3">
              <StepHeader icon={ShieldCheck} title={m.access.title}>
                {m.access.intro}
              </StepHeader>
              <div className="mt-6 space-y-2 text-sm">
                <Toggle
                  name="autoApproveCorpMembers"
                  checked={settings["access.autoApproveCorpMembers"]}
                  title={m.access.autoApproveCorp(home?.name ?? null)}
                  hint={m.access.autoApproveCorpHint(t.common.roles.member.label)}
                />
                <Toggle
                  name="autoApproveAllianceMembers"
                  checked={settings["access.autoApproveAllianceMembers"]}
                  title={m.access.autoApproveAlliance}
                  hint={m.access.autoApproveAllianceHint}
                />
                <label className="block rounded-xl glass-inset px-4 py-3">
                  <span className="font-medium">{m.access.valuation}</span>
                  <select
                    name="valuationSource"
                    defaultValue={settings["mining.valuationSource"]}
                    className="glass-inset mt-2 h-9 w-full rounded-lg px-3 text-sm text-ink"
                  >
                    {VALUATION_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {t.eve.valuationSources[source]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Footer back={1} />
            </ActionForm>
          )}

          {step === 3 && (
            <div>
              <StepHeader icon={KeyRound} title={m.corporationData.title}>
                {m.corporationData.intro((name) => <strong className="text-ink">{name}</strong>, t.shell.nav.characters)}
              </StepHeader>
              <div className="mt-6 space-y-2">
                {corpReady.length > 0 ? (
                  corpReady.map((c) => (
                    <div key={c.characterId} className="flex items-center gap-3 rounded-xl glass-inset px-4 py-3">
                      <Portrait id={c.characterId} size={32} />
                      <span className="flex-1 font-medium">{c.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-good-text">
                        <Check className="size-3.5" aria-hidden /> {m.corporationData.accessGranted}
                      </span>
                    </div>
                  ))
                ) : (
                  <ButtonLink href="/auth/login?intent=link-corp&returnTo=%2Fsetup%3Fstep%3D3" variant="gold" className="w-full">
                    <Building2 className="size-4" aria-hidden /> {m.corporationData.link}
                  </ButtonLink>
                )}
              </div>
              <div className="mt-8 flex items-center justify-between">
                <BackLink step={2} />
                <ButtonLink href="/setup?step=4" variant={corpReady.length ? "primary" : "glass"}>
                  {corpReady.length ? m.continue : m.corporationData.skip}
                </ButtonLink>
              </div>
            </div>
          )}

          {step === 4 && (
            <ActionForm action={finishSetup} {...failure} redirectTo="/">
              <StepHeader icon={Sparkles} title={m.invite.title}>
                {m.invite.intro}
              </StepHeader>
              <div className="mt-6">
                <CopyField value={`${env().APP_URL}/join`} />
              </div>
              <ul className="mt-5 space-y-1.5 text-xs text-ink-2">
                <li>• {m.invite.worker}</li>
                <li>• {m.invite.history}</li>
                <li>• {m.invite.settings(`${t.shell.navSections.admin} → ${t.shell.nav.settings}`)}</li>
              </ul>
              <div className="mt-8 flex items-center justify-between">
                <BackLink step={3} />
                <Button type="submit" variant="primary">
                  {m.invite.finish}
                </Button>
              </div>
            </ActionForm>
          )}
        </Glass>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-3">
          <KeystarMark className="size-4" /> {m.progress(step, STEPS.length)} · {m.steps[STEPS[step - 1]]}
        </div>
        <div className="mt-4 flex justify-center">
          <LanguageLinks />
        </div>
      </div>
    </main>
  );
}

function StepHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl border border-surface-contrast/[0.08] bg-surface-contrast/[0.03]">
        <Icon className="size-5 text-accent" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{children}</p>
    </div>
  );
}

function Toggle({ name, checked, title, hint }: { name: string; checked: boolean; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl glass-inset px-4 py-3">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 size-4 accent-accent" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
}

async function BackLink({ step }: { step: number }) {
  const { t } = await getI18n();
  return (
    <Link href={`/setup?step=${step}`} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> {t.setup.back}
    </Link>
  );
}

async function Footer({ back }: { back?: number }) {
  const { t } = await getI18n();
  return (
    <div className="mt-8 flex items-center justify-between">
      {back ? <BackLink step={back} /> : <span />}
      <Button type="submit" variant="primary">
        {t.setup.continue}
      </Button>
    </div>
  );
}
