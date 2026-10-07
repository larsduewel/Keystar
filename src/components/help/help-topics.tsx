"use client";

import { ArrowRight, Check, Database, ExternalLink, Hourglass, KeyRound, Lock, Minus, RefreshCw, Sparkles, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { matchNavItem } from "@/components/shell/nav-match";
import { KeystarMark } from "@/components/shell/logo";
import { RoleBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EVE_AUTHORIZED_APPS_URL } from "@/core/eve/links";
import type { AccessRow } from "@/core/help/access";
import type { HelpData } from "@/core/help/types";
import { ROLES, type Role } from "@/core/rbac/roles";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { UpgradeNotes } from "./upgrade-notes";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-grid min-w-5 place-items-center rounded border border-surface-contrast/15 bg-surface-contrast/[0.06] px-1 font-mono text-2xs text-ink">
      {children}
    </kbd>
  );
}

function Heading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} tabIndex={-1} className="text-lg font-semibold outline-none">
      {children}
    </h3>
  );
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <h4 className="eve-label text-2xs text-ink-3">{title}</h4>
      {children}
    </section>
  );
}

function Facts({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-ink-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <Check className="mt-0.5 size-3.5 shrink-0 text-good-text" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ExternalA({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
      {children}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">{t.common.opensInNewTab}</span>
    </a>
  );
}

/** "Member and above", "Everyone who is signed in" or "No role at the moment". */
function MinRole({ role }: { role: Role | null }) {
  const { t } = useI18n();
  if (role === "guest") return <>{t.help.page.everyone}</>;
  if (!role) return <>{t.help.page.nobody}</>;
  return <>{t.help.page.fromRole(<RoleBadge role={role} />)}</>;
}

export function PageTopic({
  data,
  row,
  pathname,
  headingId,
}: {
  data: HelpData;
  row: AccessRow | undefined;
  pathname: string;
  headingId: string;
}) {
  const { t } = useI18n();
  const tp = t.help.page;
  if (!row) {
    return (
      <div className="space-y-3">
        <Heading id={headingId}>{t.help.topics.page}</Heading>
        <p className="text-sm text-ink-2">{tp.none}</p>
      </div>
    );
  }
  // Optional access whose switch belongs to this page (/mining/pnl/settings → Mining P&L, not Mining Overview).
  const optional = data.scopes.optional.find((g) => matchNavItem(g.href, data.access)?.href === row.href);
  const fact = "flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5";
  return (
    <div className="space-y-4">
      <div>
        <div className="eve-label text-2xs text-ink-3">{row.section}</div>
        <Heading id={headingId}>{row.label}</Heading>
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{row.help}</p>
      <ul className="glass-inset divide-y divide-surface-contrast/[0.06] rounded-lg text-sm">
        <li className={cn(fact, "justify-between")}>
          <span className="text-ink-3">{tp.whoCanOpen}</span>
          <span className="flex items-center gap-1.5">
            <MinRole role={row.minRole} />
          </span>
        </li>
        {row.ownDataOnly && (
          <li className={fact}>
            <Lock className="size-3.5 shrink-0 text-good-text" aria-hidden />
            <span className="min-w-0 flex-1">{tp.ownData}</span>
          </li>
        )}
        {optional && (
          <li className={fact}>
            <KeyRound className="size-3.5 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1">{tp.optional(optional.label)}</span>
            {optional.canManage && optional.href !== pathname && (
              <Link href={optional.href} className="text-xs text-accent hover:underline" data-close-dialog>
                {tp.manage}
              </Link>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

const STEP_ICONS = { signIn: UserRoundCheck, grant: KeyRound, sync: RefreshCw, read: Database } as const;

export function BasicsTopic({ data, headingId }: { data: HelpData; headingId: string }) {
  const { t } = useI18n();
  const b = t.help.basics;
  return (
    <div className="space-y-4">
      <Heading id={headingId}>{t.help.topics.basics}</Heading>
      <p className="text-sm text-ink-2">{b.intro(data.instance.homeCorp)}</p>
      <ol className="grid gap-2.5 sm:grid-cols-2">
        {(Object.keys(b.steps) as (keyof typeof b.steps)[]).map((key, i) => {
          const Icon = STEP_ICONS[key];
          return (
            <li key={key} className="glass-inset flex gap-3 rounded-lg px-4 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  <span className="mr-1.5 font-mono text-2xs text-ink-3">{i + 1}</span>
                  {b.steps[key].title}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{b.steps[key].body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-ink-2">{b.public}</p>
      <p className="text-2xs leading-relaxed text-ink-3">{t.common.ccpNotice}</p>
    </div>
  );
}

function ScopeList({ rows }: { rows: { scope: string; reason: string; extra?: ReactNode }[] }) {
  const { t } = useI18n();
  if (!rows.length) return <p className="text-xs text-ink-3">{t.help.scopes.none}</p>;
  return (
    <ul className="divide-y divide-surface-contrast/[0.06]">
      {rows.map((r) => (
        <li key={r.scope} className="py-2 text-sm">
          <div className="text-ink">{r.reason}</div>
          <code className="font-mono text-2xs break-all text-ink-3">{r.scope}</code>
          {r.extra}
        </li>
      ))}
    </ul>
  );
}

export function ScopesTopic({ data, headingId }: { data: HelpData; headingId: string }) {
  const { t } = useI18n();
  const s = t.help.scopes;
  const { member, optional, corporation } = data.scopes;
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Heading id={headingId}>{t.help.topics.scopes}</Heading>
        <p className="text-sm text-ink-2">{s.intro}</p>
        <Facts
          items={[
            s.facts.signIn,
            s.facts.readOnly,
            s.facts.perCharacter,
            s.facts.revoke((text) => <ExternalA href={EVE_AUTHORIZED_APPS_URL}>{text}</ExternalA>),
          ]}
        />
      </div>
      {/* Empty while every character scope is opt-in; the facts above say registering asks for nothing. */}
      {member.length > 0 && (
        <Section title={s.member.title}>
          <p className="text-xs text-ink-3">{s.member.body}</p>
          <ScopeList rows={member} />
        </Section>
      )}
      <Section title={s.optional.title}>
        <p className="text-xs text-ink-3">{s.optional.body}</p>
        <ul className="space-y-2">
          {optional.map((g) => (
            <li key={g.href} className="glass-inset rounded-lg px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-sm font-medium">{g.label}</span>
                {g.canManage && (
                  <Link href={g.href} className="inline-flex items-center gap-1 text-xs text-accent hover:underline" data-close-dialog>
                    {s.optional.manage} <ArrowRight className="size-3" aria-hidden />
                  </Link>
                )}
              </div>
              <ScopeList rows={g.scopes} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title={s.corporation.title}>
        <p className="text-xs text-ink-3">{s.corporation.body}</p>
        <ScopeList
          rows={corporation.map((c) => ({
            ...c,
            extra: c.corpRoles.length > 0 && (
              <div className="mt-0.5 text-2xs text-ink-3">{s.corporation.roles(c.corpRoles.map((r) => r.replaceAll("_", " ")).join(", "))}</div>
            ),
          }))}
        />
      </Section>
    </div>
  );
}

export function DataTopic({ data, headingId }: { data: HelpData; headingId: string }) {
  const { t } = useI18n();
  const d = t.help.data;
  const { instance } = data;
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Heading id={headingId}>{t.help.topics.data}</Heading>
        <p className="text-sm text-ink-2">{d.stored.body}</p>
      </div>
      <Section title={d.security.title}>
        <Facts items={[d.security.tokens, d.security.sessions(instance.retention.sessions), d.security.password, d.security.selfHosted]} />
      </Section>
      <Section title={d.private.title}>
        <p className="flex gap-2.5 rounded-lg bg-good/10 px-3 py-2 text-sm text-ink-2 ring-1 ring-good/25 ring-inset">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-good-text" aria-hidden />
          {d.private.body}
        </p>
      </Section>
      <Section title={d.visibility.title}>
        <p className="text-xs text-ink-3">{d.visibility.intro}</p>
        <ul className="divide-y divide-surface-contrast/[0.06] text-sm">
          {data.visibility.map((v) => (
            <li key={v.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              <span className="min-w-0 flex-1 text-ink-2">{d.visibility.rows[v.key]}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs">
                <MinRole role={v.minRole} />
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={d.delete.title}>
        <p className="text-sm text-ink-2">{d.delete.body}</p>
        <p className="text-sm text-ink-2">{d.retention(instance.retention)}</p>
      </Section>
      {instance.ai && (
        <p className="flex gap-2.5 rounded-lg bg-accent/8 px-3 py-2 text-sm text-ink-2 ring-1 ring-accent/20 ring-inset">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          {d.ai}
        </p>
      )}
    </div>
  );
}

export function AccessTopic({ data, headingId }: { data: HelpData; headingId: string }) {
  const { t } = useI18n();
  const a = t.help.access;
  const sections = data.access.reduce<{ section: string; rows: AccessRow[] }[]>((out, row) => {
    const last = out.at(-1);
    if (last?.section === row.section) last.rows.push(row);
    else out.push({ section: row.section, rows: [row] });
    return out;
  }, []);
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Heading id={headingId}>{t.help.topics.access}</Heading>
        <p className="flex flex-wrap items-center gap-1.5 text-sm">{a.you(<RoleBadge role={data.user.role} />)}</p>
        <p className="text-sm text-ink-2">{a.intro}</p>
      </div>
      <Section title={a.ladder}>
        <ol className="space-y-1">
          {ROLES.map((role) => (
            <li
              key={role}
              aria-current={role === data.user.role ? "true" : undefined}
              className={cn(
                "flex items-start gap-3 rounded-md px-2.5 py-1.5 text-sm",
                role === data.user.role && "bg-accent/8 ring-1 ring-accent/25 ring-inset",
              )}
            >
              <span className="w-24 shrink-0 pt-px">
                <RoleBadge role={role} />
              </span>
              <span className="text-ink-2">{t.common.roles[role].description}</span>
            </li>
          ))}
        </ol>
        {data.user.role === "guest" && (
          <p className="text-xs text-ink-3">
            {a.guest(data.instance.homeCorp, data.instance.autoApproveCorp, data.instance.autoApproveAlliance)}
          </p>
        )}
      </Section>
      <Section title={a.table.title}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs text-ink-3">
              <th scope="col" className="py-1.5 font-medium">
                {a.table.page}
              </th>
              <th scope="col" className="py-1.5 font-medium">
                {a.table.role}
              </th>
              <th scope="col" className="w-10 py-1.5 text-right font-medium">
                {a.table.you}
              </th>
            </tr>
          </thead>
          {sections.map(({ section, rows }) => (
            <tbody key={section} className="border-t border-surface-contrast/[0.08]">
              <tr>
                <th scope="rowgroup" colSpan={3} className="eve-label pt-2.5 pb-1 text-left text-3xs font-normal text-ink-3">
                  {section}
                </th>
              </tr>
              {rows.map((row) => (
                <tr key={row.href} className={row.allowed ? undefined : "text-ink-3"}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="py-1 pr-3">
                    {row.minRole === "guest" ? (
                      <span className="text-xs">{a.everyone}</span>
                    ) : row.minRole ? (
                      <RoleBadge role={row.minRole} />
                    ) : (
                      <span className="text-xs">{a.nobody}</span>
                    )}
                  </td>
                  <td className="py-1 text-right">
                    {row.allowed ? (
                      <Check className="ml-auto size-3.5 text-good-text" aria-label={a.table.yes} />
                    ) : (
                      <Minus className="ml-auto size-3.5" aria-label={a.table.no} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className="text-xs text-ink-3">
          {a.overrides}{" "}
          {data.user.canManageSettings && (
            <Link href="/admin/settings#permissions" className="text-accent hover:underline" data-close-dialog>
              {a.manage}
            </Link>
          )}
        </p>
      </Section>
    </div>
  );
}

export function WelcomeStep({ data, headingId }: { data: HelpData; headingId: string }) {
  const { t } = useI18n();
  const w = t.help.tour;
  return (
    <div className="space-y-4">
      <KeystarMark className="size-14" />
      <Heading id={headingId}>{w.hello(data.user.name)}</Heading>
      <p className="text-sm leading-relaxed text-ink-2">{w.body}</p>
      <div className="text-sm">
        <p className="flex flex-wrap items-center gap-1.5">{t.help.access.you(<RoleBadge role={data.user.role} />)}</p>
        <p className="mt-0.5 text-ink-3">{t.common.roles[data.user.role].description}</p>
      </div>
      <p className="text-sm text-ink-2">{w.reopen(<Kbd>?</Kbd>)}</p>
      {/* An existing account sees the tour once after the update that brought it, so admins also get its upgrade notes. */}
      {data.latest && data.latest.upgrades.length > 0 && (
        <UpgradeNotes upgrades={data.latest.upgrades} intro={w.upgrade(data.latest.version)} level={4} />
      )}
    </div>
  );
}

function NextStep({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="glass-inset flex gap-3 rounded-lg px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium">{title}</div>
        {children}
      </div>
    </li>
  );
}

export function StartStep({ data, headingId, onWhatsNew }: { data: HelpData; headingId: string; onWhatsNew: () => void }) {
  const { t } = useI18n();
  const s = t.help.tour.nextSteps;
  const optional = data.scopes.optional.filter((g) => g.canManage);
  const link = "inline-flex items-center gap-1 text-xs text-accent hover:underline";
  return (
    <div className="space-y-4">
      <Heading id={headingId}>{t.help.tour.start}</Heading>
      <p className="text-sm text-ink-2">{s.intro}</p>
      <ul className="space-y-2.5">
        {data.user.role === "guest" && (
          <NextStep icon={<Hourglass className="size-4" aria-hidden />} title={s.guest.title}>
            <p className="text-xs text-ink-2">{s.guest.body}</p>
          </NextStep>
        )}
        <NextStep icon={<UserRoundCheck className="size-4" aria-hidden />} title={s.characters.title}>
          <p className="text-xs text-ink-2">{s.characters.body}</p>
          <Link href="/characters" className={link} data-close-dialog>
            {t.shell.nav.characters} <ArrowRight className="size-3" aria-hidden />
          </Link>
        </NextStep>
        {optional.length > 0 && (
          <NextStep icon={<KeyRound className="size-4" aria-hidden />} title={s.optional.title}>
            <p className="text-xs text-ink-2">{s.optional.body}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {optional.map((g) => (
                <li key={g.href}>
                  <Link href={g.href} className={link} data-close-dialog>
                    {g.label} <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </NextStep>
        )}
        {data.user.canManageSettings && (
          <NextStep icon={<Lock className="size-4" aria-hidden />} title={s.admin.title}>
            <p className="text-xs text-ink-2">{s.admin.body}</p>
            <Link href="/admin/settings" className={link} data-close-dialog>
              {t.shell.nav.settings} <ArrowRight className="size-3" aria-hidden />
            </Link>
          </NextStep>
        )}
      </ul>
      <div className="flex flex-wrap gap-2">
        {data.latest && (
          <button type="button" onClick={onWhatsNew} className={buttonClass("glass", "sm")}>
            <Sparkles className="size-3.5" aria-hidden /> {t.help.whatsNew(data.latest.version)}
          </button>
        )}
        <Link href="/" className={buttonClass("glass", "sm")} data-close-dialog>
          {s.dashboard}
        </Link>
      </div>
    </div>
  );
}

