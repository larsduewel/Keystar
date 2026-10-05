import { existsSync, readFileSync } from "node:fs";
import os from "node:os";

/** Facts about the current Node process and its container, safe to share (no hostnames or paths). */
export interface ProcessRuntime {
  node: string;
  platform: string;
  arch: string;
  /** "docker" inside a container, else "source" (pnpm dev / start). */
  install: "docker" | "source";
  cpus: number;
  uptimeSeconds: number;
  rssMb: number;
  heapUsedMb: number;
  /** Host memory as Node sees it. */
  totalMemoryMb: number;
  /** cgroup (container) limits; null when there is none or it can't be read. */
  memoryLimitMb: number | null;
  cpuLimit: number | null;
  /**
   * Share of the CPU available to this process (its limit, else all cores) that it used since the
   * previous sample: the worker samples every heartbeat, the web app on every load of System Info.
   */
  cpuPercent: number;
  /** Host load average over 1, 5 and 15 minutes (the whole machine, not the container); null on Windows. */
  loadAverage: [number, number, number] | null;
  /** Memory charged to the container (cgroup), including page cache; null outside a cgroup. */
  containerMemoryMb: number | null;
  /** Free host memory as Node sees it. */
  freeMemoryMb: number;
  timeZone: string;
  locale: string;
  icu: string | null;
  nodeOptionsSet: boolean;
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

function readFirst(paths: string[]): string | null {
  for (const p of paths) {
    try {
      return readFileSync(p, "utf8").trim();
    } catch {
      // Try the next location (cgroup v2, then v1).
    }
  }
  return null;
}

/** Memory limit of the container; null for "max" or values that mean "unlimited" (cgroup v1 uses a huge number). */
export function parseMemoryLimit(raw: string | null, totalBytes: number): number | null {
  if (!raw || raw === "max") return null;
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes >= totalBytes) return null;
  return mb(bytes);
}

/** CPU limit from cgroup v2 `cpu.max` ("quota period") or v1 quota/period; null when unlimited. */
export function parseCpuLimit(max: string | null, v1Quota: string | null, v1Period: string | null): number | null {
  const [quota, period] = max ? max.split(/\s+/) : [v1Quota, v1Period];
  if (!quota || !period || quota === "max" || Number(quota) <= 0) return null;
  const limit = Number(quota) / Number(period);
  return Number.isFinite(limit) && limit > 0 ? Math.round(limit * 100) / 100 : null;
}

/** Share of `cores` CPUs that `usedMicros` of CPU time over `elapsedMs` amounts to, in percent. */
export function cpuPercent(usedMicros: number, elapsedMs: number, cores: number): number {
  if (elapsedMs <= 0 || cores <= 0) return 0;
  const share = usedMicros / 1000 / elapsedMs / cores;
  return Math.round(Math.max(0, share) * 1000) / 10;
}

/** Container memory usage from cgroup v2 `memory.current` or v1 `memory.usage_in_bytes`. */
export function parseMemoryUsage(raw: string | null): number | null {
  const bytes = Number(raw);
  return raw && Number.isFinite(bytes) && bytes > 0 ? mb(bytes) : null;
}

/** Where the previous CPU sample was taken; a zero baseline at process start makes the first sample cover its lifetime. */
let lastCpuSample: { usage: NodeJS.CpuUsage; at: number } = { usage: { user: 0, system: 0 }, at: performance.now() - process.uptime() * 1000 };

function sampleCpuPercent(cores: number): number {
  const now = performance.now();
  const elapsedMs = now - lastCpuSample.at;
  // Two samples within a second (two admins loading the page) would mostly measure noise: keep the window.
  if (elapsedMs < 1000) {
    const total = process.cpuUsage();
    return cpuPercent(total.user + total.system, process.uptime() * 1000, cores);
  }
  const delta = process.cpuUsage(lastCpuSample.usage);
  lastCpuSample = { usage: process.cpuUsage(), at: now };
  return cpuPercent(delta.user + delta.system, elapsedMs, cores);
}

export function processRuntime(): ProcessRuntime {
  const mem = process.memoryUsage();
  const total = os.totalmem();
  const intl = Intl.DateTimeFormat().resolvedOptions();
  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  const cpuLimit = parseCpuLimit(
    readFirst(["/sys/fs/cgroup/cpu.max"]),
    readFirst(["/sys/fs/cgroup/cpu/cpu.cfs_quota_us"]),
    readFirst(["/sys/fs/cgroup/cpu/cpu.cfs_period_us"]),
  );
  const loadAverage = os.loadavg().map((v) => Math.round(v * 100) / 100) as [number, number, number];
  return {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    install: existsSync("/.dockerenv") || Boolean(process.env.KEYSTAR_IMAGE_TAG) ? "docker" : "source",
    cpus,
    uptimeSeconds: Math.round(process.uptime()),
    rssMb: mb(mem.rss),
    heapUsedMb: mb(mem.heapUsed),
    totalMemoryMb: mb(total),
    memoryLimitMb: parseMemoryLimit(
      readFirst(["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]),
      total,
    ),
    cpuLimit,
    cpuPercent: sampleCpuPercent(cpuLimit ?? cpus),
    loadAverage: process.platform === "win32" ? null : loadAverage,
    containerMemoryMb: parseMemoryUsage(readFirst(["/sys/fs/cgroup/memory.current", "/sys/fs/cgroup/memory/memory.usage_in_bytes"])),
    freeMemoryMb: mb(os.freemem()),
    timeZone: intl.timeZone,
    locale: intl.locale,
    icu: process.versions.icu ?? null,
    nodeOptionsSet: Boolean(process.env.NODE_OPTIONS),
  };
}
