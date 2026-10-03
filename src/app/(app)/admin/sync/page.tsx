import { sql } from "drizzle-orm";
import { ChevronRight, Pause, Play, RefreshCw, Server } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getDb, workerHeartbeats } from "@/core/db";
import type { SyncOwnerType } from "@/core/db/schema/sync";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { isRecent } from "@/lib/format";
import { jobLabel } from "@/modules/jobs";
import { setSyncPaused, triggerAllSyncJobs, triggerSyncJob } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.sync.metaTitle };
}

interface JobRow {
  id: number;
  job_key: string;
  owner_type: SyncOwnerType;
  owner_id: string;
  owner_name: string | null;
  /** Character jobs: the main character of the owning account, when the owner is an alt. */
  account_main: string | null;
  enabled: boolean;
  last_status: "pending" | "running" | "ok" | "error" | "skipped";
  last_error: string | null;
  last_summary: string | null;
  last_success_at: string | null;
  last_run_at: string | null;
  next_run_at: string;
  last_duration_ms: number | null;
  consecutive_failures: number;
}

type I18n = Awaited<ReturnType<typeof getI18n>>;

const isFailing = (r: JobRow) => r.enabled && r.last_status === "error";
/** Most severe status among a character's enabled jobs (skipped counts as pending, as in the table); null when all are disabled. */
const STATUS_SEVERITY = ["error", "running", "pending", "ok"] as const;
const worstStatus = (rows: JobRow[]) => {
  const statuses = new Set(rows.filter((r) => r.enabled).map((r) => (r.last_status === "skipped" ? "pending" : r.last_status)));
  return STATUS_SEVERITY.find((s) => statuses.has(s)) ?? null;
};
const earliestNextRun = (rows: JobRow[]) =>
  rows
    .filter((r) => r.enabled)
    .map((r) => r.next_run_at)
    .sort()[0];

