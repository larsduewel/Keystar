"use client";

import { Bell, BellOff } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Popover } from "@/components/ui/popover";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { ALERT_FEEDS } from "@/modules/alerts";
import { alertSwitch, useDesktopAlerts, useFocusBeacon } from "./live-feed";

/** A live alert the viewer may get, with its text resolved on the server (`AlertDef`). */
export interface AlertOption {
  id: string;
  label: string;
  hint: string;
}

/**
 * Top bar alerts: a menu with a per-browser switch for every alert the viewer
 * may get and one for desktop notifications, plus the feeds that are on.
 */
export function LiveAlerts({ alerts }: { alerts: AlertOption[] }) {
  const { t } = useI18n();
  const a = t.shell.alerts;
  const options = useMemo(() => alerts.filter((o) => ALERT_FEEDS[o.id]), [alerts]);
  const switches = useMemo(() => options.map((o) => alertSwitch(o.id, ALERT_FEEDS[o.id]!.storageKey)), [options]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const offs = switches.map((s) => s.subscribe(listener));
      return () => offs.forEach((off) => off());
    },
    [switches],
  );
  // The ids that are on, as one string so the snapshot compares by value.
  const onKey = useSyncExternalStore(
    subscribe,
    () => options.filter((_, i) => switches[i]!.read()).map((o) => o.id).join(" "),
    () => options.map((o) => o.id).join(" "),
  );
  const on = new Set(onKey.split(" ").filter(Boolean));
  const desktop = useDesktopAlerts();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useFocusBeacon(on.size > 0);

  const desktopHint =
    desktop.permission === "denied" ? a.desktop.blocked : desktop.permission === "unsupported" ? a.desktop.unsupported : a.desktop.hint;
  const Icon = on.size > 0 ? Bell : BellOff;

  return (
    <>
      <Popover
        open={open}
        onClose={close}
        align="right"
        // The top bar blurs its own backdrop, so a translucent panel inside it would show the page unblurred.
        className="w-80 bg-space-800! p-1.5"
        trigger={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            title={a.menu}
            className="flex h-8 items-center gap-1.5 rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-2.5 text-xs text-ink-3 transition hover:text-ink"
          >
            <Icon className={on.size > 0 ? "size-3.5 text-accent" : "size-3.5"} aria-hidden />
            <span className="sr-only sm:not-sr-only">{a.button}</span>
          </button>
        }
      >
        <div role="dialog" aria-label={a.menu} className="flex flex-col">
          {options.map((o, i) => (
            <SwitchRow key={o.id} label={o.label} hint={o.hint} checked={on.has(o.id)} onChange={() => switches[i]!.write(!on.has(o.id))} />
          ))}
          <div className="my-1 border-t border-surface-contrast/[0.08]" />
          <SwitchRow
            label={a.desktop.label}
            hint={desktopHint}
            checked={desktop.active}
            disabled={desktop.permission === "denied" || desktop.permission === "unsupported"}
            onChange={desktop.toggle}
          />
        </div>
      </Popover>
      {options
        .filter((o) => on.has(o.id))
        .map((o) => {
          const { Feed } = ALERT_FEEDS[o.id]!;
          return <Feed key={o.id} />;
        })}
    </>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="flex items-start gap-3 rounded-md px-2.5 py-2 text-left transition hover:bg-surface-contrast/5 disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 inline-flex h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-contrast/15",
        )}
      >
        <span
          className={cn("absolute top-0.5 size-3 rounded-full bg-space-950 transition-[left]", checked ? "left-3.5" : "left-0.5")}
        />
      </span>
    </button>
  );
}
