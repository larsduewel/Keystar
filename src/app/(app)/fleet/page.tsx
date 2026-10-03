import { inArray } from "drizzle-orm";
import { KeyRound, Radar } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { StatusBadge } from "@/components/ui/badge";
import { requirePermission } from "@/core/auth/dal";
import { esiTokens, getDb } from "@/core/db";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { getI18n } from "@/i18n/server";
import { AutoRefresh } from "@/modules/fleet/components/auto-refresh";
import { LiveFleet } from "@/modules/fleet/components/live-fleet";
import { FLEET_SCOPE } from "@/modules/fleet/logic";
import { FLEET_PERMISSIONS } from "@/modules/fleet/module";
import { getFleetMembers, getLiveFleets, getPastFleets, getTrackers } from "@/modules/fleet/queries";
import { startFleetTracking, stopFleetTracking } from "./actions";

/** Matches the worker's poll interval (FLEET_POLL_SECONDS in the fleet jobs). */
const REFRESH_SECONDS = 15;
const RETURN_TO = "/fleet";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.fleet.page.metaTitle };
}

export default async function FleetPage() {
  const user = await requirePermission(FLEET_PERMISSIONS.view);
  const { t, f } = await getI18n();
  const tf = t.fleet;
  const now = new Date();
  const canTrack = user.can(FLEET_PERMISSIONS.track);
  const demo = env().KEYSTAR_DEMO_MODE;

  const [live, past, trackers, tokens] = await Promise.all([
    getLiveFleets(now),
    getPastFleets(20, now),
    canTrack ? getTrackers(user.characterIds) : [],
    canTrack && user.characterIds.length
      ? getDb()
          .select({ characterId: esiTokens.characterId, scopes: esiTokens.scopes })
          .from(esiTokens)
          .where(inArray(esiTokens.characterId, user.characterIds))
      : [],
  ]);
  const [liveMembers, pastMembers] = await Promise.all([
    getFleetMembers(live.map((l) => l.fleetId)),
    getFleetMembers(past.map((p) => p.fleetId)),
  ]);
  const trackerOf = new Map(trackers.map((tr) => [tr.characterId, tr]));
  const scopesOf = new Map(tokens.map((tk) => [tk.characterId, tk.scopes]));
  const polling = trackers.some((tr) => tr.status === "tracking" || tr.status === "not_boss");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tf.page.eyebrow}
        title={tf.page.metaTitle}
        description={tf.page.description}
        actions={live.length > 0 || polling ? <span className="text-xs text-ink-3">{tf.page.autoRefresh(REFRESH_SECONDS)}</span> : undefined}
      />
      {(live.length > 0 || polling) && <AutoRefresh seconds={REFRESH_SECONDS} />}

      {canTrack && (
        <Panel title={tf.tracking.title} subtitle={tf.tracking.subtitle}>
          {user.characters.length === 0 ? (
            <p className="text-sm text-ink-3">{tf.tracking.noCharacters}</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {user.characters.map((c) => {
                const tracker = trackerOf.get(c.characterId);
                const granted = scopesOf.get(c.characterId) ?? [];
                const hasScope = granted.includes(FLEET_SCOPE);
                const active = tracker?.status === "tracking" || tracker?.status === "not_boss";
                const status = !tracker ? "idle" : tracker.status === "tracking" && !tracker.checkedAt ? "waiting" : tracker.status;
                const tone =
                  status === "tracking" ? "ok" : status === "not_boss" ? "warning" : status === "waiting" ? "running" : "pending";
                return (
                  <li key={c.characterId} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Portrait id={c.characterId} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                    {!hasScope ? (
                      demo ? (
                        <Button size="sm" variant="ghost" disabled title={tf.tracking.demo}>
                          <KeyRound className="size-3.5" aria-hidden /> {tf.tracking.enable}
                        </Button>
                      ) : (
                        <ButtonLink
                          href={reauthorizeHref(granted, { add: [FLEET_SCOPE], returnTo: RETURN_TO })}
                          size="sm"
                          variant="primary"
                          title={tf.tracking.enableHint}
                        >
                          <KeyRound className="size-3.5" aria-hidden /> {tf.tracking.enable}
                        </ButtonLink>
                      )
                    ) : (
                      <>
                        <StatusBadge status={tone} label={tf.tracking.status[status]} />
                        {active && tracker?.checkedAt && (
                          <span className="text-xs text-ink-3">{tf.tracking.checked(f.relativeTime(tracker.checkedAt, now))}</span>
                        )}
                        {active ? (
                          <form action={stopFleetTracking.bind(null, c.characterId)}>
                            <Button size="sm" variant="ghost">
                              {tf.tracking.stop}
                            </Button>
                          </form>
                        ) : (
                          <>
                            <form action={startFleetTracking.bind(null, c.characterId)}>
                              <Button size="sm" variant="primary">
                                {tf.tracking.start}
                              </Button>
                            </form>
                            {!demo && (
                              <ButtonLink
                                href={reauthorizeHref(granted, { remove: [FLEET_SCOPE], returnTo: RETURN_TO })}
                                size="sm"
                                variant="ghost"
                                title={tf.tracking.revokeHint}
                              >
                                {tf.tracking.revoke}
                              </ButtonLink>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {live.length === 0 ? (
        <Glass>
          <EmptyState icon={Radar} title={tf.live.empty.title}>
            {tf.live.empty.body}
          </EmptyState>
        </Glass>
      ) : (
        live.map((fl) => (
          <LiveFleet key={fl.fleetId} fleet={fl} members={liveMembers.filter((m) => m.fleetId === fl.fleetId)} now={now} />
        ))
      )}

      <Panel title={tf.history.title} subtitle={tf.history.subtitle}>
        {past.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">{tf.history.empty}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {past.map((p) => {
              const end = p.endedAt ?? p.lastSeenAt;
              const pilots = pastMembers.filter((m) => m.fleetId === p.fleetId);
              return (
                <li key={p.fleetId}>
                  <details className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                      <span className="w-40 shrink-0 tabular-nums text-ink-2">{f.dateTime(p.startedAt)}</span>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Portrait id={p.bossCharacterId} size={22} />
                        <span className="truncate">{p.bossName ?? tf.fallback.character(p.bossCharacterId)}</span>
                      </span>
                      <span className="text-ink-3">
                        {tf.duration(Math.max(0, (end.getTime() - p.startedAt.getTime()) / 60_000))}
                      </span>
                      <span className="w-24 text-right text-ink-2">{tf.history.participants(p.participants)}</span>
                    </summary>
                    <ul className="grid gap-x-6 gap-y-1.5 pb-3 pl-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                      {pilots.map((m) => (
                        <li key={m.characterId} className="flex items-center gap-2">
                          <Portrait id={m.characterId} size={20} />
                          <span className="min-w-0 truncate">{m.name ?? tf.fallback.character(m.characterId)}</span>
                          <TypeIcon id={m.shipTypeId} size={18} className="ml-auto" />
                          <span className="truncate text-xs text-ink-3">{m.shipName ?? tf.fallback.type(m.shipTypeId)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
