import { Activity, Coins, Gem, Pickaxe, Swords, Target, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { WeekDelta } from "@/components/ui/deltas";
import { Delta, StatTile } from "@/components/ui/stat-tile";
import type { CurrentUser } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { delta } from "@/lib/format";
import { efficiency } from "@/modules/killboard/queries";
import type { AccountData, CombatData, MiningData } from "./data";

/** The dashboard's stat tiles: combat (when the dashboard leads with it), mining, and the account's own state. */

/** Kills, ISK destroyed and efficiency over the last 30 days, each against the 30 days before. */
export async function CombatTiles({ combat }: { combat: CombatData }) {
  const { t, f } = await getI18n();
  const d = t.dashboard;
  const { now, before, killboardHref } = combat;
  const eff = efficiency(now.iskDestroyed, now.iskLost);
  const effBefore = efficiency(before.iskDestroyed, before.iskLost);
  return (
    <>
      <StatTile
        icon={Swords}
        label={d.tiles.kills}
        value={f.integer(now.kills)}
        delta={<WeekDelta change={now.kills - before.kills} format={f.integer} suffix={d.prior.suffix} emptyText={d.prior.empty} />}
        hint={`${d.tiles.losses(now.losses)} · ${d.tiles.activePilots(combat.pilots.length)}`}
        href={killboardHref}
      />
      <StatTile
        icon={Coins}
        label={d.tiles.iskDestroyed}
        value={f.compact(now.iskDestroyed)}
        unit="ISK"
        delta={<Delta value={delta(now.iskDestroyed, before.iskDestroyed)} period={d.prior.period} />}
        href={`${killboardHref}#isk`}
      />
      <StatTile
        icon={Target}
        label={d.tiles.efficiency}
        value={eff === null ? "—" : f.percent(eff, 1)}
        delta={
          <WeekDelta
            change={eff !== null && effBefore !== null ? (eff - effBefore) * 100 : null}
            format={d.tiles.points}
            suffix={d.prior.suffix}
            emptyText={d.prior.empty}
          />
        }
        hint={d.tiles.iskLost(f.compact(now.iskLost))}
        href={`${killboardHref}#pilot-efficiency`}
      />
    </>
  );
}

/** Corporation mining when the viewer may see it, otherwise their own; nothing without either. */
export async function MiningTile({ mining }: { mining: MiningData }) {
  const { t, f } = await getI18n();
  const d = t.dashboard;
  const summary = mining.corp ?? mining.own;
  if (!summary) return null;
  return (
    <StatTile
      icon={mining.corp ? Gem : Pickaxe}
      label={mining.corp ? d.tiles.corpMining : d.tiles.ownMining}
      value={f.compact(summary.current.value)}
      unit="ISK"
      delta={<Delta value={delta(summary.current.value, summary.previous.value)} period={d.prior.period} />}
      href="/mining"
    />
  );
}

/** Characters and background sync (or approvals waiting), filling the row when there are no combat tiles. */
export async function AccountTiles({ user, account }: { user: CurrentUser; account: AccountData }) {
  const { t, f } = await getI18n();
  const d = t.dashboard;
  const total = user.characters.length;
  return (
    <>
      <StatTile
        icon={Users}
        label={d.tiles.characters}
        value={f.integer(total)}
        delta={
          account.healthy === total ? (
            <StatusBadge status="ok" label={d.tiles.esiComplete} />
          ) : (
            <StatusBadge status="warning" label={d.tiles.needAttention(total - account.healthy)} />
          )
        }
        href="/characters"
      />
      {account.sync && (
        <StatTile
          icon={Activity}
          label={d.tiles.backgroundSync}
          value={d.tiles.jobs(account.sync.total)}
          delta={
            account.sync.failing ? (
              <StatusBadge status="error" label={d.tiles.failing(account.sync.failing)} />
            ) : (
              <StatusBadge status="ok" label={d.tiles.healthy} />
            )
          }
          href="/admin/sync"
        />
      )}
      {!account.sync && account.pendingGuests !== null && (
        <StatTile
          label={d.tiles.awaitingApproval}
          value={f.integer(account.pendingGuests)}
          href={user.can("users.view") ? "/admin/users?role=guest" : undefined}
        />
      )}
    </>
  );
}
