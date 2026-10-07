"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { ActionForm, useFormPending } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

function Submit() {
  const pending = useFormPending();
  const { t } = useI18n();
  return <Button variant="primary" size="sm" type="submit" disabled={pending}><Sparkles className="size-4" aria-hidden />{pending ? t.intel.buttons.writing : t.intel.buttons.rewriteBriefing}</Button>;
}

export function BriefingControl({ action, children }: { action?: () => Promise<ActionResult>; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return <>
    <Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}><Sparkles className="size-4" aria-hidden />{t.intel.buttons.briefing}</Button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={t.intel.buttons.briefing} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} className="relative max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-space-900 shadow-xl">
        <Button type="button" size="sm" variant="ghost" autoFocus className="absolute right-2 top-2 z-10" aria-label={t.intel.buttons.closeBriefing} onClick={() => setOpen(false)}><X className="size-4" aria-hidden /></Button>
        {children}
        {action && <ActionForm action={action} success={t.intel.toast.briefingWritten} failed={t.intel.toast.writeFailed} errors={t.intel.toast.errors} className="border-t border-surface-contrast/10 p-4"><Submit /></ActionForm>}
      </div>
    </div>}
  </>;
}