export default async function SyncPage() {
  const user = await requirePermission("sync.view");
  const { t, f } = await getI18n();
  const ts = t.admin.sync;
  const canTrigger = user.can("sync.trigger");
  const canPause = user.can("app.settings.manage");
  const db = getDb();
  const [jobs, workers, paused] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT j.id, j.job_key, j.owner_type, j.owner_id::text, j.enabled, j.last_status, j.last_error, j.last_summary,
             j.last_success_at, j.last_run_at, j.next_run_at, j.last_duration_ms, j.consecutive_failures,
             CASE j.owner_type
               WHEN 'character' THEN COALESCE(c.name, e.name)
               WHEN 'corporation' THEN co.name
               ELSE 'Global' END AS owner_name,
             CASE WHEN m.character_id <> j.owner_id THEN m.name END AS account_main
      FROM sync_jobs j
      LEFT JOIN characters c ON j.owner_type = 'character' AND c.character_id = j.owner_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN characters m ON m.character_id = u.main_character_id
      LEFT JOIN eve_entities e ON e.id = j.owner_id
      LEFT JOIN eve_corporations co ON j.owner_type = 'corporation' AND co.corporation_id = j.owner_id
      ORDER BY j.enabled DESC, (j.last_status = 'error') DESC, j.job_key, owner_name`),
    db.select().from(workerHeartbeats),
    getSetting("sync.paused"),
  ]);
  const rows = jobs as unknown as JobRow[];
  const active = rows.filter((r) => r.enabled);
  const errors = active.filter(isFailing).length;
  const onlineWorkers = workers.filter((w) => isRecent(w.lastBeatAt, 2 * 60_000));

  const corpRows = rows.filter((r) => r.owner_type === "corporation");
  const systemRows = rows.filter((r) => r.owner_type === "global");
  const corpNames = [...new Set(corpRows.map((r) => r.owner_name ?? r.owner_id))];

  const byCharacter = new Map<string, JobRow[]>();
  for (const r of rows) {
    if (r.owner_type !== "character") continue;
    byCharacter.set(r.owner_id, [...(byCharacter.get(r.owner_id) ?? []), r]);
  }
  // Failing characters first, then each account's main followed by its alts.
  const characters = [...byCharacter.entries()]
    .map(([id, jobs]) => {
      const name = jobs[0].owner_name ?? id;
      const accountMain = jobs[0].account_main;
      return { id, name, accountMain, jobs, failing: jobs.filter(isFailing).length, status: worstStatus(jobs) };
    })
    .sort(
      (a, b) =>
        Number(b.failing > 0) - Number(a.failing > 0) ||
        (a.accountMain ?? a.name).localeCompare(b.accountMain ?? b.name) ||
        Number(a.accountMain !== null) - Number(b.accountMain !== null) ||
        a.name.localeCompare(b.name),
    );
  const characterJobCount = characters.reduce((sum, c) => sum + c.jobs.length, 0);

  const tableProps = { i18n: { t, f }, canTrigger };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.shell.navSections.admin}
        title={t.shell.nav.sync}
        description={ts.description}
        actions={
          <>
            {canPause && (
              <ActionForm
                action={setSyncPaused.bind(null, !paused)}
                success={paused ? ts.toast.resumed : ts.toast.paused}
                failed={ts.toast.failed}
                errors={ts.toast.errors}
              >
                <Button size="sm" type="submit">
                  {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
                  {paused ? ts.resume : ts.pause}
                </Button>
              </ActionForm>
            )}
            {canTrigger && (
              <ActionForm
                action={triggerAllSyncJobs}
                success={ts.toast.allQueued}
                successDetail={ts.toast.queuedDetail}
                failed={ts.toast.failed}
                errors={ts.toast.errors}
              >
                <Button size="sm" type="submit" variant="primary">
                  <RefreshCw className="size-4" aria-hidden /> {ts.runAll}
                </Button>
              </ActionForm>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile
          label={ts.stats.worker}
          value={onlineWorkers.length ? ts.stats.online(onlineWorkers.length) : ts.stats.offline}
          delta={
            onlineWorkers.length ? (
              <StatusBadge status={paused ? "warning" : "ok"} label={paused ? ts.stats.paused : ts.stats.running} />
            ) : (
              <StatusBadge status="error" label={ts.stats.noHeartbeat} />
            )
          }
          hint={workers[0] ? ts.stats.lastBeat(f.relativeTime(workers[0].lastBeatAt)) : undefined}
        />
        <StatTile
          label={ts.stats.activeJobs}
          value={f.integer(active.length)}
          hint={ts.stats.disabled(rows.length - active.length)}
        />
        <StatTile
          label={ts.stats.failing}
          value={f.integer(errors)}
          delta={
            errors ? (
              <StatusBadge status="error" label={ts.stats.needsAttention} />
            ) : (
              <StatusBadge status="ok" label={ts.stats.allHealthy} />
            )
          }
        />
        <StatTile
          label={ts.stats.nextRun}
          value={active.length ? f.relativeTime(earliestNextRun(active)) : "—"}
        />
      </div>

      {!onlineWorkers.length && (
        <Glass className="flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm">
          <Server className="size-4 text-warning" aria-hidden />
          <span className="text-ink-2">
            {ts.noWorker(
              <code className="text-ink">docker compose up -d worker</code>,
              <code className="text-ink">pnpm dev:worker</code>,
            )}
          </span>
        </Glass>
      )}

      <Panel
        id="corporation"
        title={ts.sections.corporation(corpNames.length === 1 ? corpNames[0] : null)}
        subtitle={ts.sections.jobCount(corpRows.length)}
        bodyClassName="px-2 pb-2"
      >
        <JobTable rows={corpRows} showOwner={corpNames.length > 1} {...tableProps} />
      </Panel>

      <Panel
        id="characters"
        title={ts.sections.characters}
        subtitle={ts.sections.characterCount(characters.length, characterJobCount)}
      >
        <p className="mb-3 text-xs text-ink-3">{ts.sections.charactersHint}</p>
        {characters.length ? (
          <ul className="divide-y divide-surface-contrast/5">
            {characters.map((c) => {
              const nextRun = earliestNextRun(c.jobs);
              return (
                <li key={c.id}>
                  <details className="group" open={c.failing > 0}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-48 flex-1 items-center gap-2.5">
                        <ChevronRight
                          className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90"
                          aria-hidden
                        />
                        <Portrait id={Number(c.id)} size={24} />
                        <span className="truncate font-medium">{c.name}</span>
                        {c.accountMain && (
                          <span className="truncate text-xs text-ink-3">{ts.sections.account(c.accountMain)}</span>
                        )}
                      </span>
                      <span className="text-xs text-ink-3">{ts.sections.jobCount(c.jobs.length)}</span>
                      {c.status === null ? (
                        <StatusBadge status="pending" label={ts.disabled} />
                      ) : (
                        <StatusBadge
                          status={c.status}
                          label={c.status === "error" ? ts.sections.failingCount(c.failing) : undefined}
                        />
                      )}
                      <span className="text-xs whitespace-nowrap text-ink-2 sm:w-40 sm:text-right">
                        {nextRun ? ts.sections.nextRun(f.relativeTime(nextRun)) : "—"}
                      </span>
                    </summary>
                    <div className="pb-2">
                      <JobTable rows={c.jobs} showOwner={false} {...tableProps} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-ink-3">{ts.sections.empty}</p>
        )}
      </Panel>

      <Panel id="system" title={ts.sections.system} subtitle={ts.sections.jobCount(systemRows.length)} bodyClassName="px-2 pb-2">
        <JobTable rows={systemRows} showOwner={false} {...tableProps} />
      </Panel>
    </div>
  );
}

function JobTable({
  rows,
  showOwner,
  canTrigger,
  i18n: { t, f },
}: {
  rows: JobRow[];
  showOwner: boolean;
  canTrigger: boolean;
  i18n: Pick<I18n, "t" | "f">;
}) {
  const ts = t.admin.sync;
  if (!rows.length) return <p className="py-4 text-center text-sm text-ink-3">{ts.sections.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="ks-table">
        <thead>
          <tr>
            <th>{ts.columns.job}</th>
            {showOwner && <th>{ts.columns.owner}</th>}
            <th>{ts.columns.status}</th>
            <th>{ts.columns.result}</th>
            <th>{ts.columns.lastSuccess}</th>
            <th>{ts.columns.nextRun}</th>
            {canTrigger && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.enabled ? undefined : "opacity-45"}>
              <td>
                <div className="font-medium">{jobLabel(r.job_key, t)}</div>
                <code className="text-2xs text-ink-3">{r.job_key}</code>
              </td>
              {showOwner && (
                <td>
                  <div>{r.owner_type === "global" ? ts.ownerTypes.global : (r.owner_name ?? r.owner_id)}</div>
                  <div className="text-2xs text-ink-3">{ts.ownerTypes[r.owner_type]}</div>
                </td>
              )}
              <td>
                {!r.enabled ? (
                  <StatusBadge status="pending" label={ts.disabled} />
                ) : (
                  <StatusBadge
                    status={r.last_status === "skipped" ? "pending" : r.last_status}
                    label={r.last_status === "error" && r.consecutive_failures > 1 ? ts.errorCount(r.consecutive_failures) : undefined}
                  />
                )}
              </td>
              <td className="max-w-[420px]">
                {r.last_status === "error" && r.last_error ? (
                  <span className="line-clamp-2 text-xs text-critical-text" title={r.last_error}>
                    {r.last_error}
                  </span>
                ) : (
                  <span className="line-clamp-2 text-xs text-ink-2" title={r.last_summary ?? undefined}>
                    {r.last_summary ?? "—"}
                  </span>
                )}
                {r.last_duration_ms !== null && <div className="text-2xs text-ink-3">{f.integer(r.last_duration_ms)} ms</div>}
              </td>
              <td className="whitespace-nowrap text-ink-2">{f.relativeTime(r.last_success_at)}</td>
              <td className="whitespace-nowrap text-ink-2">{r.enabled ? f.relativeTime(r.next_run_at) : "—"}</td>
              {canTrigger && (
                <td className="text-right">
                  {r.enabled && (
                    <ActionForm
                      action={triggerSyncJob.bind(null, r.id)}
                      success={ts.toast.queued(jobLabel(r.job_key, t))}
                      successDetail={ts.toast.queuedDetail}
                      failed={ts.toast.failed}
                      errors={ts.toast.errors}
                    >
                      <Button size="sm" variant="ghost" type="submit" title={ts.runNow} aria-label={ts.runNow}>
                        <RefreshCw className="size-3.5" aria-hidden />
                      </Button>
                    </ActionForm>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
