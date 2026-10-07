import { ArrowLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import { EveSsoButton } from "@/components/auth/eve-sso-button";
import { Glass } from "@/components/ui/glass";
import { LanguageLinks } from "@/components/shell/language-switcher";
import { KeystarMark } from "@/components/shell/logo";
import { getCurrentUser } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { scopeGroups } from "@/core/help/access";
import { allScopeRequirements } from "@/core/modules/registry";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { getTheme } from "@/theme/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.join.metaTitle };
}

/**
 * Shareable recruitment link: registering asks EVE for no ESI scope, so the page lists the optional access a pilot
 * can switch on per character afterwards, then sends them through EVE SSO.
 */
export default async function JoinPage() {
  const user = await getCurrentUser();
  const { t } = await getI18n();
  const theme = await getTheme();
  const corp = await getCorporation(await getSetting("corp.homeCorporationId"));
  // Every character scope is opt-in (tests/optional-scopes.test.ts), so there is nothing to grant here.
  const optional = scopeGroups(allScopeRequirements(), t, () => false).optional;

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <Glass className="w-full max-w-[560px] rounded-2xl px-6 py-9 sm:px-9">
        <div className="flex items-center gap-3">
          <KeystarMark className="size-11" />
          <div>
            <div className="eve-label text-xs text-accent">{t.auth.join.eyebrow}</div>
            <h1 className="font-display text-2xl font-bold tracking-wide">
              {corp ? t.auth.join.titleWithCorp(corp.name) : t.auth.join.title}
            </h1>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-2">{t.auth.join.intro}</p>

        <div className="eve-label mt-5 text-2xs text-ink-3">{t.auth.join.optional}</div>
        <ul className="mt-2 space-y-2.5">
          {optional.map((g) => (
            <li key={g.href} className="flex gap-3 rounded-2xl glass-inset px-4 py-3">
              <ToggleRight className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <div>
                <div className="text-sm font-medium text-ink">{g.label}</div>
                {g.scopes.map((s) => (
                  <div key={s.scope} className="mt-0.5 text-xs text-ink-2">
                    {s.reason}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-7 text-center">
          <EveSsoButton
            href={user ? "/auth/login?intent=link" : "/auth/login?intent=join"}
            label={user ? t.auth.join.link : t.auth.join.register}
            theme={theme}
          />
          <p className="mt-3 text-center text-xs text-ink-3">
            {t.auth.join.alts(<span className="text-ink-2">{t.shell.nav.characters}</span>)}
          </p>
        </div>
        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden /> {t.auth.join.back}
        </Link>
        <div className="mt-4 flex justify-center">
          <LanguageLinks />
        </div>
        <p className="mt-5 text-center text-2xs leading-relaxed text-ink-3">{t.common.ccpNotice}</p>
      </Glass>
    </main>
  );
}
