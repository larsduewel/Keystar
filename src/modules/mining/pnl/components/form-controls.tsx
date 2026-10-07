"use client";

import type { ReactNode } from "react";
import { useFormPending } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Submit button that dims while its form's action runs. */
export function SubmitButton({
  children,
  variant = "glass",
  size = "sm",
  title,
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "glass" | "ghost" | "danger" | "gold";
  size?: "sm" | "md";
  title?: string;
  className?: string;
}) {
  const pending = useFormPending();
  return (
    <Button type="submit" variant={variant} size={size} title={title} disabled={pending} className={cn(pending && "opacity-60", className)}>
      {children}
    </Button>
  );
}

/** A select that submits its form as soon as the value changes (inline table edits). */
export function AutoSubmitSelect({
  name,
  defaultValue,
  label,
  children,
  className,
}: {
  name: string;
  defaultValue: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const pending = useFormPending();
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      disabled={pending}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cn("glass-inset h-8 rounded-lg px-2.5 text-xs text-ink disabled:opacity-60", className)}
    >
      {children}
    </select>
  );
}

/** On/off switch that submits its form (the action flips the value). */
export function SwitchButton({ on, label }: { on: boolean; label: string }) {
  const pending = useFormPending();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      className="group inline-flex items-center gap-2.5 text-left text-xs disabled:opacity-60"
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ring-1 transition-colors ring-inset",
          on ? "bg-accent/80 ring-accent/60" : "bg-surface-contrast/8 ring-surface-contrast/15",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute size-4 rounded-full bg-ink shadow transition-transform duration-200",
            on ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="text-ink-2 group-hover:text-ink">
        {label} <span className={cn("font-semibold", on ? "text-accent" : "text-ink-3")}>{on ? t.pnl.switch.on : t.pnl.switch.off}</span>
      </span>
    </button>
  );
}
