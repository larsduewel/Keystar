"use client";

import { Trash2, UserSearch } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

function SubmitButton({ children, pendingLabel, variant = "ghost" }: { children: React.ReactNode; pendingLabel: string; variant?: "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" variant={variant} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function ProfileRemainingButton({ scanId, count, action }: { scanId: string; count: number; action: (formData: FormData) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <SubmitButton pendingLabel={t.intel.buttons.queuing}>
        <UserSearch className="size-3.5" aria-hidden />
        {t.intel.buttons.profileMore(count)}
      </SubmitButton>
    </form>
  );
}

export function DeleteScanButton({ scanId, action }: { scanId: string; action: (formData: FormData) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t.intel.buttons.confirmDelete)) e.preventDefault();
      }}
    >
      <input type="hidden" name="scanId" value={scanId} />
      <SubmitButton pendingLabel={t.intel.buttons.deleting} variant="danger">
        <Trash2 className="size-3.5" aria-hidden />
        {t.intel.buttons.delete}
      </SubmitButton>
    </form>
  );
}
