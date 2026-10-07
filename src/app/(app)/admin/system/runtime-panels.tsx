import { ArrowRight, Clock3, Cpu, Database, ExternalLink, Gauge, Globe, Package, RefreshCw, Server, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/glass";
import { InfoItem } from "@/components/ui/info-item";
import type { SystemSnapshot } from "@/core/system/collect";
import type { DatabaseInfo } from "@/core/system/database";
import type { ProcessRuntime } from "@/core/system/runtime";
import type { EsiClientStats } from "@/core/esi/client";
import type { WorkerHeartbeat } from "@/core/system/worker";
import { getI18n } from "@/i18n/server";
import { bytes, loadRows, type FailingJob, type JobTotals } from "./system-view";

/** The System page's panels about this installation: build, database, process load and the worker. */

export async function KeystarPanel({ snapshot, sourceUrl }: { snapshot: SystemSnapshot; sourceUrl: string }) {
  const { t, f } = await getI18n();
  const ts = t.admin.system;
  const rt = snapshot.runtime;
  return (
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
  );
}

export async function DatabasePanel({ database }: { database: SystemSnapshot["database"] }) {
  const { t, f } = await getI18n();
  const ts = t.admin.system;
  if (!database.ok) {
    return (
      <Panel title={ts.database.title}>
        <p className="text-sm text-critical-text">{ts.database.unavailable(database.error)}</p>
      </Panel>
    );
  }
  const db = database.data;
  return (
    <Panel title={ts.database.title}>
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
          <p className="text-xs text-ink-3">{ts.database.latest(db.migrations.latest.tag, f.date(db.migrations.latest.appliedAt))}</p>
        )}
        <LargestTables tables={db.tables.slice(0, 6)} />
      </div>
    </Panel>
  );
}

async function LargestTables({ tables }: { tables: DatabaseInfo["tables"] }) {
  const { t, f } = await getI18n();
  const tt = t.admin.system.database.tables;
  return (
    <div className="glass-inset overflow-x-auto rounded-lg">
      <table className="ks-table">
        <thead>
          <tr>
            <th scope="col">{tt.title}</th>
            <th scope="col" className="text-right">
              {tt.rows}
            </th>
            <th scope="col" className="text-right">
              {tt.size}
            </th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={table.name}>
              <td className="font-mono text-xs">{table.name}</td>
              <td className="text-right tabular-nums" title={table.rowsEstimated ? tt.estimated : undefined}>
                {table.rowsEstimated ? tt.approx(f.integer(table.rows)) : f.integer(table.rows)}
              </td>
              <td className="text-right text-ink-2 tabular-nums">{bytes(f, table.totalBytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Load of the web process next to the worker's, from its last heartbeat (`workerRuntime` is null when that is missing or too old). */
export async function LoadPanel({
  runtime,
  workerRuntime,
  workerNote,
}: {
  runtime: ProcessRuntime;
  workerRuntime: ProcessRuntime | null;
  /** Why the worker column is empty although a heartbeat exists: "old" (no load figures) or "stale". */
  workerNote: "old" | "stale" | null;
}) {
  const { t, f } = await getI18n();
  const tl = t.admin.system.load;
  return (
    <Panel title={tl.title} subtitle={tl.subtitle}>
      <div className="glass-inset overflow-x-auto rounded-lg">
        <table className="ks-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{tl.title}</span>
              </th>
              <th scope="col" className="text-right">
                {tl.columns.web}
              </th>
              <th scope="col" className="text-right">
                {tl.columns.worker}
              </th>
            </tr>
          </thead>
          <tbody>
            {loadRows(tl, f).map((row) => (
              <tr key={row.label}>
                <th scope="row" className="font-normal text-ink-2">
                  {row.label}
                </th>
                <td className="text-right tabular-nums">{row.value(runtime)}</td>
                <td className="text-right tabular-nums">{workerRuntime ? row.value(workerRuntime) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {workerNote && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
          <Gauge className="size-3" aria-hidden /> {workerNote === "old" ? tl.workerOld : tl.workerStale}
        </p>
      )}
    </Panel>
  );
}

export async function WorkerPanel({
  beat,
  totals,
  failing,
  esi,
  showSyncLink,
}: {
  beat: WorkerHeartbeat | undefined;
  totals: JobTotals;
  failing: FailingJob[];
  esi: EsiClientStats | null;
  showSyncLink: boolean;
}) {
  const { t, f } = await getI18n();
  const tw = t.admin.system.worker;
  return (
    <Panel
      title={tw.title}
      subtitle={tw.subtitle}
      actions={
        showSyncLink && (
          <Link href="/admin/sync" className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-strong">
            {tw.openSync} <ArrowRight className="size-3" aria-hidden />
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
            <Fact label={tw.version}>{beat.version ?? "—"}</Fact>
            <Fact label={tw.lastBeat}>{f.relativeTime(beat.lastBeatAt)}</Fact>
            <Fact label={tw.started}>{f.relativeTime(beat.startedAt)}</Fact>
            {beat.info.concurrency !== undefined && <Fact label={tw.running}>{tw.slots(beat.info.running ?? 0, beat.info.concurrency)}</Fact>}
          </div>
        ) : (
          <p className="text-sm text-ink-3">{tw.none}</p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={tw.stats.ok} value={f.integer(totals.ok)} />
          <Stat label={tw.stats.failing} value={f.integer(totals.error)} />
          <Stat label={tw.stats.running} value={f.integer(totals.running)} />
          <Stat label={tw.stats.overdue} value={f.integer(totals.overdue)} />
          <Stat label={tw.stats.errorBudget} value={esi && esi.errorLimitRemain !== null ? f.integer(esi.errorLimitRemain) : "—"} />
        </div>
        {failing.length ? <FailingJobsTable failing={failing} /> : <p className="py-1 text-center text-sm text-ink-3">{tw.noFailing}</p>}
      </div>
    </Panel>
  );
}

async function FailingJobsTable({ failing }: { failing: FailingJob[] }) {
  const { t, f } = await getI18n();
  const tf = t.admin.system.worker.failing;
  return (
    <div className="glass-inset overflow-x-auto rounded-lg">
      <table className="ks-table">
        <thead>
          <tr>
            <th scope="col">{tf.job}</th>
            <th scope="col">{tf.owners}</th>
            <th scope="col">{tf.streak}</th>
            <th scope="col">{tf.lastError}</th>
            <th scope="col">{tf.lastRun}</th>
          </tr>
        </thead>
        <tbody>
          {failing.map((j) => (
            <tr key={j.jobKey}>
              <td>
                <code className="text-xs">{j.jobKey}</code>
              </td>
              <td className="whitespace-nowrap text-ink-2">{tf.ownerCount(j.owners)}</td>
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
  );
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
