import type { RangePreset } from "@/components/ui/date-range";
import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { DATE_PRESETS, isoDate } from "../filters";
import { MINING_PERMISSIONS } from "../module";
import { miningValuation, valuationLabel } from "../page-context";
import { parsePnlFilters, type PnlFilters } from "./filters";
import { getPnlSettings } from "./queries";
import { pnlScope, type IncomeSource, type PnlScope } from "./scope";

export interface PnlPageContext {
  user: CurrentUser;
  filters: PnlFilters;
  scope: PnlScope;
  incomeSource: IncomeSource;
  valuationLabel: string;
  presets: RangePreset[];
  today: string;
}

/** Shared setup for the P&L pages: auth, own-character scope, filters and valuation. */
export async function pnlPageContext(searchParams: Record<string, string | string[] | undefined>): Promise<PnlPageContext> {
  const user = await requirePermission(MINING_PERMISSIONS.pnl);
  const today = isoDate(new Date());
  const [settings, pnl, { t }] = await Promise.all([getSettings(), getPnlSettings(user.id), getI18n()]);
  const valuation = miningValuation(settings);
  const filters = parsePnlFilters(searchParams, today);
  return {
    user,
    filters,
    scope: pnlScope(user, filters, valuation, pnl.ratePct),
    incomeSource: pnl.incomeSource,
    valuationLabel: valuationLabel(t, valuation),
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: t.common.datePresets[p.id], ...p.range(today) })),
    today,
  };
}
