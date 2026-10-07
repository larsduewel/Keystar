"use client";

import { CircleHelp } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { useHelp } from "./help-provider";

/** The top bar's "?" button, next to Alerts. */
export function HelpButton() {
  const { t } = useI18n();
  const { openHelp } = useHelp();
  return (
    <button
      type="button"
      onClick={() => openHelp()}
      aria-haspopup="dialog"
      aria-keyshortcuts="?"
      title={t.help.buttonTitle}
      className="flex h-8 items-center gap-1.5 rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-2.5 text-xs text-ink-3 transition hover:text-ink"
    >
      <CircleHelp className="size-3.5" aria-hidden />
      <span className="sr-only sm:not-sr-only">{t.help.button}</span>
    </button>
  );
}
