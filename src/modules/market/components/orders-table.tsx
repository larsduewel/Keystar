import { ChevronLeft, ChevronRight, CircleHelp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { SecurityStatus } from "@/components/ui/security";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EXPIRING_SOON_MS, orderOutcome, type OrderRange } from "../orders";
import type { MarketOrder } from "../queries";

function rangeLabel(range: OrderRange, t: Messages["market"]): string {
  return range === "station" || range === "solarsystem" || range === "region" ? t.ranges[range] : t.ranges.jumps(Number(range));
}

/** The orders of one page as a table: who, what, at which price, how much is left, where, and until when. */
export function OrdersTable({
  orders,
  t,
  f,
  now,
  page,
  pages,
  pageLink,
  showCharacter,
  openOnly,
}: {
  orders: MarketOrder[];
  t: Messages["market"];
  f: Formatter;
  now: Date;
  page: number;
  pages: number;
  pageLink: (page: number) => string;
  showCharacter: boolean;
  /** Every row is an open order, so the last column only shows expiry. */
  openOnly: boolean;
}) {
  return (
    <Glass className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="ks-table">
          <thead>
            <tr>
              {showCharacter && <th>{t.table.character}</th>}
              <th>{t.table.item}</th>
              <th className="num">{t.table.price}</th>
              <th className="num">{t.table.quantity}</th>
              <th>{t.table.location}</th>
              <th>{openOnly ? t.table.expires : t.table.status}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const outcome = orderOutcome(o);
              const open = outcome === "open";
              const expiringSoon = open && o.expiresAt.getTime() - now.getTime() < EXPIRING_SOON_MS;
              return (
                <tr key={o.orderId} className={cn(!open && "text-ink-2")}>
                  {showCharacter && (
                    <td>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Portrait id={o.characterId} size={22} /> {o.characterName}
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="flex items-center gap-2.5">
                      <TypeIcon id={o.typeId} size={28} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-ink" title={o.typeName ?? String(o.typeId)}>
                            {o.typeName ?? o.typeId}
                          </span>
                          <Badge tone={o.isBuyOrder ? "gold" : "accent"} className="shrink-0">
                            {o.isBuyOrder ? t.table.buy : t.table.sell}
                          </Badge>
                          {o.isCorporation && (
                            <span title={t.table.corporationHint} className="shrink-0">
                              <Badge>{t.table.corporation}</Badge>
                            </span>
                          )}
                        </div>
                        {o.isBuyOrder && (
                          <div className="truncate text-2xs text-ink-3">
                            {t.table.range(rangeLabel(o.range, t))}
                            {o.minVolume !== null && o.minVolume > 1 && ` · ${t.table.minVolume(f.integer(o.minVolume))}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="num tabular-nums">
                    <div className="whitespace-nowrap" title={t.table.perUnit}>
                      {f.number(o.price, 2)} ISK
                    </div>
                    {/* What is left on the market; a closed order has nothing left, and its escrow went back. */}
                    {open && (
                      <div className="whitespace-nowrap text-2xs text-ink-3">
                        {o.isBuyOrder && o.escrow ? t.table.escrow(f.isk(o.escrow)) : t.table.total(f.isk(o.price * o.volumeRemain))}
                      </div>
                    )}
                  </td>
                  <td className="num tabular-nums">
                    <div className="whitespace-nowrap">{f.integer(o.volumeRemain)}</div>
                    <div className="whitespace-nowrap text-2xs text-ink-3">{t.table.of(f.integer(o.volumeTotal))}</div>
                  </td>
                  <td>
                    <span className="flex max-w-56 flex-col">
                      <span className="truncate" title={o.locationName ?? undefined}>
                        {o.locationName ?? (
                          <span className="flex items-center gap-1 text-ink-3" title={t.table.noLocationHint}>
                            {t.table.noLocation} <CircleHelp className="size-3.5" aria-hidden />
                          </span>
                        )}
                      </span>
                      {o.systemName ? (
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-2xs text-ink-3">
                          <SecurityStatus value={o.security} /> {o.systemName}
                          {o.regionName && <span className="truncate">· {o.regionName}</span>}
                        </span>
                      ) : (
                        o.regionName && <span className="whitespace-nowrap text-2xs text-ink-3">{o.regionName}</span>
                      )}
                    </span>
                  </td>
                  <td>
                    {open ? (
                      <div className={cn("whitespace-nowrap", expiringSoon && "font-medium text-warning")} title={f.dateTime(o.expiresAt)}>
                        {t.table.expiresIn(f.relativeTime(o.expiresAt, now))}
                      </div>
                    ) : (
                      <div className="whitespace-nowrap" title={outcome === "closed" ? t.closedHint : undefined}>
                        {t.outcomes[outcome]}
                      </div>
                    )}
                    <div className="whitespace-nowrap text-2xs text-ink-3" title={`${f.dateTime(o.issued)} · ${t.table.issuedHint}`}>
                      {!open && o.closedAt ? t.table.closed(f.relativeTime(o.closedAt, now)) : t.table.issued(f.relativeTime(o.issued, now))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-end gap-2 border-t border-surface-contrast/6 px-5 py-3" aria-label={t.table.pageOf(page, pages)}>
          <span className="mr-auto text-xs text-ink-3">{t.table.pageOf(page, pages)}</span>
          <Link
            href={pageLink(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn("glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs", page <= 1 && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="size-4" aria-hidden /> {t.table.previous}
          </Link>
          <Link
            href={pageLink(Math.min(pages, page + 1))}
            aria-disabled={page >= pages}
            className={cn("glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs", page >= pages && "pointer-events-none opacity-40")}
          >
            {t.table.next} <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      )}
    </Glass>
  );
}
