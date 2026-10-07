import { ExternalLink, Swords } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CorpLogo } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import type { RangePreset } from "@/components/ui/date-range";
import { getI18n } from "@/i18n/server";
import type { DateRange } from "../filters";
import { zkillCorporation } from "../links";
import type { KillboardStatus } from "../queries";
import { KillboardPeriodPicker } from "./period-picker";

/** The killboard's title row: the home corporation, the period picker and the link to zKillboard. */
export async function KillboardHeader({
  corpId,
  corpName,
  period,
  presets,
}: {
  corpId: number;
  corpName: string;
  period: DateRange;
  presets: RangePreset[];
}) {
  const { t } = await getI18n();
  const tk = t.killboard;
  return (
    <PageHeader
      eyebrow={tk.module.navSection}
      title={tk.module.nav.killboard}
      description={
        <span className="inline-flex items-center gap-2">
          <CorpLogo id={corpId} size={20} />
          <span>{tk.page.description(corpName)}</span>
        </span>
      }
      actions={
        <>
          <KillboardPeriodPicker period={period} presets={presets} />
          <a
            href={zkillCorporation(corpId)}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-chip inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium hover:bg-surface-contrast/10"
          >
            zKillboard <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </>
      }
    />
  );
}

/** Shown until an admin sets the home corporation in Settings. */
export async function NoCorporation() {
  const { t } = await getI18n();
  const tk = t.killboard;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={tk.module.navSection} title={tk.module.nav.killboard} />
      <Glass>
        <EmptyState icon={Swords} title={tk.page.noCorp.title}>
          {tk.page.noCorp.body}
        </EmptyState>
      </Glass>
    </div>
  );
}

/** Shown while the first import runs, or when zKillboard has nothing for the corporation. */
export async function NoKillmails({ status, corpName }: { status: KillboardStatus; corpName: string }) {
  const { t } = await getI18n();
  const tk = t.killboard;
  return (
    <Glass>
      <EmptyState icon={Swords} title={status.lastSyncAt ? tk.page.empty.title : tk.page.importing.title}>
        {status.lastSyncAt ? tk.page.empty.body(corpName) : tk.page.importing.body(corpName)}
        {status.lastError && <span className="mt-2 block text-critical-text">{tk.page.lastError(status.lastError)}</span>}
      </EmptyState>
    </Glass>
  );
}
