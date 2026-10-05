import { en } from "@/i18n/messages/en";
import { HEARTBEAT_FRESH_MS, type CheckResult } from "./checks";
import type { SystemSnapshot } from "./collect";

/**
 * Short Markdown summary for a GitHub issue. Always English, whatever the
 * viewer's language, so maintainers can read every report. Check texts come
 * from the English dictionary; the frame below is a report format, not UI.
 */
export function issueSummary(s: SystemSnapshot, checks: CheckResult[], now = Date.now()): string {
  const db = s.database.ok ? s.database.data : null;
  const beat = s.worker.ok ? s.worker.data.heartbeats[0] : undefined;
  const install =
    s.runtime.install === "docker"
      ? s.build.imageTag
        ? `Docker image :${s.build.imageTag}`
        : "Docker (own build)"
      : "from source";
  const drift = db ? db.drift.missingTables.length + db.drift.missingColumns.length : 0;
  const lines = [
    "### System summary",
    `- Keystar **${s.build.version}**${s.build.commit ? ` (${s.build.commit.slice(0, 7)})` : ""}, ${install}`,
    `- Node ${s.runtime.node} · PostgreSQL ${db?.serverVersion.split(" ")[0] ?? "unreachable"}`,
  ];
  if (db) {
    const m = db.migrations;
    lines.push(`- Migrations ${m.applied}/${m.bundled ?? "?"}${drift ? ` · ${drift} missing tables/columns` : " · no schema drift"}`);
  }
  if (beat) {
    const seconds = Math.round((now - Date.parse(beat.lastBeatAt)) / 1000);
    const stale = now - Date.parse(beat.lastBeatAt) >= HEARTBEAT_FRESH_MS;
    lines.push(`- Worker ${beat.version ?? "?"}, heartbeat ${seconds} s ago${stale ? " (stopped)" : ""}`);
  } else if (s.worker.ok) {
    lines.push("- No worker heartbeat");
  }
  if (s.demoMode) lines.push("- Demo mode");

  const problems = checks.filter((c) => c.status === "warn" || c.status === "fail");
  lines.push("");
  if (problems.length) {
    lines.push("**Problems**");
    for (const p of problems) {
      const check = en.admin.system.checks[p.id];
      lines.push(`- ${p.status === "fail" ? "✖" : "⚠"} ${check.label}: ${check.detail(p.status, p.values)}`);
    }
  } else {
    lines.push("All health checks passed.");
  }
  lines.push("", "_Support package attached._");
  return lines.join("\n");
}

/** GitHub's new-issue URL with the bug report form's version and system fields filled in. */
export function bugReportUrl(sourceUrl: string, version: string, summary: string): string {
  const params = new URLSearchParams({ template: "bug_report.yml", version, system: summary });
  return `${sourceUrl.replace(/\/+$/, "")}/issues/new?${params}`;
}

export function issueSearchUrl(sourceUrl: string, query = ""): string {
  const params = new URLSearchParams({ q: `is:issue ${query}`.trim() });
  return `${sourceUrl.replace(/\/+$/, "")}/issues?${params}`;
}
