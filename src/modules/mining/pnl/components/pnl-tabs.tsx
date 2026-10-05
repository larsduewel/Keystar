import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", href: "/mining/pnl" },
  { id: "income", href: "/mining/pnl/income" },
  { id: "expenses", href: "/mining/pnl/expenses" },
  { id: "settings", href: "/mining/pnl/settings" },
] as const;

/** Overview / Income / Expenses / Settings, keeping the date range and character filter. */
export async function PnlTabs({ current, query }: { current: (typeof TABS)[number]["id"]; query: string }) {
  const { t } = await getI18n();
  return (
    <nav aria-label={t.pnl.tabs.label} className="glass-inset inline-flex items-center gap-0.5 rounded-lg p-0.5">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={query ? `${tab.href}?${query}` : tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
            tab.id === current ? "glass-chip text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {t.pnl.tabs[tab.id]}
        </Link>
      ))}
    </nav>
  );
}
