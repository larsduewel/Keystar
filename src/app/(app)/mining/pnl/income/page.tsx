import { Info } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { getI18n } from "@/i18n/server";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString } from "@/modules/mining/pnl/filters";
import { summarizeOreFlows } from "@/modules/mining/pnl/ore-flows";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { getOreFlows, getSaleRows, getSales, getWalletStatus } from "@/modules/mining/pnl/queries";
import { OreFlowsPanel } from "./ore-flows-panel";
import { SalesPanel } from "./sales-panel";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.pnl.metaTitle.income };
}

const PAGE_SIZE = 50;

/** Wallet sales review: which sales were mining income (counted when income comes from wallet sales). */
export default async function PnlIncomePage({ searchParams }: PageProps<"/mining/pnl/income">) {
  const ctx = await pnlPageContext(await searchParams);
  const { t } = await getI18n();
  const m = t.pnl.income;
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));
  const [summary, sales, wallet, oreFlows] = await Promise.all([
    getSaleRows(scope),
    getSales(scope, { status: filters.status, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    getWalletStatus(user.id),
    getOreFlows(scope),
  ]);
  const flows = summarizeOreFlows(oreFlows);
  const walletOn = wallet.some((w) => w.granted || w.transactions + w.fees > 0);
  const query = pnlQueryString(filters, { page: 1 });

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.pnl.metaTitle.income}
          description={m.description}
          actions={<PnlTabs current="income" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} />

        {ctx.incomeSource === "mined" && walletOn && (
          <Glass className="flex items-start gap-2 rounded-2xl px-4 py-3 text-sm text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              {m.minedNotice(
                <Link href={`/mining/pnl/settings?${query}`} className="text-accent hover:underline">
                  {m.switchToSales}
                </Link>,
              )}
            </span>
          </Glass>
        )}

        <PendingFrame className="space-y-6">
          <SalesPanel filters={filters} summary={summary} sales={sales} pageSize={PAGE_SIZE} walletOn={walletOn} overviewHref={`/mining/pnl?${query}`} />
          {flows.rows.length > 0 && <OreFlowsPanel flows={flows} />}
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
