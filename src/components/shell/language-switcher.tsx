"use client";

import { ThemeSwitcher } from "./theme-switcher";
import { Check, ChevronUp, Languages } from "lucide-react";
import { useState, useTransition } from "react";
import { Popover } from "@/components/ui/popover";
import { setLocale, setLocaleFromForm } from "@/i18n/actions";
import { useI18n } from "@/i18n/client";
import { LOCALE_META, LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Sidebar footer, next to the pilot card: current language, choices open upwards. */
export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const switchTo = (next: Locale) => {
    if (next !== locale) startTransition(() => setLocale(next));
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      side="top"
      className="w-44 p-1.5"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${t.shell.language.change} (${LOCALE_META[locale].label})`}
          title={t.shell.language.change}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 text-2xs text-ink-3 transition hover:bg-surface-contrast/[0.06] hover:text-ink",
            pending && "opacity-60",
          )}
        >
          <Languages className="size-3.5" aria-hidden />
          <span className="md:group-data-[sidebar=collapsed]/shell:hidden">{LOCALE_META[locale].label}</span>
          <ChevronUp className="size-3 md:group-data-[sidebar=collapsed]/shell:hidden" aria-hidden />
        </button>
      }
    >
      <div className="eve-label px-2.5 pt-1.5 pb-1 text-2xs text-ink-3">{t.shell.language.label}</div>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => {
            setOpen(false);
            switchTo(l);
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-contrast/6"
        >
          <span className="w-4">{l === locale && <Check className="size-4 text-accent" strokeWidth={3} aria-hidden />}</span>
          <span className={cn("flex-1", l === locale ? "font-semibold text-ink" : "text-ink-2")}>{LOCALE_META[l].label}</span>
          <span className="font-mono text-3xs text-ink-3">{LOCALE_META[l].short}</span>
        </button>
      ))}
    </Popover>
  );
}

/**
 * Inline variant for pages without the sidebar (sign-in, registration, setup).
 * A plain form, so a click works even before the page has hydrated.
 */
export function LanguageLinks({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-3", className)}>
      <form action={setLocaleFromForm} aria-label={t.shell.language.label} className="inline-flex items-center gap-2 text-2xs text-ink-3">
        <Languages className="size-3.5" aria-hidden />
        {LOCALES.map((l, i) => (
          <span key={l} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden>·</span>}
            <button
              type="submit"
              name="locale"
              value={l}
              lang={l}
              aria-pressed={l === locale}
              className={l === locale ? "font-medium text-ink" : "hover:text-ink"}
            >
              {LOCALE_META[l].label}
            </button>
          </span>
        ))}
      </form>
      <ThemeSwitcher />
    </div>
  );
}
