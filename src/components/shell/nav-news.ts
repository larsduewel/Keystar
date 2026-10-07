"use client";

import { useSyncExternalStore } from "react";

/*
 * The sidebar's "New" dots (navNews in src/core/help/onboarding.ts): which of the current
 * release's pages this browser has opened, as "version:href" entries in localStorage. Other
 * tabs follow through the storage event; without storage the dots go for this page only.
 */

const KEY = "ks_nav_seen";
const listeners = new Set<() => void>();
let fallback: string[] = [];
let parsed: { raw: string | null; entries: Set<string> } | null = null;

function seen(): Set<string> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return new Set(fallback);
  }
  if (parsed?.raw !== raw) {
    let entries: string[] = [];
    try {
      const value: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(value)) entries = value.filter((e): e is string => typeof e === "string");
    } catch {
      // A damaged value counts as nothing seen.
    }
    parsed = { raw, entries: new Set([...entries, ...fallback]) };
  }
  return parsed.entries;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Remembers that the page of `entry` ("version:href") was opened; drops other versions' entries. */
export function markNavSeen(entry: string) {
  const current = seen();
  if (current.has(entry)) return;
  const version = entry.slice(0, entry.indexOf(":") + 1);
  const next = [...current].filter((e) => e.startsWith(version)).concat(entry);
  fallback = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: `fallback` keeps it for this page.
  }
  parsed = null;
  for (const listener of listeners) listener();
}

/** Whether to show the dot for `entry`; never on the server, so hydration matches and the dot appears after it. */
export function useNavNew(entry: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(entry) && !seen().has(entry!),
    () => false,
  );
}
