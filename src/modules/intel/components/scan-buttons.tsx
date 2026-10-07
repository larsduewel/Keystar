"use client";

import { Trash2, UserSearch } from "lucide-react";
import { ActionForm, useFormPending } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

function SubmitButton({ children, pendingLabel, variant = "ghost" }: { children: React.ReactNode; pendingLabel: string; variant?: "ghost" | "danger" }) {
  const pending = useFormPending();
  return (
    <Button size="sm" variant={variant} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function ProfileRemainingButton({ count, action }: { count: number; action: () => Promise<ActionResult> }) {
  const { t } = useI18n();
  const m = t.intel.toast;
  return (
    <ActionForm action={action} success={m.profiling(count)} failed={m.profileFailed} errors={m.errors}>
      <SubmitButton pendingLabel={t.intel.buttons.queuing}>
        <UserSearch className="size-3.5" aria-hidden />
        {t.intel.buttons.profileMore(count)}
      </SubmitButton>
    </ActionForm>
  );
}

/** Deletes the scan after a confirmation and goes back to the scan list. */
export function DeleteScanButton({ action }: { action: () => Promise<ActionResult> }) {
  const { t } = useI18n();
  const m = t.intel.toast;
  return (
    <ActionForm
      action={action}
      confirm={t.intel.buttons.confirmDelete}
      success={m.deleted}
      failed={m.deleteFailed}
      errors={m.errors}
      redirectTo="/intel"
    >
      <SubmitButton pendingLabel={t.intel.buttons.deleting} variant="danger">
        <Trash2 className="size-3.5" aria-hidden />
        {t.intel.buttons.delete}
      </SubmitButton>
    </ActionForm>
  );
}
