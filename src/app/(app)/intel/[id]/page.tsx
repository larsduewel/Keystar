import { ArrowLeft, History, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { Panel } from "@/components/ui/glass";
import { SituationPanel } from "@/modules/intel/components/situation";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { getI18n } from "@/i18n/server";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { claudeConfigured, latestNote } from "@/modules/intel/ai/generate";
import { DscanDropdown, DscanForm, ReadDscanButton } from "@/modules/intel/components/dscan-form";
import { DscanPanel } from "@/modules/intel/components/dscan-panel";
import { matchDscan } from "@/modules/intel/dscan";
import { BriefingControl } from "@/modules/intel/components/briefing-control";
import { BriefingPanel } from "@/modules/intel/components/briefing-panel";
import { EngagementList } from "@/modules/intel/components/engagements";
import { GroupSummaryPanel } from "@/modules/intel/components/group-summary";
import { PilotRow } from "@/modules/intel/components/pilot-row";
import { ScanProgressPoller } from "@/modules/intel/components/scan-progress";
import { DeleteScanButton, ProfileRemainingButton } from "@/modules/intel/components/scan-buttons";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { getScan, scanProgress } from "@/modules/intel/scans";
import { isFriendly } from "@/modules/intel/standings";
import { loadScanView } from "@/modules/intel/view";
import { deleteScan, profileScanPilots, readDscan, rewriteBriefing, setDscan } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.intel.scan.metaTitle };
}

export default async function ScanPage({ params }: PageProps<"/intel/[id]">) {
  const user = await requirePermission(INTEL_PERMISSIONS.use);
  const { t, f } = await getI18n();
  const text = t.intel.scan;
  const { id } = await params;
  if (!SHARE_ID_PATTERN.test(id)) notFound();
  const scan = await getScan(id);
  if (!scan) notFound();

  const [view, progress, briefing, dscanRead] = await Promise.all([
    loadScanView(scan),
    scanProgress(scan),
    latestNote({ kind: "briefing", scanId: scan.id }),
    latestNote({ kind: "dscan", scanId: scan.id, since: scan.dscanAt }),
  ]);
  const { home, pilots, rows, engagements, names, summary, totals, pilotNames, system } = view;
  const friendly = rows.filter((r) => isFriendly(r.standing));
  const others = rows.filter((r) => !isFriendly(r.standing));
  const unprofiled = pilots.filter((p) => !p.profiled).length;
  const dscanRows = scan.dscan
    ? matchDscan(
        scan.dscan,
        rows.map((r) => ({ characterId: r.pilot.characterId, name: r.pilot.name, standing: r.standing, profile: r.profile })),
        scan.updatedAt,
      )
    : null;
  const canDelete = scan.createdBy === user.id || user.can(INTEL_PERMISSIONS.manage);
  const canAi = user.can(INTEL_PERMISSIONS.ai);
  const claudeHint = !claudeConfigured() && user.can(INTEL_PERMISSIONS.manage) ? text.templateHint : null;

  const dscanPanel = (
    <DscanPanel
      rows={dscanRows}
      read={dscanRead}
      pilotNames={pilotNames}
      form={<DscanForm scanId={scan.id} action={setDscan} replace={!!scan.dscan} />}
      actions={canAi && dscanRows?.length ? <ReadDscanButton scanId={scan.id} action={readDscan} claude={claudeConfigured()} /> : undefined}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.intel.index.title}
        title={text.title(scan.pilotCount, system?.name ?? null)}
        description={text.description(f.relativeTime(scan.createdAt), f.dateTime(scan.createdAt), scan.createdByName)}
        actions={
          <>
            <ButtonLink href="/intel" size="sm">
              <ArrowLeft className="size-4" aria-hidden /> {text.newScan}
            </ButtonLink>
            {(scan.status === "ready" || briefing || scan.briefingStatus === "pending") && <BriefingControl scanId={scan.id} action={canAi && scan.status === "ready" ? rewriteBriefing : undefined}>
              <BriefingPanel note={briefing} pending={scan.briefingStatus === "pending"} scanId={scan.id} pilotNames={pilotNames} claudeHint={claudeHint} />
            </BriefingControl>}
            <DscanDropdown supplied={!!scan.dscan}>{dscanPanel}</DscanDropdown>
            {canDelete && <DeleteScanButton scanId={scan.id} action={deleteScan} />}
          </>
        }
      />

      <ScanProgressPoller scanId={scan.id} initial={progress}>
        <SituationPanel view={view} scannedAt={scan.createdAt} dscanAt={scan.dscanAt} />

      {summary.hostiles > 0 && (
        <Panel title={text.groupTitle} subtitle={text.nonFriendly(summary.hostiles)}>
          <GroupSummaryPanel summary={summary} names={names} pilotNames={pilotNames} />
        </Panel>
      )}

      {scan.unresolved.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {text.notCharacters(scan.unresolved.slice(0, 20).join(", "), scan.unresolved.length - 20)}
        </p>
      )}

      <Panel
        title={text.pilotsTitle}
        subtitle={others.length ? undefined : text.allFriendly}
        actions={unprofiled > 0 ? <ProfileRemainingButton scanId={scan.id} count={unprofiled} action={profileScanPilots} /> : undefined}
      >
        <div className="grid auto-rows-fr items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {others.map((r) => (
            <PilotRow
              key={r.pilot.characterId}
              pilot={r.pilot}
              standing={r.standing}
              names={names}
              pilotNames={pilotNames}
              scanId={scan.id}
            />
          ))}
        </div>
        {friendly.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">{text.friendlyPilots(friendly.length)}</summary>
            <div className="mt-2 grid auto-rows-fr items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {friendly.map((r) => (
                <PilotRow
                  key={r.pilot.characterId}
                  pilot={r.pilot}
                  standing={r.standing}
                  names={names}
                  pilotNames={pilotNames}
                  scanId={scan.id}
                />
              ))}
            </div>
          </details>
        )}
      </Panel>

      {home && engagements.length > 0 && (
        <Panel
          title={text.historyTitle}
          subtitle={text.historySubtitle({
            pilots: totals.pilots,
            engagements: totals.engagements,
            ourKills: totals.ourKills,
            iskKilled: f.compact(totals.iskKilled),
            ourLosses: totals.ourLosses,
            iskLost: f.compact(totals.iskLost),
          })}
        >
          <EngagementList engagements={engagements.slice(0, 5)} names={names} pilotNames={pilotNames} />
          {engagements.length > 5 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">
                {text.olderEngagements(engagements.length - 5)}
              </summary>
              <div className="mt-2">
                <EngagementList engagements={engagements.slice(5)} names={names} pilotNames={pilotNames} />
              </div>
            </details>
          )}
        </Panel>
      )}
      {!home && (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <History className="size-4" aria-hidden /> {text.noHome}
        </p>
      )}

      <Panel title={text.shareTitle}>
        <CopyField value={`${env().APP_URL}/intel/${scan.id}`} />
        <p className="mt-2 text-xs text-ink-3">{text.shareHint}</p>
      </Panel>
      </ScanProgressPoller>
    </div>
  );
}
