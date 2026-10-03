import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { tierOf } from "../score/composite";
import { TIER_COLOR } from "../colors";
import { reasonText } from "../text";
import type { DimensionScore, PilotScore, PilotTag, Tier } from "../types";

/** Tier and score, e.g. "High 62"; quick scores (statistics only) are marked. */
export async function ScoreBadge({ score }: { score: PilotScore | null }) {
  if (!score) return null;
  const { t, f } = await getI18n();
  const a = score.assessment;
  const details = a ? `${t.intel.score.capability}: ${a.capability}/100; ${t.intel.score.relevance}: ${a.relevance ?? t.intel.evidence.unknown}; ${t.intel.score.confidence}: ${t.intel.tiers[a.confidence]}; ${t.intel.score.sample}: ${a.sample}. ${t.intel.score.explanation}` : t.intel.score.explanation;
  return (
    <span tabIndex={0} title={details} aria-label={details} className="flex shrink-0 flex-col items-center rounded-md bg-surface-contrast/5 px-2 py-1">
      <span className="text-lg leading-none font-bold tabular-nums" style={{ color: TIER_COLOR[score.tier] }}>{score.tier === "unknown" ? "?" : f.number(score.composite / 10, 1)}</span>
      <span className="mt-0.5 text-3xs font-semibold uppercase text-ink-2">{t.intel.tiers[score.tier]}</span>
    </span>
  );
}

export async function AssessmentSummary({ score }: { score: PilotScore | null }) {
  const { t } = await getI18n();
  const a = score?.assessment;
  if (!a) return null;
  return <div className="space-y-0.5 text-3xs text-ink-3">
    <div>{t.intel.score.capability}: {t.intel.tiers[tierFrom(a.capability)]} · {t.intel.score.relevance}: {a.relevance === null ? t.intel.evidence.unknown : t.intel.tiers[tierFrom(a.relevance)]}</div>
    <div>{t.intel.score.confidence}: {t.intel.tiers[a.confidence]}{a.escalation.length > 0 && <> · {a.escalation.map(tag => t.intel.tags[tag]).join(" · ")}</>}</div>
  </div>;
}
const tierFrom = (value: number): Tier => tierOf(value);

export function ScoreBar({ value, tier, className }: { value: number; tier: Tier | "unknown"; className?: string }) {
  return (
    <div className={cn("h-1 w-16 overflow-hidden rounded-full bg-surface-contrast/8", className)} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, value)}%`, background: TIER_COLOR[tier] }} />
    </div>
  );
}

export async function TagList({ tags, className }: { tags: PilotTag[]; className?: string }) {
  if (!tags.length) return null;
  const { t } = await getI18n();
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {tags.map((tag) => (
        <span key={tag.key} title={tag.evidence === "lifetime" ? t.intel.historic(reasonText(t, tag.why)) : reasonText(t, tag.why)}>
          <Badge
            tone={tag.key === "cyno" || tag.key === "capital" || tag.key === "blops" ? "warning" : "neutral"}
            className={tag.evidence === "lifetime" ? "opacity-55" : undefined}
          >
            {t.intel.tags[tag.label]}
          </Badge>
        </span>
      ))}
    </span>
  );
}

/** Each dimension with its score bar and the reason, so a veteran can check the number. */
export async function DimensionBreakdown({
  dimensions,
  recencyGate,
  columns = 2,
}: {
  dimensions: DimensionScore[];
  recencyGate: number;
  /** Two columns where the breakdown spans the page, one in narrow panels. */
  columns?: 1 | 2;
}) {
  const { t, f } = await getI18n();
  return (
    <div>
      <ul className={cn("grid gap-x-6 gap-y-1.5", columns === 2 && "md:grid-cols-2")}>
        {dimensions.map((d) => (
          <li key={d.key} className={cn("flex items-start gap-3 text-xs", !d.available && "opacity-50")}>
            <span className="w-28 shrink-0 text-ink-2">{t.intel.dimensions[d.key]}</span>
            <span className="mt-1.5 shrink-0">
              <ScoreBar
                value={d.available ? d.score : 0}
                tier={d.score >= 75 ? "extreme" : d.score >= 50 ? "high" : d.score >= 25 ? "moderate" : "low"}
                className="w-12"
              />
            </span>
            <span className="w-7 shrink-0 text-right font-semibold text-ink tabular-nums">{d.available ? f.integer(d.score) : "–"}</span>
            <span className="min-w-0 text-ink-3">{d.evidence === "lifetime" ? t.intel.historic(reasonText(t, d.why)) : reasonText(t, d.why)}</span>
          </li>
        ))}
      </ul>
      {recencyGate < 0.99 && <p className="mt-2 text-xs text-ink-3">{t.intel.score.damped(recencyGate)}</p>}
    </div>
  );
}
