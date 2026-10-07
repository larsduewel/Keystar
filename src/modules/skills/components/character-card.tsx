import { Brain, GraduationCap, KeyRound } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { skillsQueryString } from "../filters";
import { SKILLS_MANAGE_HREF, SKILLS_REMAP_HREF } from "../module";
import type { QueueRow, SkillCharacter } from "../queries";
import { ATTRIBUTE_NAMES, romanLevel, summarizeQueue, type QueueStatus } from "../queue";
import { Countdown } from "./countdown";
import { QueueHoverProvider } from "./queue-hover";
import { QueueTable } from "./queue-table";
import { QueueTimeline } from "./queue-timeline";

const STATUS_BADGE: Record<QueueStatus, "ok" | "warning" | "pending"> = {
  training: "ok",
  "ending-soon": "warning",
  paused: "pending",
  empty: "warning",
};

/** One character: what is training, when it and the whole queue finish, attributes and the full queue. */
export function SkillCharacterCard({
  character: c,
  queue,
  t,
  f,
  now,
  expanded,
}: {
  character: SkillCharacter;
  queue: QueueRow[];
  t: Messages["skills"];
  f: Formatter;
  now: Date;
  /** Show the full queue open (single character in view). */
  expanded: boolean;
}) {
  const summary = summarizeQueue(queue, now);
  const active = summary.active;
  const nowIso = now.toISOString();
  const synced = c.queueSyncedAt !== null;

  const badge = c.tokenInvalid ? (
    <StatusBadge status="error" label={t.status.revoked} />
  ) : !c.queueEnabled ? (
    <StatusBadge status="skipped" label={t.status.notEnabled} />
  ) : c.queueError ? (
    <StatusBadge status="error" label={t.status.error} />
  ) : synced ? (
    <StatusBadge status={STATUS_BADGE[summary.status]} label={t.status[summary.status]} />
  ) : null;

  return (
    <Glass as="article" className="space-y-4 rounded-2xl px-5 py-4">
      <header className="flex flex-wrap items-center gap-3">
        <Portrait id={c.characterId} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-ink">{c.name}</h2>
            {badge}
          </div>
          <p className="text-xs text-ink-3">
            {c.totalSp !== null && t.card.totalSp(f.integer(c.totalSp))}
            {c.unallocatedSp ? ` · ${t.card.unallocated(f.integer(c.unallocatedSp))}` : ""}
            {!c.isOwn && c.ownerName && c.ownerName !== c.name ? ` · ${t.card.owner(c.ownerName)}` : ""}
          </p>
        </div>
        {c.queueEnabled && summary.endsAt && summary.remainingMs !== null && (
          <div className="text-right">
            <div className="eve-label text-2xs text-ink-3">{t.card.queueLength}</div>
            <Countdown until={summary.endsAt.toISOString()} now={nowIso} className="text-lg font-semibold text-ink" />
            <div className="text-2xs text-ink-3">{f.dateTime(summary.endsAt)}</div>
          </div>
        )}
      </header>

      {!c.queueEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
          <span>{c.tokenInvalid ? t.status.revoked : t.card.notEnabled}</span>
          {c.isOwn && (
            <ButtonLink href={SKILLS_MANAGE_HREF} size="sm" variant="primary">
              <KeyRound className="size-3.5" aria-hidden /> {t.card.enable}
            </ButtonLink>
          )}
        </div>
      ) : !synced ? (
        <p className="text-sm text-ink-3">{t.card.waiting}</p>
      ) : (
        <QueueHoverProvider>
          {active ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <TypeIcon id={active.skillId} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="eve-label text-2xs text-ink-3">{summary.status === "paused" ? t.status.paused : t.card.trainingNow}</div>
                  <div className="font-medium text-ink">
                    {active.skillName ?? active.skillId} {romanLevel(active.finishedLevel)}
                  </div>
                </div>
                {active.finishDate && (
                  <div className="text-right text-xs text-ink-2">
                    <Countdown until={active.finishDate.toISOString()} now={nowIso} className="font-semibold text-ink" />
                    <div className="text-ink-3">{t.card.finishes(f.dateTime(active.finishDate))}</div>
                  </div>
                )}
              </div>
              {summary.activeProgress.fraction !== null && (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-contrast/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(summary.activeProgress.fraction * 100)}
                  aria-label={t.card.trainingNow}
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${summary.activeProgress.fraction * 100}%` }} />
                </div>
              )}
              <QueueTimeline entries={summary.entries} t={t} now={now} className="pt-1" />
              <p className="text-xs text-ink-3">
                {t.card.queued(summary.entries.length)}
                {summary.status === "paused" && ` · ${t.card.pausedHint}`}
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <GraduationCap className="size-4 text-warning" aria-hidden /> {t.card.emptyHint}
            </p>
          )}

          {c.attributes && (
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {ATTRIBUTE_NAMES.map((name) => (
                <div key={name} className="flex gap-1.5">
                  <dt className="text-ink-3">{t.attributes.names[name]}</dt>
                  <dd className="font-medium text-ink">{c.attributes![name]}</dd>
                </div>
              ))}
              <div className="text-ink-3">
                {c.accruedRemapCooldownDate && c.accruedRemapCooldownDate > now
                  ? t.attributes.remapFrom(f.date(c.accruedRemapCooldownDate))
                  : t.attributes.remapAvailable}
                {c.bonusRemaps ? ` · ${t.attributes.bonusRemaps(c.bonusRemaps)}` : ""}
              </div>
              {summary.entries.length > 0 && (
                <Link
                  href={`${SKILLS_REMAP_HREF}?${skillsQueryString({ view: c.isOwn ? "own" : "corp", characters: [c.characterId] })}`}
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Brain className="size-3.5" aria-hidden /> {t.card.remapLink}
                </Link>
              )}
            </dl>
          )}

          {summary.entries.length > 0 && (
            <details open={expanded} className="group">
              <summary className="cursor-pointer text-xs text-accent select-none">{t.card.showQueue(summary.entries.length)}</summary>
              <div className="mt-3 space-y-2">
                <QueueTable entries={summary.entries} t={t} f={f} now={now} />
                <p className="text-2xs text-ink-3">{t.card.staleHint}</p>
              </div>
            </details>
          )}
        </QueueHoverProvider>
      )}
    </Glass>
  );
}
