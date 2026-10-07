import { WeekDelta } from "@/components/ui/deltas";
import { StatTile } from "@/components/ui/stat-tile";
import { getI18n } from "@/i18n/server";
import { efficiency, type Totals } from "../queries";

/** The five headline tiles of the killboard: period totals, each with this week against the week before. */
export async function PeriodStats({ totals, week, prevWeek, weekLabel }: { totals: Totals; week: Totals; prevWeek: Totals; weekLabel: string }) {
  const { t, f } = await getI18n();
  const tk = t.killboard;
  const eff = efficiency(totals.iskDestroyed, totals.iskLost);
  const weekEff = efficiency(week.iskDestroyed, week.iskLost);
  const prevEff = efficiency(prevWeek.iskDestroyed, prevWeek.iskLost);
  const weekDelta = { suffix: tk.stats.vsPrevWeek, emptyText: tk.stats.noPrevWeek };
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label={tk.stats.totalKills}
        value={f.integer(totals.kills)}
        delta={<WeekDelta change={week.kills - prevWeek.kills} format={f.integer} {...weekDelta} />}
        hint={tk.stats.weekInRange(f.integer(week.kills), weekLabel)}
      />
      <StatTile
        label={tk.stats.totalLosses}
        value={f.integer(totals.losses)}
        delta={<WeekDelta change={week.losses - prevWeek.losses} upIsGood={false} format={f.integer} {...weekDelta} />}
        hint={tk.stats.weekInRange(f.integer(week.losses), weekLabel)}
      />
      <StatTile
        label={tk.terms.iskDestroyed}
        value={f.compact(totals.iskDestroyed)}
        unit="ISK"
        delta={<WeekDelta change={week.iskDestroyed - prevWeek.iskDestroyed} format={(n) => f.compact(n)} {...weekDelta} />}
        hint={tk.stats.week(f.compact(week.iskDestroyed))}
      />
      <StatTile
        label={tk.terms.iskLost}
        value={f.compact(totals.iskLost)}
        unit="ISK"
        delta={<WeekDelta change={week.iskLost - prevWeek.iskLost} upIsGood={false} format={(n) => f.compact(n)} {...weekDelta} />}
        hint={tk.stats.week(f.compact(week.iskLost))}
      />
      <StatTile
        label={tk.terms.iskEfficiency}
        value={eff === null ? "—" : f.percent(eff, 1)}
        className="col-span-2 lg:col-span-1"
        delta={
          <WeekDelta change={weekEff !== null && prevEff !== null ? (weekEff - prevEff) * 100 : null} format={tk.stats.points} {...weekDelta} />
        }
        hint={weekEff === null ? undefined : tk.stats.week(f.percent(weekEff, 1))}
      />
    </div>
  );
}
