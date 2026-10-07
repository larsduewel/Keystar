import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { SearchField } from "@/components/ui/search-field";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { getMemberAuditPage, getMemberAuditStats } from "@/core/member-audit";
import {
  MEMBER_PAGE_SIZE,
  memberAuditHref,
  parseMemberAuditParams,
  type MemberAuditParams,
  type MemberFilter,
} from "@/core/member-audit-filters";
import { characterScopes, esiHealth } from "@/core/modules/registry";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.members.metaTitle };
}

/** Previous/next; at either end it is plain text, so it can't be focused or followed. */
function PageLink({ href, children }: { href: string | null; children: ReactNode }) {
  const className = "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs";
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(className, "opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className={className}>
      {children}
    </Link>
  );
}

export default async function MemberAuditPage({ searchParams }: PageProps<"/admin/members">) {
  await requirePermission("members.audit");
  const { t, f } = await getI18n();
  const tm = t.admin.members;
  const home = await getSetting("corp.homeCorporationId");
  if (!home) {
    return (
      <Glass className="mx-auto mt-10 max-w-xl">
        <EmptyState icon={ShieldCheck} title={tm.noHome.title}>
          {tm.noHome.body(t.shell.nav.settings)}
        </EmptyState>
      </Glass>
    );
  }

  const required = characterScopes();
  const requested = parseMemberAuditParams(await searchParams);
  const stats = await getMemberAuditStats(home, required, requested);
  const pages = Math.max(1, Math.ceil(stats.matched / MEMBER_PAGE_SIZE));
  // A shared link can outlive the page it pointed at; show the last one instead of an empty table.
  const params: MemberAuditParams = { ...requested, page: Math.min(requested.page, pages) };
  const rows = stats.matched ? await getMemberAuditPage(home, required, params) : [];
  const { rosterKnown } = stats;

  // Stat tiles toggle their filter; an empty one has nothing to filter to unless it is the one applied.
  const filterTile = (filter: Exclude<MemberFilter, "all">, count: number) => {
    const active = params.filter === filter;
    if (!count && !active) return {};
    return {
      href: memberAuditHref(params, { filter: active ? "all" : filter }),
      active,
      title: active ? tm.filter.showAll : tm.filter.onlyThese,
    };
  };
  const pageLink = (page: number) => memberAuditHref(params, { page });
  const filtered = params.filter !== "all" || params.q !== "" || params.account !== null;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.shell.navSections.admin}
          title={t.shell.nav.members}
          description={tm.description}
        />

        <div className="grid gap-4 md:grid-cols-4">
          <StatTile
            label={tm.stats.roster}
            value={rosterKnown ? f.integer(stats.roster) : "—"}
            hint={rosterKnown ? undefined : tm.stats.rosterHint}
            {...filterTile("roster", stats.roster)}
          />
          <StatTile
            label={tm.stats.registered}
            value={f.integer(stats.registered)}
            hint={rosterKnown && stats.roster ? tm.stats.ofRoster(f.percent(stats.registered / stats.roster, 0)) : undefined}
            {...filterTile("registered", stats.registered)}
          />
          <StatTile
            label={tm.stats.notRegistered}
            value={rosterKnown ? f.integer(stats.unregistered) : "—"}
            {...filterTile("unregistered", stats.unregistered)}
          />
          <StatTile
            label={tm.stats.missingEsi}
            value={f.integer(stats.esiTrouble)}
            {...filterTile("esi", stats.esiTrouble)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <Glass className="overflow-hidden xl:col-span-8">
            <div className="space-y-3 px-5 pt-4 pb-2">
              <SearchField
                value={params.q}
                keep={{
                  ...(params.filter === "all" ? {} : { filter: params.filter }),
                  ...(params.account ? { account: params.account } : {}),
                }}
                label={tm.search.label}
                placeholder={tm.search.placeholder}
                clearLabel={tm.search.clear}
              />
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-3">
                <span className="flex flex-wrap items-center gap-x-2">
                  {tm.results(
                    stats.matched,
                    params.filter === "all" ? null : tm.filter.labels[params.filter],
                    params.q || null,
                    params.account ? tm.ofAccount(stats.accountName) : null,
                  )}
                  {filtered && (
                    <>
                      <span aria-hidden>·</span>
                      <Link href={memberAuditHref(params, { q: "", filter: "all", account: null })} scroll={false} className="text-accent hover:underline">
                        {tm.clearAll}
                      </Link>
                    </>
                  )}
                </span>
                {pages > 1 && <span>{tm.pageOf(params.page, pages)}</span>}
              </div>
            </div>
            <PendingFrame className="overflow-x-auto px-2 pb-2">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{tm.columns.character}</th>
                    <th>{tm.columns.status}</th>
                    <th>{tm.columns.account}</th>
                    <th>{tm.columns.esi}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-ink-3">
                        {tm.empty}
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => {
                    const missing = required.filter((s) => !r.scopes.includes(s));
                    const health = esiHealth(r, required);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Portrait id={Number(r.id)} size={28} />
                            <span className="font-medium">{r.name ?? tm.characterFallback(r.id)}</span>
                          </div>
                        </td>
                        <td>
                          {!r.registered ? (
                            <StatusBadge status="warning" label={tm.status.notRegistered} />
                          ) : rosterKnown && !r.inRoster ? (
                            <Badge>{tm.status.notInRoster}</Badge>
                          ) : (
                            <StatusBadge status="ok" label={tm.status.registered} />
                          )}
                        </td>
                        <td className="text-ink-2">{r.mainName ?? "—"}</td>
                        <td>
                          {!r.registered ? (
                            <span className="text-ink-3">—</span>
                          ) : health === "revoked" ? (
                            <StatusBadge status="error" label={tm.esi.tokenRevoked} />
                          ) : health === "missing" ? (
                            <StatusBadge status="warning" label={r.status ? tm.esi.missing(missing.length) : tm.esi.noToken} />
                          ) : health === "none" ? (
                            // Nothing granted is fine: every ESI scope is opt-in.
                            <Badge>{tm.esi.noToken}</Badge>
                          ) : (
                            <StatusBadge status="ok" label={tm.esi.complete} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </PendingFrame>
            {pages > 1 && (
              <nav className="flex items-center justify-end gap-2 border-t border-surface-contrast/6 px-5 py-3" aria-label={tm.pagination}>
                <PageLink href={params.page > 1 ? pageLink(params.page - 1) : null}>
                  <ChevronLeft className="size-4" aria-hidden /> {tm.previous}
                </PageLink>
                <PageLink href={params.page < pages ? pageLink(params.page + 1) : null}>
                  {tm.next} <ChevronRight className="size-4" aria-hidden />
                </PageLink>
              </nav>
            )}
          </Glass>
          <div className="space-y-4 xl:col-span-4">
            <Panel title={tm.request.title} subtitle={tm.request.subtitle}>
              <CopyField value={`${env().APP_URL}/join`} />
              <p className="mt-3 text-xs text-ink-2">{tm.request.body(t.shell.nav.characters)}</p>
            </Panel>
            {!rosterKnown && (
              <Panel title={tm.rosterUnavailable.title} subtitle={tm.rosterUnavailable.subtitle}>
                <p className="text-xs text-ink-2">
                  {tm.rosterUnavailable.body(<code>esi-corporations.read_corporation_membership.v1</code>, t.shell.nav.characters)}
                </p>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </PendingProvider>
  );
}
