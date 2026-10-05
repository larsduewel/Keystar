import { sql } from "drizzle-orm";
import { ArrowRight, Ban, UserCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, RoleBadge, StatusBadge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { outsideGuestIds } from "@/core/auth/manage-users";
import { getDb } from "@/core/db";
import { memberAuditHref } from "@/core/member-audit-filters";
import { characterScopes } from "@/core/modules/registry";
import { getSettings } from "@/core/settings";
import { assignableRoles, canManageRole, isRole, ROLES, type Role } from "@/core/rbac/roles";
import { getI18n } from "@/i18n/server";
import { zkillCharacter } from "@/modules/killboard/links";
import { approveUser, disableOutsideGuests, setUserDisabled } from "../actions";
import { RoleSelect } from "./role-select";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.users.metaTitle };
}

interface UserRow {
  id: string;
  role: Role;
  is_disabled: boolean;
  last_login_at: string | null;
  created_at: string;
  main_id: string | null;
  main_name: string | null;
  corp_ticker: string | null;
  characters: { id: number; name: string; corporation_id: number | null; status: string | null; scopes: string[] | null }[];
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const actor = await requirePermission("users.view");
  const { t, f } = await getI18n();
  const tu = t.admin.users;
  const canManage = actor.can("users.manage");
  const canAudit = actor.can("members.audit");
  const roleParam = (await searchParams).role;
  const roleFilter = isRole(roleParam) ? roleParam : null;
  const required = characterScopes();
  const settings = await getSettings();
  const home = settings["corp.homeCorporationId"];
  // Once sign-ups are restricted to members, guests who registered from outside before can be cleared in one go.
  const outsideGuests = canManage && settings["access.restrictToMembers"] ? (await outsideGuestIds()).length : 0;

  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT u.id, u.role, u.is_disabled, u.last_login_at, u.created_at,
           mc.character_id::text AS main_id, mc.name AS main_name, co.ticker AS corp_ticker,
           COALESCE(json_agg(json_build_object('id', c.character_id, 'name', c.name, 'corporation_id', c.corporation_id,
             'status', t.status, 'scopes', t.scopes)
             ORDER BY c.name) FILTER (WHERE c.character_id IS NOT NULL), '[]') AS characters
    FROM users u
    LEFT JOIN characters mc ON mc.character_id = u.main_character_id
    LEFT JOIN eve_corporations co ON co.corporation_id = mc.corporation_id
    LEFT JOIN characters c ON c.user_id = u.id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    GROUP BY u.id, mc.character_id, mc.name, co.ticker
    ORDER BY (u.role = 'guest') DESC, u.last_login_at DESC NULLS LAST`);
  const users = rows as unknown as UserRow[];
  const pending = users.filter((u) => u.role === "guest" && !u.is_disabled);
  const assignable = assignableRoles(actor.role);
  // Role cards filter the table; counts and the approval queue always cover everyone.
  const shown = roleFilter ? users.filter((u) => u.role === roleFilter) : users;
  const manageable = (u: UserRow) => canManage && u.id !== actor.id && canManageRole(actor.role, u.role);
  const showActions = shown.some(manageable);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.shell.navSections.admin}
        title={t.shell.nav.users}
        description={tu.description}
        actions={
          actor.can("app.settings.manage") ? (
            <ButtonLink href="/admin/settings#permissions" size="sm">
              {tu.rolePermissions} <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[...ROLES].reverse().map((r) => {
          const count = users.filter((u) => u.role === r).length;
          const active = roleFilter === r;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <RoleBadge role={r} />
                <span className="text-lg font-semibold tabular-nums">{f.integer(count)}</span>
              </div>
              <p className="mt-2 text-2xs leading-snug text-ink-3">{t.common.roles[r].description}</p>
            </>
          );
          // An empty role has nothing to filter to.
          if (!count && !active) {
            return (
              <Glass key={r} className="px-4 py-3.5 opacity-60">
                {body}
              </Glass>
            );
          }
          return (
            <Glass
              key={r}
              as={Link}
              href={active ? "/admin/users" : `/admin/users?role=${r}`}
              scroll={false}
              aria-current={active ? "true" : undefined}
              title={active ? tu.filter.allUsers : tu.filter.onlyRole}
              className="glass-link px-4 py-3.5"
            >
              {body}
            </Glass>
          );
        })}
      </div>

      {outsideGuests > 0 && (
        <Panel title={tu.outsideGuests.title(outsideGuests)} subtitle={tu.outsideGuests.hint}>
          <ActionForm
            action={disableOutsideGuests}
            confirm={tu.outsideGuests.confirm(outsideGuests)}
            success={tu.outsideGuests.done}
            failed={tu.outsideGuests.failed}
            errors={tu.outsideGuests.errors}
          >
            <Button size="sm" variant="danger" type="submit">
              <Ban className="size-3.5" aria-hidden /> {tu.outsideGuests.disable}
            </Button>
          </ActionForm>
        </Panel>
      )}

      {pending.length > 0 && canManage && (
        <Panel title={tu.awaitingApproval(pending.length)} subtitle={tu.awaitingApprovalHint}>
          <ul className="divide-y divide-surface-contrast/6">
            {pending.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                {u.main_id && <Portrait id={Number(u.main_id)} size={32} />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{u.main_name ?? tu.unknown}</div>
                  <div className="text-xs text-ink-3">
                    {u.corp_ticker ? `[${u.corp_ticker}] · ` : ""}
                    {tu.registered(f.relativeTime(u.created_at))}
                  </div>
                </div>
                <ActionForm
                  action={approveUser.bind(null, u.id)}
                  success={tu.access.approved(u.main_name ?? tu.unknown)}
                  failed={tu.access.failed(u.main_name ?? tu.unknown)}
                  errors={tu.access.errors}
                >
                  <Button size="sm" variant="primary" type="submit">
                    <UserCheck className="size-3.5" aria-hidden /> {tu.approve}
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {roleFilter && (
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <span>{tu.filter.showing(shown.length, t.common.roles[roleFilter].label)}</span>
          <span className="text-ink-3">·</span>
          <Link href="/admin/users" scroll={false} className="text-accent hover:underline">
            {tu.filter.showAll}
          </Link>
        </div>
      )}

      <Glass className="overflow-hidden">
        <div className="overflow-x-auto px-2 py-2">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{tu.columns.pilot}</th>
                <th>{tu.columns.characters}</th>
                <th>{tu.columns.esiHealth}</th>
                <th>{tu.columns.lastLogin}</th>
                <th>{tu.columns.role}</th>
                {showActions && <th className="text-right">{tu.columns.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={showActions ? 6 : 5} className="py-6 text-center text-ink-3">
                    {tu.filter.empty}
                  </td>
                </tr>
              )}
              {shown.map((u) => {
                const tokenProblem = (c: UserRow["characters"][number]) =>
                  c.status === "invalid" || !c.scopes || required.some((s) => !c.scopes!.includes(s));
                const invalid = u.characters.filter((c) => c.status === "invalid").length;
                const missing = u.characters.filter((c) => !c.scopes || required.some((s) => !c.scopes!.includes(s))).length;
                // The member audit only lists home corporation characters.
                const auditable = home !== null && u.characters.some((c) => c.corporation_id === home && tokenProblem(c));
                const own = u.id === actor.id;
                const canChange = manageable(u);
                const tokenTrouble = !u.is_disabled && (invalid > 0 || missing > 0);
                // Where a token problem gets fixed: your own characters page, or the member audit for others.
                const fixHref = !tokenTrouble
                  ? null
                  : own
                    ? "/characters"
                    : canAudit && auditable
                      ? memberAuditHref(undefined, { filter: "esi", account: u.id })
                      : null;
                const health = u.is_disabled ? (
                  <StatusBadge status="error" label={tu.health.disabled} />
                ) : invalid ? (
                  <StatusBadge status="error" label={tu.health.revoked(invalid)} />
                ) : missing ? (
                  <StatusBadge status="warning" label={tu.health.missingScopes(missing)} />
                ) : (
                  <StatusBadge status="ok" label={tu.health.allGood} />
                );
                return (
                  <tr key={u.id} className={u.is_disabled ? "opacity-50" : undefined}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        {u.main_id && <Portrait id={Number(u.main_id)} size={30} />}
                        <div className="leading-tight">
                          <div className="font-medium">
                            {u.main_name ?? tu.unknown} {own && <span className="text-xs text-ink-3">{tu.you}</span>}
                          </div>
                          <div className="text-2xs text-ink-3">{u.corp_ticker ? `[${u.corp_ticker}]` : "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex max-w-[340px] flex-wrap gap-1">
                        {u.characters.map((c) => (
                          <a
                            key={c.id}
                            href={zkillCharacter(c.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={tu.zkill(c.name)}
                            className="rounded-full transition hover:brightness-150"
                          >
                            <Badge tone={c.status === "invalid" ? "critical" : "neutral"}>{c.name}</Badge>
                          </a>
                        ))}
                      </div>
                    </td>
                    <td>
                      {fixHref ? (
                        <Link
                          href={fixHref}
                          title={own ? tu.health.fixOwn : tu.health.openAudit}
                          className="inline-flex rounded-full transition hover:brightness-150"
                        >
                          {health}
                        </Link>
                      ) : (
                        health
                      )}
                    </td>
                    <td className="text-ink-2">{f.relativeTime(u.last_login_at)}</td>
                    <td>
                      {canChange ? (
                        <RoleSelect
                          userId={u.id}
                          userName={u.main_name}
                          role={u.role}
                          options={ROLES.filter((r) => assignable.includes(r) || r === u.role).map((r) => ({
                            role: r,
                            assignable: assignable.includes(r),
                          }))}
                        />
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </td>
                    {showActions && (
                      <td className="text-right">
                        {canChange ? (
                          <ActionForm
                            action={setUserDisabled.bind(null, u.id, !u.is_disabled)}
                            success={(u.is_disabled ? tu.access.enabled : tu.access.disabled)(u.main_name ?? tu.unknown)}
                            failed={tu.access.failed(u.main_name ?? tu.unknown)}
                            errors={tu.access.errors}
                          >
                            <Button size="sm" variant={u.is_disabled ? "glass" : "danger"} type="submit">
                              <Ban className="size-3.5" aria-hidden /> {u.is_disabled ? tu.enable : tu.disable}
                            </Button>
                          </ActionForm>
                        ) : (
                          <span
                            className="text-ink-3"
                            title={own ? tu.noAction.self : tu.noAction.higher}
                          >
                            —
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Glass>
    </div>
  );
}
