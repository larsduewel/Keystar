import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { zkillCharacter } from "@/modules/killboard/links";
import { claudeConfigured, latestNote } from "@/modules/intel/ai/generate";
import { WriteDossierButton } from "@/modules/intel/components/ai-buttons";
import { DossierPanel } from "@/modules/intel/components/briefing-panel";
import { EngagementList } from "@/modules/intel/components/engagements";
import { ActivityHeatmap } from "@/modules/intel/components/heatmap";
import { LastSeen, LatestKills } from "@/modules/intel/components/latest-kills";
import { HistoryChip } from "@/modules/intel/components/pilot-row";
import { DimensionBreakdown, ScoreBadge, TagList } from "@/modules/intel/components/score";
import { StandingBadge } from "@/modules/intel/components/standing-badge";
import { encountersWithUs, engagementsWithUs } from "@/modules/intel/history";
import { hullClass } from "@/modules/intel/hulls";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { lookupDisplayNames, scanEntityIds } from "@/modules/intel/names";
import { getScan, getScanPilots } from "@/modules/intel/scans";
import { loadStandings, standingOf } from "@/modules/intel/standings";
import type { PilotProfile, PilotScore } from "@/modules/intel/types";
import { writeDossier } from "../../../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.intel.pilotPage.metaTitle };
}

