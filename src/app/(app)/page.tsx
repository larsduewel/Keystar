import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { isoDate } from "@/modules/mining/filters";
import { loadDashboard } from "./_dashboard/data";
import { InfoStrip } from "./_dashboard/info-strip";
import { CharactersPanel, MainPanel, MvpPanel, RoadmapCards, SyncWarning } from "./_dashboard/panels";
import { AccountTiles, CombatTiles, MiningTile } from "./_dashboard/tiles";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.metaTitle };
}

export default async function OverviewPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const d = t.dashboard;
  const settings = await getSettings();
  const { combat, canMining, mining, account } = await loadDashboard(user, settings, isoDate(new Date()));

  return (
    <div className="space-y-6">
      <div>
        <PageHeader eyebrow={d.header.eyebrow} title={d.header.welcome(user.main?.name ?? d.header.fallbackName)} description={d.header.description} />
        <InfoStrip user={user} account={account} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {combat && <CombatTiles combat={combat} />}
        <MiningTile mining={mining} />
        {!combat && <AccountTiles user={user} account={account} />}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <MainPanel combat={combat} canMining={canMining} mining={mining} />
        <div className="space-y-4 xl:col-span-4">
          {combat && <MvpPanel combat={combat} />}
          {combat && account.sync?.failing ? <SyncWarning failing={account.sync.failing} /> : null}
          <CharactersPanel user={user} account={account} />
        </div>
      </div>

      <RoadmapCards />
    </div>
  );
}
