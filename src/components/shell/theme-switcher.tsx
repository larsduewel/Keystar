"use client";

import { Moon, Sun } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useI18n } from "@/i18n/client";
import { useTheme } from "@/theme/client";
import { setThemeFromForm } from "@/theme/actions";

function ThemeButton() {
  const { t } = useI18n();
  const theme = useTheme();
  const { pending } = useFormStatus();
  const light = theme === "light";
  const Icon = light ? Sun : Moon;
  return (
    <button
      type="submit"
      name="theme"
      value={light ? "dark" : "light"}
      disabled={pending}
      // The visible current theme is the accessible name (WCAG 2.5.3); the title describes the action.
      title={light ? t.shell.theme.toDark : t.shell.theme.toLight}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-2xs text-ink-3 transition hover:bg-surface-contrast/6 hover:text-ink disabled:opacity-60"
    >
      <Icon className="size-3.5" aria-hidden />
      {/* Icon only on the collapsed sidebar rail; the label stays the accessible name. */}
      <span className="md:group-data-[sidebar=collapsed]/shell:sr-only">{light ? t.shell.theme.light : t.shell.theme.dark}</span>
    </button>
  );
}

/** Native form also works before hydration; root revalidation updates all pages. */
export function ThemeSwitcher() {
  return (
    <form action={setThemeFromForm}>
      <ThemeButton />
    </form>
  );
}
