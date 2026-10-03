"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Radar } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { ScanFormState } from "@/app/(app)/intel/actions";

function Submit({ label }: { label: string }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button size="sm" type="submit" disabled={pending}>
      {pending ? t.intel.buttons.matching : label}
    </Button>
  );
}

/** Paste (or replace) the d-scan of a scan. */
export function DscanForm({
  scanId,
  action,
  replace,
}: {
  scanId: string;
  action: (state: ScanFormState, formData: FormData) => Promise<ScanFormState>;
  replace: boolean;
}) {
  const { t } = useI18n();
  const [state, formAction] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="scanId" value={scanId} />
      <textarea
        name="dscan"
        aria-label={t.intel.dscan.title}
        required
        placeholder={t.intel.dscan.placeholder}
        spellCheck={false}
        className="glass-inset block h-24 w-full resize-y rounded-lg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3"
      />
      <div className="flex items-center gap-3">
        <Submit label={replace ? t.intel.buttons.replaceDscan : t.intel.buttons.matchDscan} />
        {state.error && <span className="text-xs text-critical-text">{state.error}</span>}
      </div>
    </form>
  );
}

export function ReadDscanButton({ scanId, action, claude }: { scanId: string; action: (formData: FormData) => Promise<void>; claude: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <ReadSubmit claude={claude} />
    </form>
  );
}

function ReadSubmit({ claude }: { claude: boolean }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      {pending ? t.intel.buttons.reading : claude ? t.intel.buttons.askClaude : t.intel.buttons.summarize}
    </Button>
  );
}

/** Keeps input and matching evidence together without occupying report space. */
export function DscanDropdown({ supplied, children }: { supplied: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <Button size="sm" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Radar className="size-4" aria-hidden />
        {supplied ? t.intel.dscan.manage : t.intel.dscan.add}
        <ChevronDown className="size-3" aria-hidden />
      </Button>
      {open && (
        <div id={id} className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-space-900 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}
