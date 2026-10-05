import { ChevronLeft, ChevronRight, CircleHelp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { SecurityStatus } from "@/components/ui/security";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { jobProgress, type IndustryActivity } from "../activities";
import type { IndustryJob } from "../queries";
import { JobProgress } from "./job-progress";

const ACTIVITY_TONE: Record<IndustryActivity, "accent" | "gold" | "neutral" | "good"> = {
  manufacturing: "accent",
  reaction: "accent",
  te_research: "gold",
  me_research: "gold",
  copying: "neutral",
  invention: "good",
  other: "neutral",
};

/** The jobs of one page as a table: who, what, where, how far along, and when it ends. */
export function JobsTable({
  jobs,
  t,
  f,
  now,
  page,
  pages,
  pageLink,
  showCharacter,
}: {
  jobs: IndustryJob[];
  t: Messages["industry"];
  f: Formatter;
  now: Date;
  page: number;
  pages: number;
  pageLink: (page: number) => string;
  showCharacter: boolean;
}) {
  const nowIso = now.toISOString();
  return (
    <Glass className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="ks-table">
          <thead>
            <tr>
              {showCharacter && <th>{t.table.character}</th>}
              <th>{t.table.job}</th>
              <th className="num">{t.table.runs}</th>
              <th>{t.table.location}</th>
              <th>{t.table.progress}</th>
              <th>{t.table.ends}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const p = jobProgress(j, now);
              return (
                <tr key={j.jobId} className={cn(p.phase === "finished" && "text-ink-2")}>
                  {showCharacter && (
                    <td>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Portrait id={j.characterId} size={22} /> {j.characterName}
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="flex items-center gap-2.5">
                      <TypeIcon id={j.productTypeId ?? j.blueprintTypeId} size={28} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-ink" title={j.blueprintName ?? String(j.blueprintTypeId)}>
                            {j.blueprintName ?? j.blueprintTypeId}
                          </span>
                          <span title={t.activities[j.activity]} className="shrink-0">
                            <Badge tone={ACTIVITY_TONE[j.activity]} className="whitespace-nowrap">
                              {t.activityShort[j.activity]}
                            </Badge>
                          </span>
                        </div>
                        <div className="truncate text-2xs text-ink-3">
                          {j.productTypeId ? (
                            <>
                              {t.table.productArrow} {j.productName ?? j.productTypeId}
                              {j.probability !== null && j.probability < 1 && <span className="ml-2">{t.table.probability(f.percent(j.probability, 0))}</span>}
                            </>
                          ) : (
                            t.activities[j.activity]
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num tabular-nums">
                    {j.successfulRuns !== null && j.status === "delivered" ? t.table.runsOf(j.successfulRuns, j.runs) : f.integer(j.runs)}
                  </td>
                  <td>
                    <span className="flex max-w-48 flex-col">
                      <span className="truncate" title={j.locationName ?? undefined}>
                        {j.locationName ?? (
                          <span className="flex items-center gap-1 text-ink-3" title={t.table.noLocationHint}>
                            {t.table.noLocation} <CircleHelp className="size-3.5" aria-hidden />
                          </span>
                        )}
                      </span>
                      {j.systemName && (
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-2xs text-ink-3">
                          <SecurityStatus value={j.security} /> {j.systemName}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    {p.phase === "finished" ? (
                      <span className="text-xs text-ink-3">{t.statuses[j.status]}</span>
                    ) : (
                      <JobProgress
                        status={j.status}
                        start={j.startDate.toISOString()}
                        end={j.endDate.toISOString()}
                        pause={j.pauseDate?.toISOString() ?? null}
                        now={nowIso}
                      />
                    )}
                  </td>
                  <td className="text-ink-2">
                    <div className="whitespace-nowrap">{f.dateTime(j.completedDate ?? j.endDate)}</div>
                    {p.phase === "finished" && j.completedDate && (
                      <div className="whitespace-nowrap text-2xs text-ink-3">{t.table.ago(f.relativeTime(j.completedDate, now))}</div>
                    )}
                    <div className="whitespace-nowrap text-2xs text-ink-3" title={t.table.cost}>
                      {j.cost ? f.isk(j.cost, { compact: true }) : "—"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-end gap-2 border-t border-surface-contrast/6 px-5 py-3" aria-label={t.table.pageOf(page, pages)}>
          <span className="mr-auto text-xs text-ink-3">{t.table.pageOf(page, pages)}</span>
          <Link
            href={pageLink(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn("glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs", page <= 1 && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="size-4" aria-hidden /> {t.table.previous}
          </Link>
          <Link
            href={pageLink(Math.min(pages, page + 1))}
            aria-disabled={page >= pages}
            className={cn("glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs", page >= pages && "pointer-events-none opacity-40")}
          >
            {t.table.next} <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      )}
    </Glass>
  );
}
