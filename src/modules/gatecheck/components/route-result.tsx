import { AlertTriangle, ArrowLeftRight, Ban, ExternalLink, Radio } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/glass";
import { SecurityStatus } from "@/components/ui/security";
import { TypeIcon } from "@/components/ui/eve-image";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mapSystemHref } from "@/modules/map/links";
import type { CheckedKill, FeedHealth, SystemCheck, SystemStatus } from "../check";
import type { GatecheckQuery } from "../params";
import { gatecheckHref } from "../params";
import type { RiskLevel, SystemPrediction } from "../predict";
import type { FeedSummary, GatecheckResult } from "../service";
import type { KillTag } from "../tags";

type T = Messages["gatecheck"];
type Tone = "neutral" | "accent" | "gold" | "good" | "warning" | "critical";

const STATUS_TONE: Record<SystemStatus, Tone> = {
  camp: "critical",
  recent: "warning",
  activity: "gold",
  quiet: "good",
  unknown: "neutral",
};
const LEVEL_TONE: Record<RiskLevel, Tone> = {
  severe: "critical",
  high: "warning",
  moderate: "gold",
  low: "good",
};
const FEED_TONE: Record<FeedHealth, Tone> = {
  fresh: "good",
  delayed: "warning",
  offline: "critical",
};
const KILLS_SHOWN = 5;

const eveTime = (d: Date) => d.toISOString().slice(11, 16);

/** A system is worth a closer look: kills at its route gates or a likely camp. */
export function isHotspot(check: SystemCheck, prediction: SystemPrediction | undefined): boolean {
  return check.status === "camp" || check.status === "recent" || prediction?.level === "high" || prediction?.level === "severe";
}

interface Ctx {
  t: T;
  f: Formatter;
  result: GatecheckResult;
  query: GatecheckQuery;
}

const systemName = (ctx: Ctx, id: number | null) => (id === null ? "" : (ctx.result.systemNames.get(id) ?? String(id)));

export function FeedLine({ feed, t, f, now }: { feed: FeedSummary; t: T; f: Formatter; now: Date }) {
  const text = !feed.caughtUpAt
    ? t.feed.never
    : feed.health === "fresh"
      ? t.feed.fresh(f.relativeTime(feed.caughtUpAt, now))
      : feed.health === "delayed"
        ? t.feed.delayed(f.relativeTime(feed.caughtUpAt, now))
        : t.feed.offline;
  return (
    <div className="space-y-1 text-xs text-ink-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={FEED_TONE[feed.health]}>
          <Radio className="size-3" aria-hidden />
          {text}
        </Badge>
        {feed.coverageSince && <span>{t.feed.coverage(f.dateTime(feed.coverageSince))}</span>}
        {feed.historyDays > 0 && <span>· {t.feed.history(feed.historyDays)}</span>}
      </div>
      <p>{t.feed.delay}</p>
    </div>
  );
}

function TagBadges({ tags, t, counts }: { tags: KillTag[]; t: T; counts?: Partial<Record<KillTag, number>> }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} title={t.tagHints[tag]}>
          <Badge tone={tag === "pod" || tag === "hotdrop" ? "warning" : "critical"}>
            {t.tags[tag]}
            {counts?.[tag] ? ` ×${counts[tag]}` : ""}
          </Badge>
        </span>
      ))}
    </span>
  );
}

