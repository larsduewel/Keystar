"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/*
 * Shared engine of the live alerts (kills and losses, EVE mail): per-browser
 * switches, the desktop notification permission, and a polling hook that shows
 * new events as in-page toasts or, while the user isn't looking at Keystar, as
 * native OS notifications.
 */

/** After a tab was hidden this long, start fresh instead of replaying what was missed. */
const RESUME_GAP_MS = 2 * 60_000;
/** Claims of announced events are kept this long. */
const CLAIMS_TTL_MS = 6 * 3600_000;
/** Which tab of this browser has focus (tab id → when); refreshed this often while it has. */
const FOCUS_KEY = "ks_alerts_focus";
const FOCUS_BEAT_MS = 15_000;
const FOCUS_TTL_MS = FOCUS_BEAT_MS + 10_000;

/**
 * A per-browser on/off switch in localStorage, `defaultOn` until changed;
 * other tabs follow through the storage event. Without storage the choice
 * lasts for this page only.
 */
function createSwitch(key: string, defaultOn: boolean) {
  const changed = defaultOn ? "off" : "on";
  const listeners = new Set<() => void>();
  let fallback = defaultOn;
  const read = (): boolean => {
    try {
      return localStorage.getItem(key) === changed ? !defaultOn : defaultOn;
    } catch {
      return fallback;
    }
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  };
  return {
    read,
    subscribe,
    write(on: boolean) {
      fallback = on;
      try {
        if (on === defaultOn) localStorage.removeItem(key);
        else localStorage.setItem(key, changed);
      } catch {
        // Storage blocked: `fallback` keeps the choice for this page.
      }
      for (const listener of listeners) listener();
    },
    useValue: () => useSyncExternalStore(subscribe, read, () => defaultOn),
  };
}

type Switch = ReturnType<typeof createSwitch>;
const alertSwitches = new Map<string, Switch>();

/** The per-browser on/off switch of one alert (on until turned off), stored under `ks_alerts_<id>` unless given a key. */
export function alertSwitch(id: string, storageKey?: string): Switch {
  let s = alertSwitches.get(id);
  if (!s) alertSwitches.set(id, (s = createSwitch(storageKey ?? `ks_alerts_${id}`, true)));
  return s;
}

/** Opt-in for native desktop notifications, per browser. The key predates mail alerts. */
const desktopSwitch = createSwitch("ks_kill_alerts_desktop", false);

export type Permission = NotificationPermission | "unsupported";

