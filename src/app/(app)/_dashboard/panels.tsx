import { ArrowRight, BookOpen, Boxes, Crosshair, Link2, Pickaxe, Swords, Wallet } from "lucide-react";
import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import type { CurrentUser } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { KillsChart } from "@/modules/killboard/components/kills-chart";
import { RecentActivity } from "@/modules/killboard/components/recent-activity";
import { MvpCard, RunnersUp } from "@/modules/killboard/components/top-pilots";
import { toChartClasses } from "@/modules/mining/class-colors";
import { DailyChart } from "@/modules/mining/components/daily-chart";
import type { AccountData, CombatData, MiningData } from "./data";

/** The dashboard's panels below the tiles. */

/** The wide column: the kills chart with recent activity, else the mining chart, else how to get started. */
export async function MainPanel({ combat, canMining, mining }: { combat: CombatData | null; canMining: boolean; mining: MiningData }) {
  const { t } = await getI18n();
  const d = t.dashboard;
  if (combat) {
    return (
      <div className="space-y-4 xl:col-span-8">
        <Panel
          title={d.panels.killsChart}
          subtitle={d.panels.killsChartSubtitle}
          actions={
            <ButtonLink href="/killboard" size="sm">
              <Swords className="size-4" aria-hidden /> {t.killboard.module.nav.killboard}
            </ButtonLink>
          }
        >
          <KillsChart rows={combat.activity} />
        </Panel>
        <Panel title={d.panels.recent} subtitle={d.panels.recentSubtitle}>
          <RecentActivity rows={combat.recent} />
        </Panel>
      </div>
    );
  }
  if (canMining) {
    return (
      <Panel
        className="xl:col-span-8"
        title={mining.corp ? d.panels.corpMining : d.panels.ownMining}
        subtitle={d.panels.miningSubtitle}
        actions={
          <ButtonLink href="/mining" size="sm">
            <Pickaxe className="size-4" aria-hidden /> {d.panels.miningOverview}
          </ButtonLink>
        }
      >
        <DailyChart metric="value" rows={mining.daily.map((day) => ({ date: day.date, total: day.total, values: toChartClasses(day.byClass) }))} />
      </Panel>
    );
  }
  return (
    <Panel className="xl:col-span-8" title={d.panels.gettingStarted}>
      <p className="text-sm text-ink-2">{d.panels.gettingStartedBody}</p>
      <ButtonLink href="/characters" variant="primary" className="mt-4">
        <Link2 className="size-4" aria-hidden /> {d.panels.manageCharacters}
      </ButtonLink>
    </Panel>
  );
}

/** The month's top pilot and runners-up; nothing when nobody scored a kill. */
export async function MvpPanel({ combat }: { combat: CombatData }) {
  const { t } = await getI18n();
  const d = t.dashboard;
  const ranked = combat.pilots.filter((p) => p.kills > 0);
  if (ranked.length === 0) return null;
  return (
    <Panel
      title={d.panels.mvp}
      actions={
        <Link href="/killboard" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          {d.panels.allPilots} <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      <MvpCard pilot={ranked[0]} period={t.common.datePresets["30d"]} size="md" />
      {ranked.length > 1 && (
        <div className="mt-3">
          <RunnersUp pilots={ranked.slice(1, 5)} />
        </div>
      )}
    </Panel>
  );
}

/** Failing sync jobs, for viewers who can open the sync page; replaces the sync tile when combat tiles fill the row. */
export async function SyncWarning({ failing }: { failing: number }) {
  const { t } = await getI18n();
  const d = t.dashboard;
  return (
    <Glass className="flex items-center gap-3 px-5 py-3.5 text-sm">
      <Crosshair className="size-4 text-critical-text" aria-hidden />
      <span className="flex-1">{d.panels.syncFailing(failing)}</span>
      <Link href="/admin/sync" className="text-xs text-accent hover:underline">
        {d.panels.syncStatus}
      </Link>
    </Glass>
  );
}

export async function CharactersPanel({ user, account }: { user: CurrentUser; account: AccountData }) {
  const { t } = await getI18n();
  const d = t.dashboard;
  return (
    <Panel
      title={d.panels.characters}
      actions={
        <Link href="/characters" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          {d.panels.manage} <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      <ul className="space-y-2">
        {user.characters.map((c) => {
          const h = account.health.get(c.characterId);
          return (
            <li key={c.characterId} className="flex items-center gap-3 text-sm">
              <Portrait id={c.characterId} size={28} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {h === "ok" ? (
                <StatusBadge status="ok" label="ESI" />
              ) : h === "revoked" ? (
                <StatusBadge status="error" label={d.panels.tokenRevoked} />
              ) : h === "missing" ? (
                <StatusBadge status="warning" label={d.panels.tokenScopes} />
              ) : (
                <Badge>{d.panels.noAccess}</Badge>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const ROADMAP = [
  { id: "skills", icon: BookOpen },
  { id: "assets", icon: Boxes },
  { id: "wallets", icon: Wallet },
] as const;

export async function RoadmapCards() {
  const { t } = await getI18n();
  const d = t.dashboard;
  return (
    <div>
      <div className="eve-label mb-3 text-xs text-ink-3">{d.roadmap.title}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ROADMAP.map((r) => (
          <Glass key={r.id} className="flex items-start gap-3 px-5 py-4 opacity-80">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-surface-contrast/[0.08] bg-surface-contrast/[0.025]">
              <r.icon className="size-4 text-ink-2" aria-hidden />
            </div>
            <div>
              <div className="text-sm font-medium">{d.roadmap.items[r.id].title}</div>
              <div className="mt-0.5 text-xs text-ink-3">{d.roadmap.items[r.id].text}</div>
            </div>
          </Glass>
        ))}
      </div>
    </div>
  );
}
