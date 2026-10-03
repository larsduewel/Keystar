"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return <Button variant="primary" size="sm" type="submit" disabled={pending}><Sparkles className="size-4" aria-hidden />{pending ? t.intel.buttons.writing : t.intel.buttons.briefing}</Button>;
}

export function BriefingControl({ scanId, action, children }: { scanId: string; action: (data: FormData) => Promise<void>; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return <>
    <form action={action} onSubmit={() => setOpen(true)}><input type="hidden" name="scanId" value={scanId} /><Submit /></form>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={t.intel.buttons.briefing} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} className="relative max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-space-900 shadow-xl">
        <Button type="button" size="sm" variant="ghost" autoFocus className="absolute right-2 top-2 z-10" aria-label={t.intel.buttons.closeBriefing} onClick={() => setOpen(false)}><X className="size-4" aria-hidden /></Button>
        {children}
      </div>
    </div>}
  </>;
}
