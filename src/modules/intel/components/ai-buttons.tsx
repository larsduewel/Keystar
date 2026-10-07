"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { ActionForm, useFormPending } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

function Submit({ label, icon }: { label: string; icon: "sparkles" | "refresh" }) {
  const { t } = useI18n();
  const pending = useFormPending();
  const Icon = icon === "sparkles" ? Sparkles : RefreshCw;
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      <Icon className={pending ? "size-3.5 animate-pulse" : "size-3.5"} aria-hidden />
      {pending ? t.intel.buttons.writing : label}
    </Button>
  );
}

export function RewriteBriefingButton({ action }: { action: () => Promise<ActionResult> }) {
  const { t } = useI18n();
  const m = t.intel.toast;
  return (
    <ActionForm action={action} success={m.briefingWritten} failed={m.writeFailed} errors={m.errors}>
      <Submit label={t.intel.buttons.rewriteBriefing} icon="refresh" />
    </ActionForm>
  );
}

export function WriteDossierButton({ action, again }: { action: () => Promise<ActionResult>; again: boolean }) {
  const { t } = useI18n();
  const m = t.intel.toast;
  return (
    <ActionForm action={action} success={m.dossierWritten} failed={m.writeFailed} errors={m.errors}>
      <Submit label={again ? t.intel.buttons.writeAgain : t.intel.buttons.writeDossier} icon="sparkles" />
    </ActionForm>
  );
}
