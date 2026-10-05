import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { appraisals, getDb } from "@/core/db";
import { getI18n } from "@/i18n/server";
import { AppraisalForm } from "@/modules/trade/components/appraisal-form";
import { DeleteAppraisalButton } from "@/modules/trade/components/delete-appraisal-button";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import type { AppraisalItem, AppraisalTotals } from "@/modules/trade/appraisal/types";
import { createAppraisal, deleteAppraisal } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.trade.appraisal.metaTitle };
}

export default async function AppraisalPage() {
  const user = await requirePermission(TRADE_PERMISSIONS.appraisal);
  const { t, f } = await getI18n();
  const m = t.trade.appraisal;
  const recent = await getDb()
    .select({ id: appraisals.id, createdAt: appraisals.createdAt, totals: appraisals.totals, items: appraisals.items })
    .from(appraisals)
    .where(eq(appraisals.createdBy, user.id))
    .orderBy(desc(appraisals.createdAt))
    .limit(12);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={m.eyebrow} title={m.title} description={m.description} />
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title={m.paste} className="xl:col-span-8">
          <AppraisalForm action={createAppraisal} />
        </Panel>
        <Panel title={m.recent} className="xl:col-span-4">
          {recent.length ? (
            <ul className="divide-y divide-surface-contrast/6">
              {recent.map((a) => {
                const totals = a.totals as AppraisalTotals;
                const items = a.items as AppraisalItem[];
                return (
                  <li key={a.id} className="flex items-center gap-2 py-2.5">
                    <Link href={`/trade/appraisal/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {items.slice(0, 2).map((i) => i.name).join(", ")}
                          {items.length > 2 ? ` ${m.more(items.length - 2)}` : ""}
                        </div>
                        <div className="text-xs text-ink-3">{f.relativeTime(a.createdAt)}</div>
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums">{f.compact(totals.sell)}</div>
                    </Link>
                    <DeleteAppraisalButton action={deleteAppraisal.bind(null, a.id)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">{m.recentEmpty}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
