import type { Messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import type { QueueRow } from "../queries";
import { durationParts, queueTimeline, romanLevel } from "../queue";
import { TimelineSegment } from "./queue-hover";

/**
 * The queue as one strip, like the game's training-time bar: each skill takes a slice proportional to the time it
 * still needs, the skill in training first. Ticks below mark days, weeks or months from now. Hovering a slice
 * (or focusing it with the keyboard) highlights its row in the queue table and vice versa (see `QueueHoverProvider`).
 */
export function QueueTimeline({ entries, t, now, className }: { entries: QueueRow[]; t: Messages["skills"]; now: Date; className?: string }) {
  const timeline = queueTimeline(entries, now);
  if (!timeline) return null;
  const { segments, ticks, totalMs } = timeline;
  return (
    <figure className={cn("space-y-1", className)} aria-label={t.timeline.label}>
      <ol className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-contrast/6" role="list">
        {segments.map((s, i) => {
          const name = `${s.entry.skillName ?? s.entry.skillId} ${romanLevel(s.entry.finishedLevel)}`;
          const label = t.timeline.segment(name, t.duration(durationParts(s.remainingMs)));
          return (
            <TimelineSegment
              key={s.entry.queuePosition}
              position={s.entry.queuePosition}
              width={s.width}
              title={label}
              className={i === 0 ? "bg-accent" : i % 2 ? "bg-accent/30" : "bg-accent/50"}
            >
              <span className="sr-only">{label}</span>
            </TimelineSegment>
          );
        })}
      </ol>
      {ticks.length > 0 && (
        <div className="relative h-4 text-2xs text-ink-3 tabular-nums" aria-hidden>
          {ticks.map((tick) => (
            <span
              key={tick.offset}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap border-l border-ink-3/40 pl-1 leading-4"
              style={{ left: `${tick.offset * 100}%` }}
            >
              {t.timeline.tick[tick.unit](tick.count)}
            </span>
          ))}
        </div>
      )}
      <figcaption className="sr-only">{t.timeline.total(t.duration(durationParts(totalMs)))}</figcaption>
    </figure>
  );
}
