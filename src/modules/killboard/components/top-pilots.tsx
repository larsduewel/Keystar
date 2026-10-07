import { Crosshair, Crown, Gem, Swords, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Portrait } from "@/components/ui/eve-image";
import type { Messages } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { zkillCharacter } from "../links";
import { efficiency, type PilotRow } from "../queries";

/** Pilots needing at least this many kills to win "best efficiency". */
const MIN_KILLS_FOR_EFFICIENCY = 5;

const name = (p: PilotRow, t: Messages) => p.name ?? t.killboard.fallback.character(p.characterId);

function PilotLink({ pilot, className, children }: { pilot: PilotRow; className?: string; children: ReactNode }) {
  return (
    <a href={zkillCharacter(pilot.characterId)} target="_blank" rel="noopener noreferrer" className={cn("hover:text-accent", className)}>
      {children}
    </a>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="eve-label text-2xs whitespace-nowrap text-ink-3">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "good" ? "text-good-text" : tone === "bad" ? "text-critical-text" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The pilot with the most kills in the period, with a large portrait. "lg" sits
 * the stats beside the portrait; "md" (narrow columns) puts them underneath.
 */
export async function MvpCard({ pilot, period, size = "lg" }: { pilot: PilotRow; period: string; size?: "lg" | "md" }) {
  const { t, f } = await getI18n();
  const eff = efficiency(pilot.destroyed, pilot.lost);
  const net = pilot.destroyed - pilot.lost;
  const portrait = (
    <div className="relative shrink-0">
      <Portrait id={pilot.characterId} size={size === "lg" ? 128 : 88} className="ring-2 ring-gold/70" alt={name(pilot, t)} />
      <span className="absolute -bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-3xs font-bold tracking-wider text-space-950 shadow">
        <Crown className="size-3" aria-hidden /> {t.killboard.topPilots.mvp}
      </span>
    </div>
  );
  const title = (
    <div className="min-w-0">
      <div className="eve-label text-2xs text-gold">{t.killboard.topPilots.mostKills(period)}</div>
      <PilotLink pilot={pilot} className="mt-1 block truncate text-2xl font-semibold tracking-tight text-ink">
        {name(pilot, t)}
      </PilotLink>
    </div>
  );
  const stats = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Stat label={t.killboard.terms.kills} value={f.integer(pilot.kills)} />
      <Stat label={t.killboard.terms.finalBlows} value={f.integer(pilot.finalBlows)} />
      <Stat label={t.killboard.terms.solo} value={f.integer(pilot.solo)} />
      <Stat label={t.killboard.terms.destroyed} value={f.compact(pilot.destroyed)} />
      <Stat label={t.killboard.topPilots.efficiency} value={eff === null ? "—" : f.percent(eff, 1)} />
      <Stat
        label={t.killboard.terms.netIsk}
        value={`${net >= 0 ? "+" : "−"}${f.compact(Math.abs(net))}`}
        tone={net >= 0 ? "good" : "bad"}
      />
    </div>
  );
  const frame =
    "relative overflow-hidden rounded-xl border border-gold/25 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(242,185,80,0.14),transparent_60%)] p-5";

  if (size === "md") {
    return (
      <div className={frame}>
        <div className="flex items-center gap-4">
          {portrait}
          {title}
        </div>
        <div className="mt-5">{stats}</div>
      </div>
    );
  }
  return (
    <div className={cn(frame, "flex flex-col gap-5 sm:flex-row sm:items-center")}>
      <div className="self-start sm:self-center">{portrait}</div>
      <div className="min-w-0 flex-1">
        {title}
        <div className="mt-4">{stats}</div>
      </div>
    </div>
  );
}

/** Places 2–N as a ranked list with portraits. */
export async function RunnersUp({ pilots, start = 2 }: { pilots: PilotRow[]; start?: number }) {
  if (!pilots.length) return null;
  const { t, f } = await getI18n();
  return (
    <ol className="space-y-1.5">
      {pilots.map((p, i) => (
        <li key={p.characterId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-contrast/[0.04]">
          <span className="w-5 text-right text-sm font-semibold text-ink-3 tabular-nums">{f.integer(start + i)}</span>
          <Portrait id={p.characterId} size={44} />
          <div className="min-w-0 flex-1">
            <PilotLink pilot={p} className="block truncate text-sm font-medium text-ink">
              {name(p, t)}
            </PilotLink>
            <div className="text-xs text-ink-3 tabular-nums">
              {t.killboard.topPilots.runnerUp(p.finalBlows, f.compact(p.destroyed))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums">{f.integer(p.kills)}</div>
            <div className="text-2xs text-ink-3">{t.killboard.topPilots.killsUnit(p.kills)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

type AwardKind = keyof Messages["killboard"]["topPilots"]["awards"];

interface Award {
  kind: AwardKind;
  icon: typeof Crown;
  pilot: PilotRow;
  value: string;
}

export function awardsFor(pilots: PilotRow[], f: Formatter): Award[] {
  const best = (rows: PilotRow[], score: (p: PilotRow) => number): PilotRow | null =>
    rows.reduce<PilotRow | null>((top, p) => (score(p) > 0 && (!top || score(p) > score(top)) ? p : top), null);
  const awards: Award[] = [];
  const isk = best(pilots, (p) => p.destroyed);
  if (isk) awards.push({ kind: "isk", icon: Gem, pilot: isk, value: `${f.compact(isk.destroyed)} ISK` });
  const fb = best(pilots, (p) => p.finalBlows);
  if (fb) awards.push({ kind: "finalBlows", icon: Crosshair, pilot: fb, value: f.integer(fb.finalBlows) });
  const solo = best(pilots, (p) => p.solo);
  if (solo) awards.push({ kind: "solo", icon: Swords, pilot: solo, value: f.integer(solo.solo) });
  const eligible = pilots.filter((p) => p.kills >= MIN_KILLS_FOR_EFFICIENCY);
  const eff = best(eligible, (p) => efficiency(p.destroyed, p.lost) ?? 0);
  if (eff) {
    awards.push({ kind: "efficiency", icon: Target, pilot: eff, value: f.percent(efficiency(eff.destroyed, eff.lost) ?? 0, 1) });
  }
  return awards;
}

export async function Awards({ pilots }: { pilots: PilotRow[] }) {
  const { t, f } = await getI18n();
  const awards = awardsFor(pilots, f);
  if (!awards.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {awards.map((a) => (
        <div key={a.kind} className="glass-inset flex items-center gap-3 rounded-lg px-3 py-2.5">
          <Portrait id={a.pilot.characterId} size={40} />
          <div className="min-w-0 flex-1">
            <div className="eve-label flex items-center gap-1 text-2xs text-ink-3">
              <a.icon className="size-3" aria-hidden /> {t.killboard.topPilots.awards[a.kind]}
            </div>
            <PilotLink pilot={a.pilot} className="block truncate text-sm font-medium text-ink">
              {name(a.pilot, t)}
            </PilotLink>
          </div>
          <div className="text-sm font-semibold whitespace-nowrap tabular-nums">{a.value}</div>
        </div>
      ))}
    </div>
  );
}
