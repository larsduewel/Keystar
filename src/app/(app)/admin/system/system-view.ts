import type { ProcessRuntime } from "@/core/system/runtime";
import type { JobError, JobSummary } from "@/core/system/worker";
import type { getI18n } from "@/i18n/server";

/** Pure view helpers of the System page: numbers the panels show, computed once from the snapshot. */

export type I18n = Awaited<ReturnType<typeof getI18n>>;

export function bytes(f: I18n["f"], value: number): string {
  const mb = value / 1024 / 1024;
  if (mb >= 1024) return `${f.number(mb / 1024, 1)} GB`;
  return mb >= 1 ? `${f.integer(mb)} MB` : `${f.integer(Math.max(1, value / 1024))} KB`;
}

export interface JobTotals {
  ok: number;
  error: number;
  running: number;
  overdue: number;
}

/** Sums the per-job counts into the four figures the worker panel shows. */
export function jobTotals(jobs: readonly JobSummary[]): JobTotals {
  return jobs.reduce(
    (sum, j) => ({ ok: sum.ok + j.ok, error: sum.error + j.error, running: sum.running + j.running, overdue: sum.overdue + j.overdue }),
    { ok: 0, error: 0, running: 0, overdue: 0 },
  );
}

export interface FailingJob {
  jobKey: string;
  owners: number;
  streak: number;
  error: string;
  lastRunAt: string | null;
}

/** One row per failing job key: how many owners, the longest streak and the most recent error. */
export function failingJobs(errors: readonly JobError[]): FailingJob[] {
  const keys = [...new Set(errors.map((e) => e.jobKey))];
  return keys.map((jobKey) => {
    const all = errors.filter((e) => e.jobKey === jobKey);
    const latest = all.reduce((a, b) => ((b.lastRunAt ?? "") > (a.lastRunAt ?? "") ? b : a));
    return {
      jobKey,
      owners: all.length,
      streak: Math.max(...all.map((e) => e.consecutiveFailures)),
      error: latest.error,
      lastRunAt: latest.lastRunAt,
    };
  });
}

/** CPUs available to the process: a cgroup limit may be fractional (0.5), the core count never is. */
function cores(f: I18n["f"], rt: ProcessRuntime): string {
  const value = rt.cpuLimit ?? rt.cpus;
  return f.number(value, Number.isInteger(value) ? 0 : 1);
}

export interface LoadRow {
  label: string;
  value: (rt: ProcessRuntime) => string;
}

/** One row per load figure; `value` renders it for either process. */
export function loadRows(tl: I18n["t"]["admin"]["system"]["load"], f: I18n["f"]): LoadRow[] {
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
