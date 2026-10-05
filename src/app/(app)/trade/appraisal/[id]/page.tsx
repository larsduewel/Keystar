import { eq } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { Glass, Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { appraisals, getDb } from "@/core/db";
import { env } from "@/core/env";
import { getI18n } from "@/i18n/server";
import { SortableTable, type Column, type EntityRow } from "@/components/ui/sortable-table";
import { AppraisalForm } from "@/modules/trade/components/appraisal-form";
import { DeleteAppraisalButton } from "@/modules/trade/components/delete-appraisal-button";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import { splitPrice, type AppraisalItem, type AppraisalTotals, type UnparsedLine } from "@/modules/trade/appraisal/types";
import { createAppraisal, deleteAppraisal } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.trade.appraisal.metaTitle };
}

export default async function AppraisalResultPage({ params }: PageProps<"/trade/appraisal/[id]">) {
  const user = await requirePermission(TRADE_PERMISSIONS.appraisal);
  const { t, f } = await getI18n();
  const m = t.trade.result;
  const full = (v: number) => f.isk(v, { compact: false });
  const columns: Column[] = [
    { key: "quantity", label: m.columns.quantity, format: "int" },
    { key: "buy", label: m.columns.buy, format: "unitIsk" },
    { key: "sell", label: m.columns.sell, format: "unitIsk" },
    { key: "totalBuy", label: m.columns.totalBuy, format: "isk" },
    { key: "totalSell", label: m.columns.totalSell, format: "isk" },
    { key: "volume", label: m.columns.volume, format: "m3" },
  ];
  const { id } = await params;
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) notFound();
  const [row] = await getDb().select().from(appraisals).where(eq(appraisals.id, id));
  if (!row) notFound();

  const items = row.items as AppraisalItem[];
  const totals = row.totals as AppraisalTotals;
  const unparsed = row.unparsed as UnparsedLine[];
  const pct = row.pricePercent;

  const rows: EntityRow[] = items.map((i) => ({
    id: i.typeId,
    name: i.name,
    image: "type",
    href: `https://everef.net/types/${i.typeId}`,
    values: {
      quantity: i.quantity,
      buy: i.buy,
      sell: i.sell,
      totalBuy: i.buy === null ? null : i.buy * i.quantity,
      totalSell: i.sell === null ? null : i.sell * i.quantity,
      split: splitPrice(i),
      volume: i.volume * i.quantity,
    },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.trade.appraisal.eyebrow}
        title={t.trade.appraisal.title}
        description={m.description(f.dateTime(row.createdAt), row.createdByName)}
        actions={
          <>
            {row.createdBy === user.id && (
              <DeleteAppraisalButton action={deleteAppraisal.bind(null, row.id)} labelled backTo="/trade/appraisal" />
            )}
            <ButtonLink href="/trade/appraisal" size="sm">
              <ArrowLeft className="size-4" aria-hidden /> {m.newAppraisal}
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label={m.jitaSell} value={f.compact(totals.sell)} unit="ISK" hint={full(totals.sell)} />
        <StatTile label={m.jitaBuy} value={f.compact(totals.buy)} unit="ISK" hint={full(totals.buy)} />
        <StatTile label={m.split} value={f.compact(totals.split)} unit="ISK" hint={full(totals.split)} />
        <StatTile
          label={m.volume}
          value={f.compact(totals.volume)}
          unit="m³"
          hint={m.volumeHint(totals.types, totals.quantity)}
        />
      </div>

      {pct !== 100 && (
        <Glass className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-5 py-4">
          <div className="eve-label text-2xs text-gold">{m.ofJita(f.percent(pct / 100, 0))}</div>
          <div className="text-sm text-ink-2">
            {m.buy} <span className="ml-1 font-semibold text-ink tabular-nums">{full((totals.buy * pct) / 100)}</span>
          </div>
          <div className="text-sm text-ink-2">
            {m.split} <span className="ml-1 font-semibold text-ink tabular-nums">{full((totals.split * pct) / 100)}</span>
          </div>
          <div className="text-sm text-ink-2">
            {m.sell} <span className="ml-1 font-semibold text-ink tabular-nums">{full((totals.sell * pct) / 100)}</span>
          </div>
        </Glass>
      )}

      <Panel title={m.share} subtitle={m.shareSubtitle}>
        <CopyField value={`${env().APP_URL}/trade/appraisal/${row.id}`} />
      </Panel>

      <Panel title={m.items} subtitle={totals.unpriced ? m.unpriced(totals.unpriced) : m.itemsSorted}>
        <SortableTable entityLabel={m.item} columns={columns} rows={rows} defaultSort="totalSell" initialRows={50} />
      </Panel>

      {unparsed.length > 0 && (
        <Panel title={m.unparsed(unparsed.length)} subtitle={m.unparsedSubtitle}>
          <ul className="space-y-1 font-mono text-xs text-ink-2">
            {unparsed.slice(0, 200).map((u) => (
              <li key={u.line} className="flex gap-3">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span className="w-10 shrink-0 text-right text-ink-3">{u.line}</span>
                <span className="break-all">{u.raw}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={m.again} subtitle={m.againSubtitle}>
        <AppraisalForm action={createAppraisal} defaultInput={row.input} defaultPercent={pct} />
      </Panel>
    </div>
  );
}
