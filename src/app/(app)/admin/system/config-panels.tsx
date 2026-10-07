import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-button";
import { Panel } from "@/components/ui/glass";
import type { ConfigEntry } from "@/core/system/config";
import { issueSearchUrl } from "@/core/system/summary";
import { getI18n } from "@/i18n/server";
import { OpenDialogButton, PrivacyNote } from "./system-dialogs";

/** The System page's configuration table and the "getting help" steps. */

/** The CLI fallback for when the web app doesn't start; `--no-deps` because the worker service waits for a healthy app. */
const CLI_COMMAND = "docker compose run --rm --no-deps -T worker node dist/support.mjs > keystar-support.json";
export const LOGS_COMMAND = "docker compose logs --since 1h app worker > keystar-logs.txt";

export async function ConfigPanel({ entries, appUrlMatchesOrigin }: { entries: ConfigEntry[]; appUrlMatchesOrigin: boolean | null }) {
  const { t } = await getI18n();
  const tc = t.admin.system.config;
  return (
    <Panel title={tc.title} subtitle={tc.subtitle}>
      <div className="glass-inset overflow-x-auto rounded-lg">
        <table className="ks-table">
          <thead>
            <tr>
              <th scope="col">{tc.columns.variable}</th>
              <th scope="col">{tc.columns.status}</th>
              <th scope="col">{tc.columns.value}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((c) => (
              <tr key={c.name}>
                <td>
                  <code className="text-xs">{c.name}</code>
                </td>
                <td>
                  <Badge tone={c.state === "set" ? "good" : "neutral"}>{tc.states[c.state]}</Badge>
                </td>
                <td className="text-ink-2">
                  <ConfigValue entry={c} matches={appUrlMatchesOrigin} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function ConfigValue({ entry, matches }: { entry: ConfigEntry; matches: boolean | null }) {
  const { t } = await getI18n();
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

export async function HelpPanel({ sourceUrl }: { sourceUrl: string }) {
  const { t } = await getI18n();
  const ts = t.admin.system;
  return (
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
