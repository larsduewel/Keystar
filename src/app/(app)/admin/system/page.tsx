import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Gauge,
  Globe,
  Lock,
  Package,
  RefreshCw,
  Server,
  Sparkles,
  XCircle,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-button";
import { Glass, Panel } from "@/components/ui/glass";
import { InfoItem } from "@/components/ui/info-item";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { HEARTBEAT_FRESH_MS, isRefused, runChecks, worstStatus, type CheckResult, type CheckStatus } from "@/core/system/checks";
import { collectSystemSnapshot } from "@/core/system/collect";
import { originFromHeaders, type ConfigEntry } from "@/core/system/config";
import { createRedactor } from "@/core/system/redact";
import type { ProcessRuntime } from "@/core/system/runtime";
import { bugReportUrl, issueSearchUrl, issueSummary } from "@/core/system/summary";
import { buildSupportPackage, supportPackageFilename } from "@/core/system/support-package";
import { getI18n } from "@/i18n/server";
import { isRecent } from "@/lib/format";
import { CopySummaryButton, OpenDialogButton, PrivacyNote, RecheckButton, SystemDialogs } from "./system-dialogs";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.system.metaTitle };
}

type I18n = Awaited<ReturnType<typeof getI18n>>;

/** The CLI fallback for when the web app doesn't start; `--no-deps` because the worker service waits for a healthy app. */
const CLI_COMMAND = "docker compose run --rm --no-deps -T worker node dist/support.mjs > keystar-support.json";
const LOGS_COMMAND = "docker compose logs --since 1h app worker > keystar-logs.txt";

const statusTone = { ok: "good", warn: "warning", fail: "critical", skip: "neutral" } as const;
const statusIcon: Record<CheckStatus, ReactNode> = {
  ok: <CheckCircle2 className="size-3" aria-hidden />,
  warn: <AlertTriangle className="size-3" aria-hidden />,
  fail: <XCircle className="size-3" aria-hidden />,
  skip: <CircleDashed className="size-3" aria-hidden />,
};

function bytes(f: I18n["f"], value: number): string {
  const mb = value / 1024 / 1024;
  if (mb >= 1024) return `${f.number(mb / 1024, 1)} GB`;
  return mb >= 1 ? `${f.integer(mb)} MB` : `${f.integer(Math.max(1, value / 1024))} KB`;
}

