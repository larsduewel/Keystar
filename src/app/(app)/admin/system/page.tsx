import { Bug, Download } from "lucide-react";
import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { HEARTBEAT_FRESH_MS, runChecks, type CheckResult } from "@/core/system/checks";
import { collectSystemSnapshot, type SystemSnapshot } from "@/core/system/collect";
import { originFromHeaders } from "@/core/system/config";
import { createRedactor } from "@/core/system/redact";
import { bugReportUrl, issueSearchUrl, issueSummary } from "@/core/system/summary";
import { buildSupportPackage, supportPackageFilename } from "@/core/system/support-package";
import { getI18n } from "@/i18n/server";
import { isRecent } from "@/lib/format";
import { ConfigPanel, HelpPanel, LOGS_COMMAND } from "./config-panels";
import { DatabasePanel, KeystarPanel, LoadPanel, WorkerPanel } from "./runtime-panels";
import { ChecksPanel, NetworkPanel, OverallStatus } from "./status-panels";
import { CopySummaryButton, OpenDialogButton, SystemDialogs, type SystemDialogData } from "./system-dialogs";
import { failingJobs, jobTotals, type I18n } from "./system-view";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.system.metaTitle };
}

/** What the issue and support-package dialogs need: the summary, the package and the problems found. */
function dialogData(snapshot: SystemSnapshot, checks: CheckResult[], sourceUrl: string, t: I18n["t"]): SystemDialogData {
  const ts = t.admin.system;
  const pkg = buildSupportPackage(snapshot, checks, { redactor: createRedactor() });
  const summary = issueSummary(snapshot, checks);
  const problems = checks.filter((c) => c.status === "warn" || c.status === "fail");
  return {
    summary,
    packageJson: JSON.stringify(pkg, null, 2),
    packageFilename: supportPackageFilename(pkg),
    redactions: pkg.meta.redactions,
    bugReportUrl: bugReportUrl(sourceUrl, snapshot.build.version, summary),
    issueSearchUrl: issueSearchUrl(sourceUrl),
    version: snapshot.build.commit ? `${snapshot.build.version} (${snapshot.build.commit.slice(0, 7)})` : snapshot.build.version,
    problems: problems.map((c) => ({
      status: c.status,
      label: ts.checks[c.id].label,
      detail: ts.checks[c.id].detail(c.status, c.values),
    })),
    logsCommand: LOGS_COMMAND,
  };
}

export default async function SystemPage() {
  const user = await requirePermission("system.view");
  const { t } = await getI18n();
  const ts = t.admin.system;
  const snapshot = await collectSystemSnapshot({ source: "web", origin: originFromHeaders(await headers()) });
  const checks = runChecks(snapshot);
  const sourceUrl = env().SOURCE_URL;
  const dialogs = dialogData(snapshot, checks, sourceUrl, t);

  const worker = snapshot.worker.ok ? snapshot.worker.data : null;
  const beat = worker?.heartbeats[0];
  const beatFresh = beat ? isRecent(beat.lastBeatAt, HEARTBEAT_FRESH_MS) : false;
  const esi = (beatFresh ? beat?.info.esi : null) ?? snapshot.esi;
  // Older workers' heartbeats carry a runtime without load figures; treat those like no runtime.
  const workerRuntime = beatFresh && beat?.info.runtime && "cpuPercent" in beat.info.runtime ? beat.info.runtime : null;
  const workerNote = workerRuntime || !beat ? null : beatFresh ? "old" : "stale";

  return (
    <SystemDialogs data={dialogs}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.shell.navSections.admin}
          title={t.shell.nav.system}
          description={ts.description}
          actions={
            <>
              <CopySummaryButton summary={dialogs.summary} />
              <OpenDialogButton kind="issue">
                <Bug className="size-4" aria-hidden /> {ts.actions.reportIssue}
              </OpenDialogButton>
              <OpenDialogButton kind="package" variant="primary">
                <Download className="size-4" aria-hidden /> {ts.actions.download}
              </OpenDialogButton>
            </>
          }
        />

        <OverallStatus checks={checks} />
        <ChecksPanel checks={checks} />

        <div className="grid gap-4 xl:grid-cols-2">
          <KeystarPanel snapshot={snapshot} sourceUrl={sourceUrl} />
          <DatabasePanel database={snapshot.database} />
        </div>

        <LoadPanel runtime={snapshot.runtime} workerRuntime={workerRuntime} workerNote={workerNote} />

        {snapshot.network && <NetworkPanel probes={snapshot.network} />}

        <WorkerPanel
          beat={beat}
          totals={jobTotals(worker?.jobs ?? [])}
          failing={failingJobs(worker?.errors ?? [])}
          esi={esi}
          showSyncLink={user.can("sync.view")}
        />

        <ConfigPanel entries={snapshot.config} appUrlMatchesOrigin={snapshot.appUrlMatchesOrigin} />
        <HelpPanel sourceUrl={sourceUrl} />
      </div>
    </SystemDialogs>
  );
}
