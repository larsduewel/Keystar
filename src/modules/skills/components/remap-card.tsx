import { Brain, Info, KeyRound, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { SKILLS_MANAGE_HREF } from "../module";
import type { QueueRow, SkillCharacter } from "../queries";
import { ATTRIBUTE_NAMES, durationParts, summarizeQueue, type SkillTrainingAttributes } from "../queue";
import { isShortQueue, optimizeRemap, remapAvailability, type AttributeSet } from "../remap";

/** One character: the remap that trains its queue the fastest, compared with its attributes now. */
export function RemapCard({
  character: c,
  queue,
  skillAttributes,
  implants,
  implantsShared,
  t,
  f,
  now,
}: {
  character: SkillCharacter;
  queue: QueueRow[];
  skillAttributes: Map<number, SkillTrainingAttributes>;
  /** Summed implant bonuses; null when unknown. */
  implants: AttributeSet | null;
  /** The token holds the implants scope (characters that shared before it was added don't). */
  implantsShared: boolean;
  t: Messages["skills"];
  f: Formatter;
  now: Date;
}) {
  const r = t.remap;
  const duration = (minutes: number) => t.duration(durationParts(minutes * 60_000));
  const header = (
    <header className="flex flex-wrap items-center gap-3">
      <Portrait id={c.characterId} size={40} />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-ink">{c.name}</h2>
        {!c.isOwn && c.ownerName && c.ownerName !== c.name && <p className="text-xs text-ink-3">{t.card.owner(c.ownerName)}</p>}
      </div>
    </header>
  );

  const notice = (text: string) => (
    <Glass as="article" className="space-y-3 rounded-2xl px-5 py-4">
      {header}
      <p className="text-sm text-ink-2">{text}</p>
    </Glass>
  );
  if (!c.queueEnabled || !c.skillsEnabled) return notice(c.tokenInvalid ? t.status.revoked : r.notes.notShared);
  if (!c.attributes || !c.queueSyncedAt) return notice(r.notes.waiting);

  const summary = summarizeQueue(queue, now);
  if (!summary.entries.length) return notice(r.notes.empty);

  const result = optimizeRemap({ entries: queue, skillAttributes, effective: c.attributes, implants, now });
  if (!result.countedEntries) return notice(r.notes.unknownEntries(result.unknownEntries));

  const availability = remapAvailability(c, now);
  const recommended = result.recommendedBase;
  // Without a recommendation, the warning is about the queue as it trains now.
  const queueMinutes = result.recommendedMinutes ?? result.currentMinutes;
  const short = isShortQueue(queueMinutes);
  const notes: string[] = [];
  if (summary.status === "paused") notes.push(r.notes.paused);
  if (result.unknownEntries) notes.push(r.notes.unknownEntries(result.unknownEntries));
  if (!result.comparable) {
    const total = f.integer(ATTRIBUTE_NAMES.reduce((sum, n) => sum + c.attributes![n], 0));
    // Why the base attributes aren't known decides what the pilot can do about it.
    notes.push(
      !implantsShared
        ? r.notes.notComparable(total)
        : implants === null
          ? r.notes.notComparableWaiting(total)
          : r.notes.notComparableStale(total),
    );
  } else if (!implantsShared) notes.push(r.notes.implantsNotShared);
  else if (implants === null) notes.push(r.notes.implantsWaiting);
  else if (result.implantsUncertain) notes.push(r.notes.implantsUncertain);

  return (
    <Glass as="article" className="space-y-4 rounded-2xl px-5 py-4">
      {header}

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={r.queueNow} value={duration(result.currentMinutes)} />
        {result.recommendedMinutes !== null && result.savedMinutes !== null && (
          <>
            <Figure label={r.queueAfter} value={duration(result.recommendedMinutes)} />
            <Figure label={r.saved} value={result.optimal ? "—" : duration(result.savedMinutes)} accent={!result.optimal} />
          </>
        )}
      </div>

      {short && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 glass-inset px-4 py-3" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 text-sm text-ink-2">
            <p className="font-semibold text-ink">{r.shortQueue.title}</p>
            <p className="mt-0.5 text-xs">
              {recommended ? r.shortQueue.body(duration(queueMinutes)) : r.shortQueue.bodyCurrent(duration(queueMinutes))}
            </p>
          </div>
        </div>
      )}

      {result.optimal ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Brain className="size-4 text-accent" aria-hidden /> {r.optimal}
        </p>
      ) : null}

      {recommended && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{r.title}</caption>
            <thead>
              <tr className="text-left text-2xs text-ink-3">
                <th scope="col" className="eve-label py-1 pr-3 font-normal">
                  {r.columns.attribute}
                </th>
                <th scope="col" className="eve-label py-1 pr-3 text-right font-normal">
                  {r.columns.current}
                </th>
                <th scope="col" className="eve-label py-1 pr-3 text-right font-normal">
                  {r.columns.recommended}
                </th>
                <th scope="col" className="eve-label py-1 text-right font-normal">
                  {r.columns.implants}
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ATTRIBUTE_NAMES.map((name) => {
                const delta = recommended[name] - result.currentBase[name];
                return (
                  <tr key={name} className="border-t border-surface-contrast/8">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">
                      {t.attributes.names[name]}
                    </th>
                    <td className="py-1.5 pr-3 text-right text-ink-2">{f.integer(result.currentBase[name])}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold text-ink">
                      {f.integer(recommended[name])}
                      {delta !== 0 && (
                        <span className={delta > 0 ? "ml-1.5 text-xs text-good-text" : "ml-1.5 text-xs text-ink-3"}>
                          {delta > 0 ? `+${f.integer(delta)}` : `−${f.integer(-delta)}`}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-ink-3">{result.implants[name] ? `+${f.integer(result.implants[name])}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {availability.yearlyAvailable ? (
          <StatusBadge status="ok" label={r.availability.now} />
        ) : (
          <StatusBadge
            status={availability.available ? "pending" : "warning"}
            label={r.availability.yearlyFrom(f.date(availability.yearlyAt!))}
          />
        )}
        {availability.bonusRemaps > 0 && <StatusBadge status="ok" label={r.availability.bonus(availability.bonusRemaps)} />}
        {!availability.available && <span className="text-ink-3">{r.availability.none(f.date(availability.yearlyAt!))}</span>}
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-3">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {note}
            </li>
          ))}
        </ul>
      )}
      {!implantsShared && c.isOwn && (
        <ButtonLink href={SKILLS_MANAGE_HREF} size="sm">
          <KeyRound className="size-3.5" aria-hidden /> {r.notes.includeImplants}
        </ButtonLink>
      )}

      {recommended && !result.optimal && <p className="text-2xs text-ink-3">{r.howTo}</p>}
    </Glass>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl glass-inset px-3 py-2">
      <div className="eve-label text-2xs text-ink-3">{label}</div>
      <div className={accent ? "text-lg font-semibold text-good-text" : "text-lg font-semibold text-ink"}>{value}</div>
    </div>
  );
}
