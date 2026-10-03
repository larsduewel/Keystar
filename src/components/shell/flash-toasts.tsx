"use client";

import { useEffect, useRef } from "react";
import { useToast, type ToastOptions } from "@/components/ui/toast";
import { FLASH_COOKIE, parseFlash, type Flash } from "@/core/flash";
import { useI18n } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";

function readFlashCookie(): string | null {
  const prefix = `${FLASH_COOKIE}=`;
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

/**
 * Shows the one-shot message the SSO callback left in a cookie (see
 * core/flash.ts) and deletes it. `scopeLabels` names the opt-in scopes.
 */
export function FlashToasts({ scopeLabels }: { scopeLabels: Record<string, string> }) {
  const { toast } = useToast();
  const { t } = useI18n();
  // Read once per page load: a re-render of a page that was already open (another tab) mustn't take the message.
  const labels = useRef(scopeLabels);
  const shown = useRef(false);

  useEffect(() => {
    labels.current = scopeLabels;
  }, [scopeLabels]);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    const raw = readFlashCookie();
    if (raw === null) return;
    document.cookie = `${FLASH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    const flash = parseFlash(raw);
    if (flash) toast(flashToast(flash, t.characters, labels.current));
  }, [toast, t]);

  return null;
}

function flashToast(flash: Flash, m: Messages["characters"], labels: Record<string, string>): ToastOptions {
  const name = flash.name ?? m.sso.character;
  const list = (scopes: string[] | undefined) => (scopes ?? []).map((s) => labels[s] ?? s).join(", ");
  switch (flash.kind) {
    case "linked":
      return { tone: "good", title: m.sso.linked(name), description: m.sso.linkedDetail };
    case "reauthorized":
      return { tone: "good", title: m.sso.reauthorized(name) };
    case "corpGranted":
      return { tone: "good", title: m.sso.corpGranted(name) };
    case "scopesChanged": {
      const parts = [
        flash.added?.length ? m.sso.added(list(flash.added)) : null,
        flash.removed?.length ? m.sso.removed(list(flash.removed)) : null,
      ].filter(Boolean);
      return { tone: "good", title: m.sso.scopesChanged(name), description: parts.join(" · ") || undefined };
    }
    case "linkFailed":
      if (flash.code === "wrongCharacter" && flash.name) {
        return {
          tone: "warning",
          title: m.sso.wrongCharacter(flash.name),
          description: m.sso.wrongCharacterDetail(flash.expected ?? m.sso.character),
          durationMs: 15_000,
        };
      }
      return { tone: "critical", title: m.sso.failed, description: m.sso.errors[flash.code ?? "failed"] };
  }
}
