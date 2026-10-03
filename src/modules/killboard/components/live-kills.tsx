"use client";

import { useCallback, useState } from "react";
import { useLiveFeed } from "@/components/shell/live-feed";
import { Portrait, ShipRender } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import { Toast, ToastViewport } from "@/components/ui/toast";
import { typeRender } from "@/core/eve/images";
import { useI18n } from "@/i18n/client";
import { KILL_COLOR, LOSS_COLOR } from "../colors";
import { zkillKill } from "../links";
import type { LiveEvent } from "../queries";

/** The worker reads zKillboard every 10 seconds; checking the database a little less often is plenty. */
const POLL_MS = 15_000;
const TOAST_MS = 30_000;
const MAX_VISIBLE = 3;

/**
 * Live kill and loss notifications: toasts for killmails the worker picks up
 * from zKillboard's live feed, or desktop notifications while the user isn't
 * looking at Keystar. Each toast stays 30 seconds (paused while hovered) and
 * opens the killmail on zKillboard. Registered as `killboard.kills` in src/modules/alerts.ts.
 */
export function LiveKills() {
  const { t, f } = useI18n();
  const l = t.killboard.live;
  const [toasts, setToasts] = useState<LiveEvent[]>([]);

  useLiveFeed<LiveEvent>({
    url: "/api/killboard/live",
    pollMs: POLL_MS,
    claimsKey: "ks_kill_alerts_shown",
    idOf: (e) => e.killmailId,
    onToasts: (events) => setToasts((list) => [...list, ...events]),
    native: (e) => {
      const ship = e.shipName ?? t.killboard.fallback.type(e.shipTypeId);
      const victim = e.victimId ? (e.victimName ?? t.killboard.fallback.character(e.victimId)) : l.noPilot;
      const place = (e.systemName ?? t.killboard.fallback.system) + (e.regionName ? ` · ${e.regionName}` : "");
      return {
        title: `${l.kind[e.kind]} · ${f.isk(e.value)}`,
        body: [ship, victim + (e.victimTicker ? ` [${e.victimTicker}]` : ""), place].join("\n"),
        icon: typeRender(e.shipTypeId, 128),
        tag: `killmail-${e.killmailId}`,
        onClick: () => window.open(zkillKill(e.killmailId), "_blank", "noopener"),
      };
    },
  });

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((e) => e.killmailId !== id)), []);

  return (
    <ToastViewport label={l.region}>
      {/* Newest on top; the rest wait until one closes. */}
      {toasts
        .slice(0, MAX_VISIBLE)
        .reverse()
        .map((e) => (
          <KillToast key={e.killmailId} event={e} onDismiss={dismiss} />
        ))}
    </ToastViewport>
  );
}

function KillToast({ event: e, onDismiss }: { event: LiveEvent; onDismiss: (id: number) => void }) {
  const { t, f } = useI18n();
  const l = t.killboard.live;
  const kill = e.kind === "kill";
  const color = kill ? KILL_COLOR : LOSS_COLOR;
  const a = e.attacker;
  // The corporation's own pilot: the one who scored the kill, or the one who lost the ship.
  const memberId = kill ? a?.characterId : e.victimId;
  const close = useCallback(() => onDismiss(e.killmailId), [onDismiss, e.killmailId]);
  const others = e.attackerCount - (a ? 1 : 0);

  return (
    <Toast href={zkillKill(e.killmailId)} linkLabel={l.open} dismissLabel={l.dismiss} color={color} durationMs={TOAST_MS} onDismiss={close}>
      <div className="relative shrink-0 self-start">
        <ShipRender id={e.shipTypeId} size={56} />
        {memberId ? <Portrait id={memberId} size={26} className="absolute -right-2 -bottom-2 ring-2 ring-space-900" /> : null}
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="eve-label inline-flex items-center gap-1.5 text-3xs text-ink-2">
            <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
            {l.kind[e.kind]}
          </span>
          <span className="text-sm font-semibold text-ink tabular-nums">{f.isk(e.value)}</span>
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-ink">{e.shipName ?? t.killboard.fallback.type(e.shipTypeId)}</div>
        <div className="truncate text-ink-2">
          {e.victimId ? (e.victimName ?? t.killboard.fallback.character(e.victimId)) : l.noPilot}
          {e.victimTicker && <span className="ml-1 font-mono text-3xs text-ink-3">[{e.victimTicker}]</span>}
        </div>
        {a && (
          <div className="truncate text-ink-2">
            <span className="text-ink-3">{kill ? (a.finalBlow ? l.finalBlow : l.topDamage) : l.killedBy}: </span>
            {a.characterId ? (a.name ?? t.killboard.fallback.character(a.characterId)) : l.npc}
            {a.ticker && <span className="ml-1 font-mono text-3xs text-ink-3">[{a.ticker}]</span>}
            {a.shipTypeId ? <span className="text-ink-3"> · {a.shipName ?? t.killboard.fallback.type(a.shipTypeId)}</span> : null}
            {others > 0 && <span className="text-ink-3"> · {l.others(others)}</span>}
          </div>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-ink-3">
          <SecurityStatus value={e.security} />
          <span className="truncate">
            {e.systemName ?? t.killboard.fallback.system}
            {e.regionName && ` · ${e.regionName}`}
          </span>
        </div>
      </div>
    </Toast>
  );
}
