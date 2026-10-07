import { PageHeader } from "@/components/shell/page-header";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { getI18n } from "@/i18n/server";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { getExpenseRows, getFeeRows, getFees, getManualEntries, getPurchases, getWalletStatus } from "@/modules/mining/pnl/queries";
import { reviewTotals, suggestedCount } from "@/modules/mining/pnl/review-totals";
import { FeesPanel } from "./fees-panel";
import { AddManualEntryPanel, ManualEntriesPanel } from "./manual-panels";
import { PurchasesPanel } from "./purchases-panel";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.pnl.metaTitle.expenses };
}

const PAGE_SIZE = 50;
/** Fees per page of the taxes & fees list (newest first). */
const FEE_PAGE_SIZE = 50;

export default async function PnlExpensesPage({ searchParams }: PageProps<"/mining/pnl/expenses">) {
  const ctx = await pnlPageContext(await searchParams);
  const { t } = await getI18n();
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));
  const [purchaseRows, feeRows, purchases, fees, entries, wallet] = await Promise.all([
    getExpenseRows(scope),
    getFeeRows(scope),
    getPurchases(scope, { status: filters.status, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    // Broker fees are reviewed here, on the same status tab as the purchases; sales tax follows its sale.
    getFees(scope, { status: filters.status, kind: "brokers_fee", limit: FEE_PAGE_SIZE, offset: (filters.feePage - 1) * FEE_PAGE_SIZE }),
    getManualEntries(user.id, filters.from, filters.to),
    getWalletStatus(user.id),
  ]);

  // The status tabs cover purchases and broker fees, the two things reviewed here.
  const totals = reviewTotals([...purchaseRows, ...feeRows]);
  const walletOn = wallet.some((w) => w.granted || w.transactions + w.fees > 0);

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.pnl.metaTitle.expenses}
          description={t.pnl.expenses.description}
          actions={<PnlTabs current="expenses" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} />

        <PendingFrame className="space-y-6">
          <PurchasesPanel
            filters={filters}
            purchases={purchases}
            pageSize={PAGE_SIZE}
            totals={totals}
            suggested={suggestedCount(purchaseRows)}
            walletOn={walletOn}
          />

          {feeRows.length > 0 && (
            <FeesPanel filters={filters} fees={fees} pageSize={FEE_PAGE_SIZE} suggested={suggestedCount(feeRows)} incomeSource={ctx.incomeSource} />
          )}

          <div className="grid gap-4 xl:grid-cols-12">
            <AddManualEntryPanel className="xl:col-span-5" characters={characters} today={ctx.today} />
            <ManualEntriesPanel className="xl:col-span-7" entries={entries} overviewHref={`/mining/pnl?${pnlQueryString(filters, { page: 1 })}`} />
          </div>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
