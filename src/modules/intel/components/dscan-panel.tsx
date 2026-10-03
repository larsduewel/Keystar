import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { RichText } from "@/modules/killboard/components/rich-text";
import { readDscan } from "../ai/template";
import type { StoredNote } from "../ai/types";
import type { DscanMatchRow } from "../dscan";
import { NoteByline } from "./briefing-panel";

const CONFIDENCE_TONE = { likely: "accent", possible: "neutral", guess: "neutral" } as const;

/** Ships on the d-scan and the pilots from this scan who probably fly them. */
export async function DscanPanel({
  rows,
  read: stored,
  pilotNames,
  form,
  actions,
}: {
  rows: DscanMatchRow[] | null;
  read: StoredNote<unknown> | null;
  pilotNames: Map<number, string>;
  form: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { t, f } = await getI18n();
  const d = t.intel.dscan;
  const read = stored ? readDscan(stored, t) : null;
  const ships = rows?.reduce((n, r) => n + r.count, 0) ?? 0;
  return (
    <Panel title={d.title} subtitle={rows ? d.subtitle(ships) : d.empty} actions={actions}>
      <div className="mb-3">{form}</div>
      <p className="mb-3 text-xs text-ink-3">{t.intel.evidence.dscanCaution}</p>
      {rows && rows.length > 0 && (
        <ul className="mb-4 divide-y divide-surface-contrast/6">
          {rows.map((r) => (
            <li key={r.typeId} className="flex flex-wrap items-center gap-3 py-2">
              <TypeIcon id={r.typeId} size={28} className="rounded" />
              <div className="w-44 min-w-0">
                <div className="truncate text-sm font-medium text-ink">
                  {r.count > 1 && <span className="tabular-nums">{f.integer(r.count)}× </span>}
                  {r.name}
                </div>
                <div className="text-xs text-ink-3">{t.intel.hullClasses[r.cls]}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {r.assigned.map((a) => (
                  <span key={a.characterId} className="glass-chip inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-xs">
                    <Portrait id={a.characterId} size={20} />
                    {pilotNames.get(a.characterId) ?? a.characterId}
                    <Badge tone={CONFIDENCE_TONE[a.confidence]}>{t.intel.matchConfidence[a.confidence]}</Badge>
                  </span>
                ))}
                {r.assigned.length < r.count && (
                  <span className="text-xs text-ink-3">{r.assigned.length ? d.unknown(r.count - r.assigned.length) : d.nobody}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && <p className="mb-4 text-sm text-ink-3">{d.noShips}</p>}
      {read && (
        <div className="glass-inset mb-4 rounded-lg px-4 py-3 text-sm text-ink-2">
          <p>
            <RichText text={read.content.assessment} />
          </p>
          {read.content.assignments.some((a) => a.characterId) && (
            <ul className="mt-2 space-y-1 text-xs">
              {read.content.assignments
                .filter((a) => a.characterId)
                .map((a) => (
                  <li key={`${a.typeId}-${a.characterId}`}>
                    <span className="font-medium text-ink">{pilotNames.get(a.characterId!) ?? a.characterId}</span>{" "}
                    <span className="text-ink-3">
                      ({t.intel.matchConfidence[a.confidence]}): {a.reason}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          {read.content.notes && <p className="mt-2 text-xs text-ink-3">{read.content.notes}</p>}
          <NoteByline note={read} verb="read" />
        </div>
      )}
    </Panel>
  );
}
