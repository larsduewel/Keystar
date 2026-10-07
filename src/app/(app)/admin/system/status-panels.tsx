import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Glass, Panel } from "@/components/ui/glass";
import { isRefused, worstStatus, type CheckResult, type CheckStatus } from "@/core/system/checks";
import type { NetworkProbe } from "@/core/system/network";
import { getI18n } from "@/i18n/server";
import { OpenDialogButton, RecheckButton } from "./system-dialogs";

/** The System page's health panels: the overall verdict, every check, and the network probes. */

const statusTone = { ok: "good", warn: "warning", fail: "critical", skip: "neutral" } as const;
const statusIcon: Record<CheckStatus, ReactNode> = {
  ok: <CheckCircle2 className="size-3" aria-hidden />,
  warn: <AlertTriangle className="size-3" aria-hidden />,
  fail: <XCircle className="size-3" aria-hidden />,
  skip: <CircleDashed className="size-3" aria-hidden />,
};

/** One line verdict over all checks, with the next step (report an issue) or a re-check. */
export async function OverallStatus({ checks }: { checks: CheckResult[] }) {
  const { t } = await getI18n();
  const ts = t.admin.system;
  const problems = checks.filter((c) => c.status === "warn" || c.status === "fail");
  const failed = problems.filter((c) => c.status === "fail").length;
  const overall = worstStatus(checks);
  return (
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
  );
}

export async function ChecksPanel({ checks }: { checks: CheckResult[] }) {
  const { t } = await getI18n();
  const ts = t.admin.system;
  return (
    <Panel title={ts.checksTitle} subtitle={ts.checksSubtitle}>
      <ul className="grid gap-2 lg:grid-cols-2">
        {checks.map((c) => (
          <li key={c.id} className="glass-inset flex items-start gap-3 rounded-lg px-3.5 py-3">
            <Badge tone={statusTone[c.status]} className="mt-px">
              {statusIcon[c.status]} {ts.status[c.status]}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{ts.checks[c.id].label}</div>
              <div className="text-xs text-ink-3">{ts.checks[c.id].detail(c.status, c.values)}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** zKillboard being down is a warning, the EVE services being down is a failure. */
function probeStatus(p: NetworkProbe): CheckStatus {
  if (!p.reachable) return p.target === "zkill" ? "warn" : "fail";
  return isRefused(p.target, p.status) ? "warn" : "ok";
}

export async function NetworkPanel({ probes }: { probes: NetworkProbe[] }) {
  const { t, f } = await getI18n();
  const ts = t.admin.system;
  return (
    <Panel title={ts.network.title} subtitle={ts.network.subtitle}>
      <ul className="grid gap-2 md:grid-cols-3">
        {probes.map((p) => {
          const status = probeStatus(p);
          return (
            <li key={p.target} className="glass-inset flex items-start gap-3 rounded-lg px-3.5 py-3">
              <Badge tone={statusTone[status]} className="mt-px">
                {statusIcon[status]}
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
  );
}
