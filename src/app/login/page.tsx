import { ExternalLink, FlaskConical, ServerCog, ShieldCheck, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { EveSsoButton } from "@/components/auth/eve-sso-button";
import { ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { Glass } from "@/components/ui/glass";
import { LanguageLinks } from "@/components/shell/language-switcher";
import { KeystarMark } from "@/components/shell/logo";
import { getCurrentUser } from "@/core/auth/dal";
import { env, ssoCallbackUrl, ssoConfigured } from "@/core/env";
import { EVE_AUTHORIZED_APPS_URL } from "@/core/eve/links";
import { applicationScopes } from "@/core/modules/registry";
import { isRole } from "@/core/rbac/roles";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { getTheme } from "@/theme/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.login.metaTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { t } = await getI18n();
  const theme = await getTheme();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const demo = env().KEYSTAR_DEMO_MODE;
  const demoUsers = demo ? await getSetting("demo.users") : {};
  const configured = ssoConfigured();
  const errors = t.auth.login.errors;
  const errorText = error && Object.hasOwn(errors, error) ? errors[error as keyof typeof errors] : t.auth.login.genericError;
  const code = (text: string) => <code className="text-ink">{text}</code>;
  const authorizedApps = (text: string) => (
    <a
      href={EVE_AUTHORIZED_APPS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-accent hover:underline"
    >
      {text}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">{t.common.opensInNewTab}</span>
    </a>
  );

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[460px]">
        <Glass className="rounded-2xl px-6 pt-10 sm:px-9 pb-8 text-center">
          <KeystarMark className="mx-auto size-16" />
          <h1 className="mt-4 font-display text-[2.4rem] leading-none font-bold tracking-[0.2em]">KEYSTAR</h1>
          <p className="mt-2 text-sm text-ink-2">{t.auth.login.tagline}</p>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-2xl bg-critical/12 px-4 py-3 text-left text-sm ring-1 ring-critical/30">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical-text" aria-hidden />
              <div>
                <div className="font-medium text-ink">{errorText}</div>
                {message && <div className="mt-0.5 text-xs text-ink-2">{message}</div>}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col items-center gap-3">
            <EveSsoButton href="/auth/login?intent=login" label={t.auth.login.signIn} theme={theme} />
            <ButtonLink href="/join" variant="glass" size="md" className="w-full">
              {t.auth.login.register}
            </ButtonLink>
          </div>


          <div className="mt-7 flex items-start gap-2.5 rounded-2xl glass-inset px-4 py-3 text-left text-xs text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p>{t.auth.login.privacy(authorizedApps)}</p>
          </div>
        </Glass>

        {!configured && (
          <Glass className="mt-4 rounded-2xl px-6 py-5 text-left">
            <div className="flex items-center gap-2 text-sm font-semibold text-warning">
              <ServerCog className="size-4" aria-hidden /> {t.auth.login.setupTitle}
            </div>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-xs text-ink-2">
              <li>
                {t.auth.login.setupApp(<span className="text-ink">developers.eveonline.com</span>)}
                <div className="mt-1.5">
                  <CopyField value={ssoCallbackUrl()} />
                </div>
              </li>
              <li>
                {t.auth.login.setupScopes}
                <div className="mt-1.5">
                  <CopyField value={applicationScopes().join(" ")} />
                </div>
              </li>
              <li>
                {t.auth.login.setupEnv(
                  code("EVE_CLIENT_ID"),
                  code("EVE_CLIENT_SECRET"),
                  code(".env"),
                  code("docker compose up -d"),
                )}
              </li>
              <li>{t.auth.login.setupFirstPilot}</li>
            </ol>
          </Glass>
        )}

        {demo && Object.keys(demoUsers).length > 0 && (
          <Glass className="mt-4 rounded-2xl px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gold">
              <FlaskConical className="size-4" aria-hidden /> {t.auth.login.demoTitle}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(demoUsers).map((role) => (
                <ButtonLink
                  key={role}
                  href={`/auth/demo?as=${role}`}
                  size="sm"
                  title={isRole(role) ? t.common.roles[role].description : undefined}
                >
                  {isRole(role) ? t.common.roles[role].label : role}
                </ButtonLink>
              ))}
            </div>
          </Glass>
        )}

        <p className="mt-6 text-center text-2xs leading-relaxed text-ink-3">
          {t.common.ccpNotice}
          <br />
          {t.auth.login.license} ·{" "}
          <a href={env().SOURCE_URL} className="underline decoration-surface-contrast/20 underline-offset-2 hover:text-ink">
            {t.auth.login.sourceCode}
          </a>
        </p>
        <div className="mt-4 flex justify-center">
          <LanguageLinks />
        </div>
      </div>
    </main>
  );
}