export default async function PilotPage({ params }: PageProps<"/intel/[id]/pilot/[characterId]">) {
  const user = await requirePermission(INTEL_PERMISSIONS.use);
  const { t, f } = await getI18n();
  const text = t.intel.pilotPage;
  const { id, characterId: raw } = await params;
  const characterId = Number(raw);
  if (!SHARE_ID_PATTERN.test(id) || !Number.isSafeInteger(characterId) || characterId <= 0) notFound();
  const scan = await getScan(id);
  if (!scan) notFound();
  const [pilot] = await getScanPilots(id, { characterId });
  if (!pilot) notFound();

  const [standings, settings, scanPilots, dossier] = await Promise.all([
    loadStandings(),
    getSettings(),
    getScanPilots(id),
    latestNote({ kind: "dossier", scanId: id, characterId }),
  ]);
  const canAi = user.can(INTEL_PERMISSIONS.ai);
  const standing = standingOf(pilot, standings);
  const profile = (pilot.profile as PilotProfile | null) ?? null;
  const score = (pilot.scoreDetail as PilotScore | null) ?? null;
  const home = settings["corp.homeCorporationId"];
  const engagements = home
    ? await engagementsWithUs(home, await encountersWithUs(home, [characterId]), [characterId], { limit: 10 })
    : [];
  const ids = scanEntityIds([pilot.history], engagements);
  const names = await lookupDisplayNames({
    typeIds: [
      ...ids.typeIds,
      ...(profile?.hulls.map((h) => h.shipTypeId) ?? []),
      ...(profile?.recent.latest.flatMap((e) => [e.shipTypeId, e.otherShipTypeId]) ?? []),
    ],
    systemIds: [...(profile?.recent.latest.map((e) => e.systemId) ?? []), ...(profile?.systems.map((x) => x.systemId) ?? []), ...engagements.map((e) => e.systemId)],
    entityIds: [...ids.entityIds, pilot.allianceId, ...(profile?.associates.slice(0, 12).map((a) => a.characterId) ?? []), ...(pilot.corpHistory?.map((c) => c.corporationId) ?? [])],
    corporationIds: [...ids.corporationIds, pilot.corporationId, ...(pilot.corpHistory?.map((c) => c.corporationId) ?? [])],
  });
  const pilotNames = new Map(scanPilots.map((p) => [p.characterId, p.name]));
  const associateName = (cid: number) => pilotNames.get(cid) ?? names.entities.get(cid) ?? text.pilot(cid);
  const r = profile?.recent;
  const lifetime = profile?.lifetime;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.intel.index.title}
        title={pilot.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {pilot.corporationTicker && <span>[{pilot.corporationTicker}]</span>}
            {pilot.corporationName ?? t.intel.pilot.unknownCorporation}
            {pilot.allianceId && <span>· {pilot.allianceName ?? t.intel.pilot.alliance(pilot.allianceId)}</span>}
            <StandingBadge standing={standing} />
            <HistoryChip history={pilot.history} />
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/intel/${id}`} size="sm">
              <ArrowLeft className="size-4" aria-hidden /> {text.back}
            </ButtonLink>
            <ButtonLink href={`https://zkillboard.com/character/${characterId}/`} size="sm" target="_blank" rel="noopener noreferrer">
              zKillboard <ExternalLink className="size-3.5" aria-hidden />
            </ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Portrait id={characterId} size={72} />
        <ScoreBadge score={score} />
        {score && <TagList tags={score.tags} />}
        {profile && <LastSeen profile={profile} names={names} />}
      </div>

      {profile && (
        <DossierPanel
          note={dossier}
          claudeHint={!canAi ? t.intel.notes.dossierNotAllowed : claudeConfigured() ? null : t.intel.notes.dossierTemplateHint}
          actions={canAi ? <WriteDossierButton action={writeDossier.bind(null, id, characterId)} again={!!dossier} /> : undefined}
        />
      )}

      {!profile && <p className="text-sm text-ink-3">{text.noData(pilot.profiled)}</p>}

      {profile && r && (
        <>
          <Panel title={t.intel.pilot.latestTitle} subtitle={text.latestSubtitle}>
            {r.latest.length ? (
              <LatestKills events={r.latest} names={names} limit={10} />
            ) : (
              <p className="text-sm text-ink-3">{profile.depth === "deep" ? text.noKillmails : text.loading}</p>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label={text.kills7d} value={f.integer(r.kills7d)} hint={profile.depth === "deep" ? text.kills30d(r.kills30d) : "zKillboard"} />
            <StatTile label={text.losses30d} value={f.integer(r.losses30d)} hint={text.losses7d(r.losses7d)} />
            <StatTile
              label={text.lastKill}
              value={r.lastKillAt ? f.relativeTime(r.lastKillAt) : "—"}
              hint={lifetime?.lastActiveMonth ? text.lastActiveMonth(lifetime.lastActiveMonth) : undefined}
            />
            <StatTile
              label={text.character}
              value={profile.character.ageDays !== null ? text.age(profile.character.ageDays) : "—"}
              hint={profile.character.securityStatus !== null ? text.security(profile.character.securityStatus) : undefined}
            />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Panel title={text.ships} subtitle={text.shipsSubtitle}>
              <ul className="space-y-1.5">
                {profile.hulls.slice(0, 10).map((h) => (
                  <li key={h.shipTypeId} className="flex items-center gap-2 text-sm">
                    <TypeIcon id={h.shipTypeId} size={24} className="rounded" />
                    <span className="min-w-0 flex-1 truncate">{names.types.get(h.shipTypeId)?.name ?? text.type(h.shipTypeId)}</span>
                    <span className="text-xs text-ink-3">{t.intel.hullClasses[hullClass(h.groupId)]}</span>
                    <span className="w-24 text-right text-xs text-ink-3">{h.lastAt ? f.relativeTime(h.lastAt) : `${f.integer(h.count)}×`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t.intel.pilot.whyTitle}>
              {score ? <DimensionBreakdown dimensions={score.dimensions} recencyGate={score.recencyGate} columns={1} /> : <p className="text-sm text-ink-3">{text.notScored}</p>}
            </Panel>
          </div>

          <Panel title={text.whenTitle} subtitle={profile.timezone.zone ? text.mostlyZone(profile.timezone.zone) : undefined}>
            <ActivityHeatmap heat={profile.timezone.heat} peakHours={profile.timezone.peakHours} />
          </Panel>
        </>
      )}

      {engagements.length > 0 && (
        <Panel title={text.fightsTitle} subtitle={text.fightsSubtitle}>
          <EngagementList engagements={engagements} names={names} pilotNames={pilotNames} />
        </Panel>
      )}

      {profile && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel title={text.fliesWithTitle} subtitle={text.fliesWithSubtitle}>
            {profile.associates.length ? (
              <ul className="space-y-1">
                {profile.associates.slice(0, 12).map((a) => (
                  <li key={a.characterId} className="flex items-center gap-2 text-sm">
                    <Portrait id={a.characterId} size={22} />
                    <a href={zkillCharacter(a.characterId)} target="_blank" rel="noopener noreferrer" className={pilotNames.has(a.characterId) ? "font-semibold text-ink hover:text-accent" : "text-ink-2 hover:text-accent"}>
                      {associateName(a.characterId)}
                    </a>
                    <span className="ml-auto text-xs text-ink-3 tabular-nums">{text.shared(a.sharedKills)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">{text.noWingmen}</p>
            )}
          </Panel>
          <Panel title={text.corpHistoryTitle}>
            {pilot.corpHistory?.length ? (
              <ul className="space-y-1 text-sm">
                {pilot.corpHistory.slice(0, 10).map((c) => (
                  <li key={`${c.corporationId}-${c.startDate}`} className="flex justify-between gap-3">
                    <span className="truncate text-ink-2">{names.entities.get(c.corporationId) ?? t.intel.pilot.corporation(c.corporationId)}</span>
                    <span className="text-xs text-ink-3">{text.since(f.date(c.startDate))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">{text.notLoaded}</p>
            )}
          </Panel>
        </div>
      )}

      {lifetime && (
        <Panel title={text.lifetimeTitle}>
          <p className="text-sm text-ink-2">
            {text.lifetime({
              kills: lifetime.kills,
              losses: lifetime.losses,
              iskDestroyed: lifetime.iskDestroyed,
              iskLost: lifetime.iskLost,
              danger: lifetime.dangerRatio,
              solo: lifetime.soloRatio,
              gang: lifetime.avgGangSize,
            })}
          </p>
        </Panel>
      )}
    </div>
  );
}
