import { inArray } from "drizzle-orm";
import Link from "next/link";
import { Building2, Crown, ExternalLink, KeyRound, Link2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { CorpLogo, Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requireUser } from "@/core/auth/dal";
import { characterCorpRoles, esiTokens, eveCorporations, getDb, syncJobs } from "@/core/db";
import { EVE_AUTHORIZED_APPS_URL } from "@/core/eve/links";
import {
  allScopeRequirements,
  characterScopes,
  corporationScopes,
  esiHealth,
  optionalScopeLabels,
  optionalScopes,
  parseOptionalScopes,
  reauthorizeHref,
} from "@/core/modules/registry";
import { getI18n } from "@/i18n/server";
import { jobLabel } from "@/modules/jobs";
import { removeCharacter, setMainCharacter, syncCharacterNow } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.characters.metaTitle };
}

export default async function CharactersPage({ searchParams }: PageProps<"/characters">) {
  const user = await requireUser();
  const params = await searchParams;
  const { t, f } = await getI18n();
  const m = t.characters;
  const ids = user.characterIds;
  const db = getDb();
  const [tokens, roles, corps, jobs] = ids.length
    ? await Promise.all([
        db.select().from(esiTokens).where(inArray(esiTokens.characterId, ids)),
        db.select().from(characterCorpRoles).where(inArray(characterCorpRoles.characterId, ids)),
        db
          .select()
          .from(eveCorporations)
          .where(inArray(eveCorporations.corporationId, [...new Set(user.characters.map((c) => c.corporationId))])),
        db.select().from(syncJobs).where(inArray(syncJobs.ownerId, ids)),
      ])
    : [[], [], [], []];

  const memberScopes = characterScopes();
  const corpOnly = corporationScopes().filter((s) => !memberScopes.includes(s));
  const optional = optionalScopes();
  // Set by the SSO callback when a generic link dropped opt-in scopes a character had.
  const lostChar = user.characters.find((c) => String(c.characterId) === String(params.lost ?? ""));
  const lostGranted = tokens.find((x) => x.characterId === lostChar?.characterId)?.scopes ?? [];
  const lostScopes = lostChar
    ? parseOptionalScopes(String(params.scopes ?? "")).filter((s) => !lostGranted.includes(s))
    : [];
  const reasons = new Map(allScopeRequirements().map((s) => [s.scope, s.reason(t)]));
  const scopeLabels = optionalScopeLabels(t);
  const tc = m.toast;
  // A scope two accesses share (structure names) links to the first module that declares it, as its permission does.
  const manageHrefs = new Map(allScopeRequirements().flatMap((s) => (s.manageHref ? [[s.scope, s.manageHref] as const] : [])).reverse());
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
    <div className="space-y-6">
      <PageHeader
        eyebrow={m.header.eyebrow}
        title={m.header.title}
        description={m.header.description}
        actions={
          <ButtonLink href="/auth/login?intent=link" variant="primary">
            <Link2 className="size-4" aria-hidden /> {m.header.link}
          </ButtonLink>
        }
      />

      {lostChar && lostScopes.length > 0 && (
        <Glass className="flex flex-wrap items-center gap-4 border border-warning/30 px-5 py-4">
          <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1 text-sm text-ink-2">
            <p className="font-semibold text-ink">{m.lostScope.title(lostChar.name)}</p>
            <p className="mt-0.5 text-xs">
              {m.lostScope.before}{" "}
              {lostScopes.map((s) => (
                <code key={s} className="text-ink" title={reasons.get(s)}>
                  {s}
                </code>
              ))}{" "}
              {m.lostScope.after}
            </p>
          </div>
          <ButtonLink href={reauthorizeHref(lostGranted, { add: lostScopes, characterId: lostChar.characterId })} size="sm" variant="primary">
            <KeyRound className="size-3.5" aria-hidden /> {m.lostScope.action}
          </ButtonLink>
        </Glass>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          {user.characters.map((c) => {
            const token = tokens.find((x) => x.characterId === c.characterId);
            const granted = token?.scopes ?? [];
            const health = esiHealth(token, memberScopes);
            const missing = memberScopes.filter((s) => !granted.includes(s));
            const corpGranted = corpOnly.filter((s) => granted.includes(s));
            // Member scopes (none while every character scope is opt-in) and the corporation scopes held.
            const fixedScopes = memberScopes.length > 0 || corpGranted.length > 0;
            const charRoles = roles.find((r) => r.characterId === c.characterId)?.roles ?? [];
            const corp = corps.find((x) => x.corporationId === c.corporationId);
            const charJobs = jobs.filter((j) => j.ownerType === "character" && j.ownerId === c.characterId && j.enabled);
            const isMain = user.main?.characterId === c.characterId;
            const switchedOff = token?.status === "active" ? token.disabledScopes : [];

            return (
              <Glass key={c.characterId} className="px-5 py-5">
                <div className="flex flex-wrap items-start gap-4">
                  <Portrait id={c.characterId} size={72} className="ring-2" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{c.name}</h2>
                      {isMain && (
                        <Badge tone="gold">
                          <Crown className="size-3" aria-hidden /> {m.card.main}
                        </Badge>
                      )}
                      {health === "revoked" ? (
                        <StatusBadge status="error" label={m.card.tokenRevoked} />
                      ) : health === "missing" ? (
                        <StatusBadge status="warning" label={token ? m.card.scopesMissing(missing.length) : m.card.noToken} />
                      ) : health === "none" ? (
                        // Nothing granted is fine: every ESI scope is opt-in.
                        <Badge>{m.card.noToken}</Badge>
                      ) : (
                        <StatusBadge status="ok" label={m.card.esiActive} />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
                      <CorpLogo id={c.corporationId} size={18} />
                      {corp ? `${corp.name} [${corp.ticker}]` : m.card.corporationFallback(c.corporationId)}
                    </div>
                    {charRoles.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {charRoles.slice(0, 8).map((r) => (
                          <Badge key={r}>{r.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    )}
                    {token?.status === "invalid" && token.lastError && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-critical-text">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {token.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(health === "revoked" || health === "missing") && (
                      <ButtonLink href={reauthorizeHref(granted, { characterId: c.characterId })} size="sm" variant="primary">
                        <KeyRound className="size-3.5" aria-hidden /> {m.card.reauthorise}
                      </ButtonLink>
                    )}
                    {token?.status === "active" && (
                      <ActionForm
                        action={syncCharacterNow.bind(null, c.characterId)}
                        success={tc.syncQueued(c.name)}
                        successDetail={tc.syncQueuedDetail}
                        failed={tc.failed(c.name)}
                        errors={tc.errors}
                      >
                        <Button size="sm" type="submit" title={m.card.syncNowHint}>
                          <RefreshCw className="size-3.5" aria-hidden /> {m.card.syncNow}
                        </Button>
                      </ActionForm>
                    )}
                    {!isMain && (
                      <ActionForm
                        action={setMainCharacter.bind(null, c.characterId)}
                        success={tc.mainSet(c.name)}
                        failed={tc.failed(c.name)}
                        errors={tc.errors}
                      >
                        <Button size="sm" type="submit" variant="ghost">
                          <Crown className="size-3.5" aria-hidden /> {m.card.makeMain}
                        </Button>
                      </ActionForm>
                    )}
                    {user.characters.length > 1 && (
                      <ActionForm
                        action={removeCharacter.bind(null, c.characterId)}
                        success={tc.removed(c.name)}
                        successDetail={tc.removedDetail}
                        failed={tc.failed(c.name)}
                        errors={tc.errors}
                      >
                        <Button size="sm" type="submit" variant="danger" title={m.card.removeHint}>
                          <Trash2 className="size-3.5" aria-hidden /> {m.card.remove}
                        </Button>
                      </ActionForm>
                    )}
                  </div>
                </div>

                {switchedOff.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/25 glass-inset px-4 py-3">
                    <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                    <div className="min-w-0 flex-1 text-xs text-ink-2">
                      <p className="font-semibold text-ink">
                        {m.disabledScopes.title(switchedOff.map((s) => scopeLabels[s] ?? s).join(", "))}
                      </p>
                      <p className="mt-0.5">{m.disabledScopes.body}</p>
                      <p className="mt-0.5 font-medium text-ink">{m.disabledScopes.pickCharacter(c.name)}</p>
                    </div>
                    <ButtonLink href={reauthorizeHref(granted, { characterId: c.characterId })} size="sm">
                      <KeyRound className="size-3.5" aria-hidden /> {m.disabledScopes.action}
                    </ButtonLink>
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl glass-inset px-4 py-3">
                    <div className="eve-label mb-2 text-2xs text-ink-3">{m.card.scopes}</div>
                    {fixedScopes && (
                      <ul className="mb-3 space-y-1 text-xs">
                        {memberScopes.map((s) => (
                          <li key={s} className="flex items-center justify-between gap-2" title={reasons.get(s)}>
                            <code className="truncate text-ink-2">{s}</code>
                            {granted.includes(s) ? <Badge tone="good">{m.card.granted}</Badge> : <Badge tone="warning">{m.card.missing}</Badge>}
                          </li>
                        ))}
                        {corpGranted.length > 0 && (
                          <li className="pt-1 text-ink-3">{m.card.corporationScopes(corpGranted.length)}</li>
                        )}
                      </ul>
                    )}
                    {optional.length > 0 && (
                      <>
                        {fixedScopes && <div className="eve-label mb-2 text-2xs text-ink-3">{m.card.optional}</div>}
                        <ul className="space-y-1 text-xs">
                          {optional.map((s) => {
                            const badge = granted.includes(s) ? <Badge tone="good">{m.card.optionalOn}</Badge> : <Badge>{m.card.optionalOff}</Badge>;
                            const href = manageHrefs.get(s);
                            return (
                              <li key={s} className="flex items-center justify-between gap-2" title={reasons.get(s)}>
                                <code className="truncate text-ink-2">{s}</code>
                                {href ? (
                                  <Link href={href} className="shrink-0">
                                    {badge}
                                  </Link>
                                ) : (
                                  badge
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                  <div className="rounded-2xl glass-inset px-4 py-3">
                    <div className="eve-label mb-2 text-2xs text-ink-3">{m.card.backgroundSync}</div>
                    {charJobs.length === 0 ? (
                      <p className="text-xs text-ink-3">{m.card.noJobs}</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {charJobs.map((j) => (
                          <li key={j.id} className="flex items-center justify-between gap-2">
                            <span className="text-ink-2">{jobLabel(j.jobKey, t)}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-ink-3">{f.relativeTime(j.lastSuccessAt)}</span>
                              <StatusBadge status={j.lastStatus === "ok" ? "ok" : j.lastStatus === "error" ? "error" : "pending"} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {token?.lastRefreshedAt && (
                      <p className="mt-2 text-2xs text-ink-3">{m.card.tokenRefreshed(f.relativeTime(token.lastRefreshedAt))}</p>
                    )}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title={m.corporationAccess.title} subtitle={m.corporationAccess.subtitle}>
            <div className="space-y-3 text-sm text-ink-2">
              <p>{m.corporationAccess.intro}</p>
              <ul className="space-y-1.5">
                {corpOnly.map((s) => (
                  <li key={s} className="rounded-xl glass-inset px-3 py-2 text-xs">
                    <div className="text-ink">{reasons.get(s)}</div>
                    <code className="text-2xs text-ink-3">{s}</code>
                  </li>
                ))}
              </ul>
              <ButtonLink href="/auth/login?intent=link-corp" variant="gold" className="w-full">
                <Building2 className="size-4" aria-hidden /> {m.corporationAccess.link}
              </ButtonLink>
            </div>
          </Panel>
          <Panel title={m.privacy.title} subtitle={m.privacy.subtitle}>
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-ink-2">
              <li>{m.privacy.encrypted}</li>
              <li>{m.privacy.readOnly}</li>
              <li>{m.privacy.removal}</li>
              <li>{m.privacy.mining}</li>
              <li>{m.privacy.wallet}</li>
              <li>{m.privacy.mail}</li>
              <li>{m.privacy.revoke(authorizedApps)}</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