export default async function SystemPage() {
  const user = await requirePermission("system.view");
  const { t, f } = await getI18n();
  const ts = t.admin.system;
  const snapshot = await collectSystemSnapshot({ source: "web", origin: originFromHeaders(await headers()) });
  const checks = runChecks(snapshot);
  const pkg = buildSupportPackage(snapshot, checks, { redactor: createRedactor() });
  const summary = issueSummary(snapshot, checks);
  const sourceUrl = env().SOURCE_URL;
  const problems = checks.filter((c) => c.status === "warn" || c.status === "fail");
  const failed = problems.filter((c) => c.status === "fail").length;
  const overall = worstStatus(checks);

  const db = snapshot.database.ok ? snapshot.database.data : null;
  const worker = snapshot.worker.ok ? snapshot.worker.data : null;
  const beat = worker?.heartbeats[0];
  const beatFresh = beat ? isRecent(beat.lastBeatAt, HEARTBEAT_FRESH_MS) : false;
  const esi = (beatFresh ? beat?.info.esi : null) ?? snapshot.esi;
  const rt = snapshot.runtime;
  // Older workers' heartbeats carry a runtime without load figures; treat those like no runtime.
  const workerRt = beatFresh && beat?.info.runtime && "cpuPercent" in beat.info.runtime ? beat.info.runtime : null;

  const jobTotals = (worker?.jobs ?? []).reduce(
    (sum, j) => ({ ok: sum.ok + j.ok, error: sum.error + j.error, running: sum.running + j.running, overdue: sum.overdue + j.overdue }),
    { ok: 0, error: 0, running: 0, overdue: 0 },
  );
  // One row per failing job key: how many owners, the longest streak and the most recent error.
  const failing = [...new Map((worker?.errors ?? []).map((e) => [e.jobKey, e])).values()].map((first) => {
    const all = worker!.errors.filter((e) => e.jobKey === first.jobKey);
    const latest = all.reduce((a, b) => ((b.lastRunAt ?? "") > (a.lastRunAt ?? "") ? b : a));
    return {
      jobKey: first.jobKey,
      owners: all.length,
      streak: Math.max(...all.map((e) => e.consecutiveFailures)),
      error: latest.error,
      lastRunAt: latest.lastRunAt,
    };
  });

  const dialogData = {
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

  return (
    <SystemDialogs data={dialogData}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.shell.navSections.admin}
          title={t.shell.nav.system}
          description={ts.description}
          actions={
            <>
              <CopySummaryButton summary={summary} />
              <OpenDialogButton kind="issue">
                <Bug className="size-4" aria-hidden /> {ts.actions.reportIssue}
              </OpenDialogButton>
              <OpenDialogButton kind="package" variant="primary">
                <Download className="size-4" aria-hidden /> {ts.actions.download}
              </OpenDialogButton>
            </>
          }
        />

        <Glass
          className={
            overall === "fail"
              ? "flex flex-wrap items-center gap-3.5 rounded-2xl px-5 py-3.5 ring-1 ring-critical/45"
              : "flex flex-wrap items-center gap-3.5 rounded-2xl px-5 py-3.5"
          }
        >
          {problems.length ? (
            overall === "fail" ? (
              <XCircle className="size-5.5 text-critical-text" aria-hidden />
            ) : (
              <AlertTriangle className="size-5.5 text-warning" aria-hidden />
            )
          ) : (
            <CheckCircle2 className="size-5.5 text-good-text" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{problems.length ? ts.overall.problems(problems.length) : ts.overall.ok}</div>
            <div className="text-xs text-ink-3">
              {[problems.length ? ts.overall.breakdown(failed, problems.length - failed) : null, ts.overall.checkedWhenLoaded]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {problems.length ? (
            <OpenDialogButton kind="issue" size="sm">
              {ts.overall.whatNext}
            </OpenDialogButton>
          ) : (
            <RecheckButton />
          )}
        </Glass>

        <Panel title={ts.checksTitle} subtitle={ts.checksSubtitle}>
          <ul className="grid gap-2 lg:grid-cols-2">
            {checks.map((c) => (
              <CheckRow key={c.id} check={c} i18n={{ t, f }} />
            ))}
          </ul>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title={ts.keystar.title}
            actions={
              <a
                href={`${sourceUrl}/releases`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-strong"
              >
                {ts.keystar.releaseNotes} <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">{t.common.opensInNewTab}</span>
              </a>
            }
          >
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <InfoItem icon={Sparkles} label={ts.keystar.version}>
                {snapshot.build.version}
                {snapshot.build.commit && <span className="ml-1.5 font-mono text-xs text-ink-3">· {snapshot.build.commit.slice(0, 7)}</span>}
              </InfoItem>
              <InfoItem icon={Package} label={ts.keystar.install}>
                {rt.install === "docker" ? ts.keystar.installDocker(snapshot.build.imageTag) : ts.keystar.installSource}
              </InfoItem>
              <InfoItem icon={Clock3} label={ts.keystar.uptime}>
                {ts.keystar.uptimeValue(rt.uptimeSeconds)}
              </InfoItem>
              <InfoItem icon={Cpu} label={ts.keystar.runtime}>
                {ts.keystar.node(rt.node)}
              </InfoItem>
              <InfoItem icon={Server} label={ts.keystar.host}>
                {ts.keystar.hostValue(`${rt.platform}/${rt.arch}`, rt.cpuLimit ?? rt.cpus, rt.memoryLimitMb ? bytes(f, rt.memoryLimitMb * 1024 * 1024) : null)}
              </InfoItem>
              <InfoItem icon={Globe} label={ts.keystar.environment}>
                {[snapshot.config.find((c) => c.name === "NODE_ENV")?.value, rt.timeZone, snapshot.demoMode ? ts.keystar.demo : null]
                  .filter(Boolean)
                  .join(" · ")}
              </InfoItem>
            </div>
          </Panel>

          <Panel title={ts.database.title}>
            {db ? (
              <div className="space-y-4">
                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  <InfoItem icon={Database} label={ts.database.postgres}>
                    {db.serverVersion.split(" ")[0]} · {bytes(f, db.sizeBytes)}
                  </InfoItem>
                  <InfoItem icon={RefreshCw} label={ts.database.migrations}>
                    {ts.database.migrationsValue(db.migrations.applied, db.migrations.bundled)}
                  </InfoItem>
                </div>
                {db.migrations.latest && (
                  <p className="text-xs text-ink-3">
                    {ts.database.latest(db.migrations.latest.tag, f.date(db.migrations.latest.appliedAt))}
                  </p>
                )}
                <div className="glass-inset overflow-x-auto rounded-lg">
                  <table className="ks-table">
                    <thead>
                      <tr>
                        <th scope="col">{ts.database.tables.title}</th>
                        <th scope="col" className="text-right">
                          {ts.database.tables.rows}
                        </th>
                        <th scope="col" className="text-right">
                          {ts.database.tables.size}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.tables.slice(0, 6).map((table) => (
                        <tr key={table.name}>
                          <td className="font-mono text-xs">{table.name}</td>
                          <td className="text-right tabular-nums" title={table.rowsEstimated ? ts.database.tables.estimated : undefined}>
                            {table.rowsEstimated ? ts.database.tables.approx(f.integer(table.rows)) : f.integer(table.rows)}
                          </td>
                          <td className="text-right text-ink-2 tabular-nums">{bytes(f, table.totalBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-critical-text">
                {ts.database.unavailable(snapshot.database.ok ? "" : snapshot.database.error)}
              </p>
            )}
          </Panel>
        </div>

        <Panel title={ts.load.title} subtitle={ts.load.subtitle}>
          <div className="glass-inset overflow-x-auto rounded-lg">
            <table className="ks-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{ts.load.title}</span>
                  </th>
                  <th scope="col" className="text-right">
                    {ts.load.columns.web}
                  </th>
                  <th scope="col" className="text-right">
                    {ts.load.columns.worker}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadRows(ts.load, f).map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="font-normal text-ink-2">
                      {row.label}
                    </th>
                    <td className="text-right tabular-nums">{row.value(rt)}</td>
                    <td className="text-right tabular-nums">{workerRt ? row.value(workerRt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!workerRt && beat && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
              <Gauge className="size-3" aria-hidden /> {beatFresh ? ts.load.workerOld : ts.load.workerStale}
            </p>
          )}
        </Panel>

        {snapshot.network && (
          <Panel title={ts.network.title} subtitle={ts.network.subtitle}>
            <ul className="grid gap-2 md:grid-cols-3">
              {snapshot.network.map((p) => {
                const refused = p.reachable && isRefused(p.target, p.status);
                return (
                  <li key={p.target} className="glass-inset flex items-start gap-3 rounded-lg px-3.5 py-3">
                    <Badge tone={!p.reachable ? (p.target === "zkill" ? "warning" : "critical") : refused ? "warning" : "good"} className="mt-px">
                      {statusIcon[!p.reachable ? (p.target === "zkill" ? "warn" : "fail") : refused ? "warn" : "ok"]}
                      {ts.network.targets[p.target]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        {p.reachable ? ts.network.answered(p.status ?? 0, f.integer(p.ms)) : ts.network.unreachable(p.error ?? "?")}
                      </div>
                      <div className="text-xs text-ink-3">{ts.network.purpose[p.target]}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        <Panel
          title={ts.worker.title}
          subtitle={ts.worker.subtitle}
          actions={
            user.can("sync.view") && (
              <Link href="/admin/sync" className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-strong">
                {ts.worker.openSync} <ArrowRight className="size-3" aria-hidden />
              </Link>
            )
          }
        >
          <div className="space-y-4">
            {beat ? (
              <div className="glass-inset flex flex-wrap items-center gap-x-7 gap-y-2 rounded-lg px-4 py-3 text-sm">
                <span className="flex items-center gap-2.5">
                  <Server className="size-4 text-ink-2" aria-hidden />
                  <span className="font-mono text-xs">{beat.workerId}</span>
                </span>
                <Fact label={ts.worker.version}>{beat.version ?? "—"}</Fact>
                <Fact label={ts.worker.lastBeat}>{f.relativeTime(beat.lastBeatAt)}</Fact>
                <Fact label={ts.worker.started}>{f.relativeTime(beat.startedAt)}</Fact>
                {beat.info.concurrency !== undefined && (
                  <Fact label={ts.worker.running}>{ts.worker.slots(beat.info.running ?? 0, beat.info.concurrency)}</Fact>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-3">{ts.worker.none}</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label={ts.worker.stats.ok} value={f.integer(jobTotals.ok)} />
              <Stat label={ts.worker.stats.failing} value={f.integer(jobTotals.error)} />
              <Stat label={ts.worker.stats.running} value={f.integer(jobTotals.running)} />
              <Stat label={ts.worker.stats.overdue} value={f.integer(jobTotals.overdue)} />
              <Stat label={ts.worker.stats.errorBudget} value={esi?.errorLimitRemain !== null && esi ? f.integer(esi.errorLimitRemain) : "—"} />
            </div>
            {failing.length ? (
              <div className="glass-inset overflow-x-auto rounded-lg">
                <table className="ks-table">
                  <thead>
                    <tr>
                      <th scope="col">{ts.worker.failing.job}</th>
                      <th scope="col">{ts.worker.failing.owners}</th>
                      <th scope="col">{ts.worker.failing.streak}</th>
                      <th scope="col">{ts.worker.failing.lastError}</th>
                      <th scope="col">{ts.worker.failing.lastRun}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failing.map((j) => (
                      <tr key={j.jobKey}>
                        <td>
                          <code className="text-xs">{j.jobKey}</code>
                        </td>
                        <td className="whitespace-nowrap text-ink-2">{ts.worker.failing.ownerCount(j.owners)}</td>
                        <td>
                          <Badge tone="critical">{f.integer(j.streak)}</Badge>
                        </td>
                        <td className="max-w-[440px]">
                          <span className="line-clamp-2 text-xs text-critical-text" title={j.error}>
                            {j.error}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-ink-2">{f.relativeTime(j.lastRunAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-1 text-center text-sm text-ink-3">{ts.worker.noFailing}</p>
            )}
          </div>
        </Panel>

        <Panel title={ts.config.title} subtitle={ts.config.subtitle}>
          <div className="glass-inset overflow-x-auto rounded-lg">
            <table className="ks-table">
              <thead>
                <tr>
                  <th scope="col">{ts.config.columns.variable}</th>
                  <th scope="col">{ts.config.columns.status}</th>
                  <th scope="col">{ts.config.columns.value}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.config.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <code className="text-xs">{c.name}</code>
                    </td>
                    <td>
                      <Badge tone={c.state === "set" ? "good" : "neutral"}>{ts.config.states[c.state]}</Badge>
                    </td>
                    <td className="text-ink-2">
                      <ConfigValue entry={c} matches={snapshot.appUrlMatchesOrigin} i18n={{ t, f }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={ts.help.title}>
          <ol className="space-y-2.5">
            <HelpStep n={1} title={ts.help.checks.title}>
              {ts.help.checks.body}
            </HelpStep>
            <HelpStep n={2} title={ts.help.search.title}>
              {ts.help.search.body}{" "}
              <a href={issueSearchUrl(sourceUrl)} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-strong">
                {ts.help.search.link} ↗<span className="sr-only">{t.common.opensInNewTab}</span>
              </a>
            </HelpStep>
            <HelpStep n={3} title={ts.help.download.title}>
              {ts.help.download.body}
              <div className="mt-2">
                <CopyField value={CLI_COMMAND} />
              </div>
            </HelpStep>
            <HelpStep n={4} title={ts.help.logs.title}>
              {ts.help.logs.body}
              <div className="mt-2">
                <CopyField value={LOGS_COMMAND} />
              </div>
              <PrivacyNote className="mt-2">{ts.privacy.logs}</PrivacyNote>
            </HelpStep>
            <HelpStep
              n={5}
              title={ts.help.report.title}
              action={
                <OpenDialogButton kind="issue" size="sm">
                  {ts.actions.reportIssue}
                </OpenDialogButton>
              }
            >
              {ts.help.report.body}
              <PrivacyNote className="mt-2">{ts.privacy.report}</PrivacyNote>
            </HelpStep>
          </ol>
        </Panel>
      </div>
    </SystemDialogs>
  );
}

/** CPUs available to the process: a cgroup limit may be fractional (0.5), the core count never is. */
function cores(f: I18n["f"], rt: ProcessRuntime): string {
  const value = rt.cpuLimit ?? rt.cpus;
  return f.number(value, Number.isInteger(value) ? 0 : 1);
}

/** One row per load figure; `value` renders it for either process. */
function loadRows(tl: I18n["t"]["admin"]["system"]["load"], f: I18n["f"]): { label: string; value: (rt: ProcessRuntime) => string }[] {
  const mb = (value: number) => bytes(f, value * 1024 * 1024);
  return [
    { label: tl.cpu, value: (rt) => tl.cpuValue(f.percent(rt.cpuPercent / 100, rt.cpuPercent < 10 ? 1 : 0), cores(f, rt)) },
    { label: tl.memory, value: (rt) => tl.memoryValue(mb(rt.rssMb), rt.memoryLimitMb ? mb(rt.memoryLimitMb) : null) },
    { label: tl.heap, value: (rt) => mb(rt.heapUsedMb) },
    { label: tl.container, value: (rt) => (rt.containerMemoryMb ? tl.memoryValue(mb(rt.containerMemoryMb), rt.memoryLimitMb ? mb(rt.memoryLimitMb) : null) : "—") },
    { label: tl.hostFree, value: (rt) => tl.hostFreeValue(mb(rt.freeMemoryMb), mb(rt.totalMemoryMb)) },
    {
      label: tl.loadAverage,
      value: (rt) => (rt.loadAverage ? tl.loadValue(...(rt.loadAverage.map((v) => f.number(v, 2)) as [string, string, string])) : "—"),
    },
  ];
}

function CheckRow({ check, i18n: { t } }: { check: CheckResult; i18n: Pick<I18n, "t" | "f"> }) {
  const ts = t.admin.system;
  return (
    <li className="glass-inset flex items-start gap-3 rounded-lg px-3.5 py-3">
      <Badge tone={statusTone[check.status]} className="mt-px">
        {statusIcon[check.status]} {ts.status[check.status]}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{ts.checks[check.id].label}</div>
        <div className="text-xs text-ink-3">{ts.checks[check.id].detail(check.status, check.values)}</div>
      </div>
    </li>
  );
}

function ConfigValue({ entry, matches, i18n: { t } }: { entry: ConfigEntry; matches: boolean | null; i18n: Pick<I18n, "t" | "f"> }) {
  const tc = t.admin.system.config;
  switch (entry.kind) {
    case "secret":
    case "private":
      return entry.state === "set" ? (
        <span className="inline-flex items-center gap-1.5 text-ink-3">
          <Lock className="size-3" aria-hidden /> {tc.hidden}
        </span>
      ) : (
        <span className="text-ink-3">—</span>
      );
    case "url":
      return <>{tc.https(Boolean(entry.https), matches)}</>;
    case "ids":
      return <>{tc.ids(entry.count ?? 0)}</>;
    case "endpoint":
      return entry.value === "custom" ? <>{tc.custom}</> : <code className="text-xs">{entry.value}</code>;
    default:
      return entry.value ? <code className="text-xs">{entry.value}</code> : <span className="text-ink-3">—</span>;
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span>
      <span className="text-xs text-ink-3">{label} </span>
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset rounded-lg px-4 py-3">
      <div className="eve-label text-2xs text-ink-3">{label}</div>
      <div className="mt-1 text-[1.6rem] leading-tight font-semibold">{value}</div>
    </div>
  );
}

function HelpStep({ n, title, action, children }: { n: number; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <li className="glass-inset flex items-center gap-3.5 rounded-lg px-4 py-3.5">
      <span className="self-start pt-px font-mono text-xs text-accent" aria-hidden>
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-ink-3">{children}</div>
      </div>
      {action}
    </li>
  );
}