/** The browser's notification permission; "unsupported" without the API or outside a secure context. */
function readPermission(): Permission {
  if (typeof window === "undefined" || !window.isSecureContext || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

const permissionListeners = new Set<() => void>();

function subscribePermission(listener: () => void) {
  permissionListeners.add(listener);
  // Site settings can change the permission while the page is open; re-read when the user comes back.
  window.addEventListener("focus", listener);
  let status: PermissionStatus | null = null;
  let unsubscribed = false;
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((s) => {
      if (unsubscribed) return;
      status = s;
      s.addEventListener("change", listener);
    })
    .catch(() => {});
  return () => {
    unsubscribed = true;
    permissionListeners.delete(listener);
    window.removeEventListener("focus", listener);
    status?.removeEventListener("change", listener);
  };
}

/** Desktop notifications: the user's switch, the browser's permission, and whether both allow them. */
export function useDesktopAlerts() {
  const on = desktopSwitch.useValue();
  const permission = useSyncExternalStore(subscribePermission, readPermission, () => "unsupported" as const);
  const toggle = useCallback(async () => {
    if (on && permission === "granted") return desktopSwitch.write(false);
    // Asking has to happen in the click itself; browsers ignore requests without a user gesture.
    const granted = permission === "granted" || (await Notification.requestPermission()) === "granted";
    for (const listener of permissionListeners) listener();
    desktopSwitch.write(granted);
  }, [on, permission]);
  return { active: on && permission === "granted", permission, toggle };
}

const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

/** The user is looking at this tab: visible and its window focused. */
const looking = () => document.visibilityState === "visible" && document.hasFocus();

function readFocus(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Records (or clears) that this tab has focus. */
function markFocus(focused: boolean) {
  const now = Date.now();
  const tabs = readFocus();
  for (const [id, at] of Object.entries(tabs)) if (!(now - at < FOCUS_TTL_MS)) delete tabs[id];
  if (focused) tabs[tabId] = now;
  else delete tabs[tabId];
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(tabs));
  } catch {
    // Storage blocked: every tab decides on its own.
  }
}

/** Another tab of this browser has focus and shows the events as toasts. */
function otherTabFocused(): boolean {
  const now = Date.now();
  return Object.entries(readFocus()).some(([id, at]) => id !== tabId && now - at < FOCUS_TTL_MS);
}

/** Tells other tabs whether this one has focus, so unfocused tabs leave events to its toasts. */
export function useFocusBeacon(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const update = () => markFocus(looking());
    const clear = () => markFocus(false);
    update();
    const timer = setInterval(update, FOCUS_BEAT_MS);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", clear);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [active]);
}

/**
 * Claims events for this tab and returns the ones it may announce: across
 * tabs only the first claim wins. Read-check-write runs under a Web Lock, so two
 * tabs polling at the same moment can't both take the same event. Without
 * storage (blocked) every tab announces on its own.
 */
async function claimForThisTab(key: string, ids: number[]): Promise<number[]> {
  const claim = () => {
    let shown: Record<string, number> = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (parsed && typeof parsed === "object") shown = parsed as Record<string, number>;
    } catch {
      return ids;
    }
    const now = Date.now();
    for (const [id, at] of Object.entries(shown)) if (!(now - at < CLAIMS_TTL_MS)) delete shown[id];
    const mine = ids.filter((id) => !(String(id) in shown));
    for (const id of mine) shown[id] = now;
    try {
      localStorage.setItem(key, JSON.stringify(shown));
    } catch {
      // Storage full or blocked: announce anyway.
    }
    return mine;
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(`${key}-lock`, claim) : claim();
}

/** What a native notification shows for one event. */
export interface NativeAlert {
  title: string;
  body: string;
  icon?: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
  onClick: () => void;
}

/** Shows a native notification; false where the browser refuses (some only allow them from a service worker). */
function showNative(alert: NativeAlert): boolean {
  try {
    const n = new Notification(alert.title, { body: alert.body, icon: alert.icon, tag: alert.tag });
    n.onclick = () => {
      window.focus();
      alert.onClick();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Polls a live endpoint (`{ events, cursor }`, `?since=<cursor>`) while
 * mounted. A tab the user is looking at hands new events to `onToasts`; with
 * desktop notifications on, a tab they aren't looking at keeps polling and shows
 * each event natively, unless another Keystar tab has focus. Each event is
 * announced once per browser, in whichever tab claims it first.
 */
export function useLiveFeed<E>(opts: {
  url: string;
  pollMs: number;
  /** localStorage key of the cross-tab claims. */
  claimsKey: string;
  idOf: (e: E) => number;
  onToasts: (events: E[]) => void;
  native: (e: E) => NativeAlert;
}) {
  const desktop = useDesktopAlerts().active;
  // The loop reads these, so neither a new callback nor switching desktop notifications restarts it.
  const latest = useRef({ ...opts, desktop });
  useEffect(() => {
    latest.current = { ...opts, desktop };
  });
  const { url, pollMs } = opts;

  useEffect(() => {
    const seen = new Set<number>();
    let cursor: string | null = null;
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const o = latest.current;
      // Hidden tabs only poll for desktop notifications.
      if (document.visibilityState !== "visible" && !o.desktop) {
        hiddenAt ??= Date.now();
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > RESUME_GAP_MS) cursor = null;
        hiddenAt = null;
        try {
          const res = await fetch(cursor ? `${url}?since=${encodeURIComponent(cursor)}` : url, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as { events: E[]; cursor: string };
            if (cancelled) return;
            const unseen = body.events.filter((e) => !seen.has(o.idOf(e)));
            const lookedAt = looking();
            // A focused tab polls these too (its own cursor) and shows them as toasts where the user is looking.
            if (unseen.length && !(!lookedAt && otherTabFocused())) {
              for (const e of unseen) seen.add(o.idOf(e));
              const mine = new Set(await claimForThisTab(o.claimsKey, unseen.map(o.idOf)));
              // Switched off (unmounted) while the request was out: announce nothing.
              if (cancelled) return;
              const fresh = unseen.filter((e) => mine.has(o.idOf(e)));
              const native = latest.current.desktop && !lookedAt;
              const toasts = native ? fresh.filter((e) => !showNative(o.native(e))) : fresh;
              if (toasts.length) o.onToasts(toasts);
            }
            cursor = body.cursor;
          }
        } catch {
          // Network hiccup: try again on the next tick.
        }
      }
      if (!cancelled) timer = setTimeout(tick, pollMs);
    };
    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, pollMs]);
}