function KillLine({ kill, ctx }: { kill: CheckedKill; ctx: Ctx }) {
  const { t, f, result } = ctx;
  const names = result.names;
  const ship = names.types.get(kill.victimShipTypeId)?.name ?? `#${kill.victimShipTypeId}`;
  const victim =
    (kill.victimCharacterId && names.entities.get(kill.victimCharacterId)) ||
    (kill.victimCorporationId && names.entities.get(kill.victimCorporationId)) ||
    null;
  const hulls = new Map<number, number>();
  const groups = new Map<number, number>();
  for (const a of kill.attackers) {
    if (a.shipTypeId) hulls.set(a.shipTypeId, (hulls.get(a.shipTypeId) ?? 0) + 1);
    const g = a.allianceId || a.corporationId;
    if (g) groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  const topHulls = [...hulls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topGroups = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const place = kill.place === "elsewhere" ? t.place.elsewhere : t.place[kill.place](systemName(ctx, kill.gateDestinationId));
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs">
      <span className="w-28 shrink-0 whitespace-nowrap text-ink-3 tabular-nums" title={f.dateTime(kill.time)}>
        {f.relativeTime(kill.time, result.now)}
      </span>
      <TypeIcon id={kill.victimShipTypeId} size={20} className="rounded" />
      <span className="font-medium text-ink">{ship}</span>
      {victim && <span className="text-ink-2">({victim})</span>}
      {kill.value > 0 && <span className="text-ink-3 tabular-nums">{f.isk(kill.value, { compact: true })}</span>}
      <span className="text-ink-3">{place}</span>
      {kill.distanceKm !== null && <span className="text-ink-3">· {t.kill.distance(f.number(kill.distanceKm, 0))}</span>}
      {kill.npc ? (
        <Badge>{kill.tags.includes("gank") ? t.kill.gankLoss : t.kill.npc}</Badge>
      ) : (
        <span className="inline-flex items-center gap-1 text-ink-3">
          {t.kill.by} {t.kill.attackers(kill.attackerCount)}
          {topHulls.map(([id, n]) => (
            <span key={id} className="inline-flex items-center" title={names.types.get(id)?.name}>
              <TypeIcon id={id} size={18} className="rounded" />
              {n > 1 && <span className="text-2xs">×{n}</span>}
            </span>
          ))}
          {topGroups.length > 0 && (
            <span className="text-ink-2">· {topGroups.map(([id]) => names.entities.get(id) ?? `#${id}`).join(", ")}</span>
          )}
        </span>
      )}
      <TagBadges tags={kill.tags.filter((tag) => tag !== "gank" || !kill.npc)} t={t} />
      <a
        href={`https://zkillboard.com/kill/${kill.killmailId}/`}
        target="_blank"
        rel="noreferrer"
        className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"
        aria-label={t.kill.onZkill}
        title={t.kill.onZkill}
      >
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </li>
  );
}

function HourlyStrip({ hourly, etaHour, t }: { hourly: number[]; etaHour: number; t: T }) {
  const max = Math.max(1, ...hourly);
  return (
    <figure className="space-y-1">
      <div className="flex h-8 items-end gap-px" role="img" aria-label={t.prediction.hourly}>
        {hourly.map((v, h) => (
          <div
            key={h}
            title={`${String(h).padStart(2, "0")}:00 · ${v}`}
            className={cn("flex-1 rounded-sm", h === etaHour ? "bg-accent" : v ? "bg-ink-3/60" : "bg-surface-contrast/8")}
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="flex justify-between text-3xs text-ink-3 tabular-nums">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </figcaption>
      <p className="text-2xs text-ink-3">{t.prediction.hourly}</p>
    </figure>
  );
}

function PredictionDetails({ p, ctx }: { p: SystemPrediction; ctx: Ctx }) {
  const { t, f, result } = ctx;
  const names = result.names;
  const confidence = p.confidence === "none" ? t.prediction.confidence.none : t.prediction.confidence[p.confidence](p.historyDays);
  return (
    <div className="mt-2 grid gap-4 rounded-lg bg-surface-contrast/4 p-3 lg:grid-cols-2">
      <div className="space-y-2 text-xs text-ink-2">
        <ul className="space-y-1">
          {p.historyDays > 0 && (
            <li>
              {p.campDays ? t.prediction.history(p.activeDays, p.historyDays) : t.prediction.quietHistory}
              {p.campDays > 0 && <span className="text-ink-3"> · {t.prediction.campDays(p.campDays, p.historyDays)}</span>}
            </li>
          )}
          {result.check.systems[p.index]?.lastRouteKill && (
            <li>{t.prediction.live(f.relativeTime(result.check.systems[p.index].lastRouteKill!, result.now))}</li>
          )}
          {p.sightings.length > 0 && <li>{t.prediction.regulars(p.sightings.length)}</li>}
        </ul>
        <p className="text-ink-3">{confidence}</p>
        {p.historyDays > 0 && p.campDays > 0 && <HourlyStrip hourly={p.hourly} etaHour={p.eta.getUTCHours()} t={t} />}
        {Object.keys(p.tagCounts).length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-3">{t.prediction.tagHistory}:</span>
            <TagBadges tags={Object.keys(p.tagCounts) as KillTag[]} counts={p.tagCounts} t={t} />
          </div>
        )}
      </div>
      <div className="space-y-3 text-xs">
        {p.regulars.length > 0 && (
          <div>
            <h4 className="eve-label mb-1 text-2xs text-ink-3">{t.prediction.regularsTitle}</h4>
            <ul className="space-y-1">
              {p.regulars.map((r) => {
                const seen = p.sightings.find((s) => s.characterId === r.characterId);
                const group =
                  (r.allianceId && names.entities.get(r.allianceId)) || (r.corporationId && names.entities.get(r.corporationId)) || "";
                return (
                  <li key={r.characterId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <a
                      href={`https://zkillboard.com/character/${r.characterId}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink hover:text-accent"
                    >
                      {names.entities.get(r.characterId) ?? `#${r.characterId}`}
                    </a>
                    {group && <span className="text-ink-3">{group}</span>}
                    {r.shipTypeIds.map((id) => (
                      <span key={id} title={names.types.get(id)?.name}>
                        <TypeIcon id={id} size={16} className="rounded" />
                      </span>
                    ))}
                    <span className="text-ink-3">
                      {t.prediction.regular(r.days, r.kills)} ·{" "}
                      {t.prediction.regularHours(r.hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", "))} ·{" "}
                      {t.prediction.lastSeen(f.relativeTime(r.lastSeen, result.now))}
                    </span>
                    {r.nearEta && <Badge tone="warning">{t.prediction.nearEta}</Badge>}
                    {seen && (
                      <Badge tone="critical">
                        {t.prediction.sighting(systemName(ctx, seen.systemId), seen.jumps, f.relativeTime(seen.time, result.now))}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {p.groups.length > 0 && (
          <div>
            <h4 className="eve-label mb-1 text-2xs text-ink-3">{t.prediction.groupsTitle}</h4>
            <p className="text-ink-2">
              {p.groups.map((g) => `${names.entities.get(g.id) ?? `#${g.id}`} (${f.integer(g.kills)})`).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SystemRow({ check, prediction, ctx }: { check: SystemCheck; prediction: SystemPrediction | undefined; ctx: Ctx }) {
  const { t, f, result, query } = ctx;
  const name = systemName(ctx, check.systemId);
  const region = result.regions.get(check.systemId);
  const endpoint = check.index === 0 || check.index === result.check.systems.length - 1;
  const hot = isHotspot(check, prediction);
  const shown = check.routeKills.slice(0, KILLS_SHOWN);
  const elsewhere = check.otherKills.filter((k) => !k.npc).length;
  const avoidList = [query.avoid, name].filter(Boolean).join(", ");
  const interesting =
    check.routeKills.length > 0 ||
    (prediction && (prediction.level !== "low" || prediction.regulars.length > 0 || prediction.campDays > 0));
  return (
    <li
      id={`sys-${check.systemId}`}
      className={cn(
        "scroll-mt-20 rounded-lg px-3 py-2",
        check.status === "camp" ? "bg-critical/8 ring-1 ring-critical/30" : hot ? "bg-warning/6" : "bg-surface-contrast/3",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-6 text-right text-xs text-ink-3 tabular-nums">{check.index}</span>
        <Link href={mapSystemHref(check.systemId)} className="font-medium text-ink hover:text-accent">
          {name}
        </Link>
        <SecurityStatus value={check.security} />
        {region && <span className="text-xs text-ink-3">{region}</span>}
        {prediction && (
          <span className="text-xs text-ink-3 tabular-nums" title={f.dateTime(prediction.eta)}>
            {eveTime(prediction.eta)} {t.summary.eta}
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <span title={check.status === "recent" ? t.statusHint.recent(result.check.windowHours) : t.statusHint[check.status]}>
            <Badge tone={STATUS_TONE[check.status]}>
              {check.status === "camp" && <AlertTriangle className="size-3" aria-hidden />}
              {t.status[check.status]}
            </Badge>
          </span>
          {prediction && (
            <span
              title={`${t.prediction.factors}: ${f.percent(prediction.factors.history, 0)} · ${f.percent(prediction.factors.live, 0)} · ${f.percent(prediction.factors.regulars, 0)}`}
            >
              <Badge tone={LEVEL_TONE[prediction.level]}>
                {t.prediction.level[prediction.level]} · {f.percent(prediction.chance, 0)}
              </Badge>
            </span>
          )}
          {!endpoint && (
            <Link
              href={gatecheckHref(query, { avoid: avoidList })}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-ink-3 hover:bg-surface-contrast/6 hover:text-ink"
              title={t.summary.avoidTitle(name)}
            >
              <Ban className="size-3" aria-hidden />
              {t.summary.avoid}
            </Link>
          )}
        </span>
      </div>
      {check.routeTags.length > 0 && (
        <div className="mt-1 pl-9">
          <TagBadges tags={check.routeTags} t={t} />
        </div>
      )}
      {shown.length > 0 && (
        <ul className="mt-1 divide-y divide-surface-contrast/6 pl-9">
          {shown.map((k) => (
            <KillLine key={k.killmailId} kill={k} ctx={ctx} />
          ))}
          {check.routeKills.length > shown.length && (
            <li className="py-1 text-xs text-ink-3">{t.kill.more(check.routeKills.length - shown.length)}</li>
          )}
        </ul>
      )}
      {(elsewhere > 0 || check.npcKills > 0) && (
        <p className="mt-1 pl-9 text-xs text-ink-3">
          {[elsewhere > 0 ? t.kill.otherKills(elsewhere) : null, check.npcKills > 0 ? t.kill.npcKills(check.npcKills) : null]
            .filter(Boolean)
            .join(" · ")}
          {check.systemTags.some((tag) => !check.routeTags.includes(tag)) && (
            <span className="ml-2">
              <TagBadges tags={check.systemTags.filter((tag) => !check.routeTags.includes(tag))} t={t} />
            </span>
          )}
        </p>
      )}
      {prediction && interesting && (
        <details className="mt-1 pl-9" open={hot}>
          <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">{t.prediction.title}</summary>
          <PredictionDetails p={prediction} ctx={ctx} />
        </details>
      )}
    </li>
  );
}

export function RouteSummary({ result, query, t, f }: Ctx) {
  const ctx: Ctx = { result, query, t, f };
  const route = result.route ?? [];
  const hotspots = result.check.systems.filter((s) => isHotspot(s, result.predictions[s.index]));
  const arrival = result.etas[result.etas.length - 1];
  return (
    <Panel
      title={t.summary.route}
      actions={
        <Link
          href={gatecheckHref(query, { from: query.to, to: query.from })}
          className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"
        >
          <ArrowLeftRight className="size-3.5" aria-hidden />
          {t.form.swap}
        </Link>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <span className="text-2xl font-semibold text-ink">{t.summary.jumps(route.length - 1)}</span>
        <span className="text-ink-2">{t.summary.mix(result.mix.high, result.mix.low, result.mix.null)}</span>
        <span className="text-ink-2">{arrival && `${t.summary.arrival} ${eveTime(arrival)} ${t.summary.eta}`}</span>
        {result.resolved.avoid.length > 0 && (
          <span className="text-ink-3">{t.summary.avoiding(result.resolved.avoid.map((s) => s.name))}</span>
        )}
      </div>
      <h3 className="eve-label mt-4 mb-2 text-2xs text-ink-3">{t.summary.hotspots}</h3>
      {hotspots.length ? (
        <ul className="flex flex-wrap gap-2">
          {hotspots.map((s) => {
            const p = result.predictions[s.index];
            return (
              <li key={s.systemId}>
                <a
                  href={`#sys-${s.systemId}`}
                  className="glass-chip inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink hover:text-accent"
                >
                  <span className="font-medium">{systemName(ctx, s.systemId)}</span>
                  <Badge tone={STATUS_TONE[s.status]}>{t.status[s.status]}</Badge>
                  {p && <Badge tone={LEVEL_TONE[p.level]}>{f.percent(p.chance, 0)}</Badge>}
                  <TagBadges tags={s.routeTags} t={t} />
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-ink-2">{t.summary.noHotspots}</p>
      )}
    </Panel>
  );
}

export function RouteSystems({ result, query, t, f }: Ctx) {
  const ctx: Ctx = { result, query, t, f };
  return (
    <Panel title={t.summary.route} subtitle={t.prediction.disclaimer}>
      <ol className="space-y-1.5">
        {result.check.systems.map((s) => (
          <SystemRow key={s.systemId} check={s} prediction={result.predictions[s.index]} ctx={ctx} />
        ))}
      </ol>
    </Panel>
  );
}
