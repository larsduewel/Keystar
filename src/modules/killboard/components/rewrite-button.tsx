"use client";

import { RefreshCw } from "lucide-react";
import { ActionForm, useFormPending } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

function Submit() {
  const pending = useFormPending();
  const { t } = useI18n();
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
      {pending ? t.killboard.report.rewriting : t.killboard.report.rewrite}
    </Button>
  );
}

/** Rewrites this week's situation report and confirms it in a toast. */
export function RewriteReportButton({ action }: { action: () => Promise<ActionResult> }) {
  const { t } = useI18n();
  const m = t.killboard.report.toast;
  return (
    <ActionForm action={action} success={m.rewritten} failed={m.failed} errors={m.errors}>
      <Submit />
    </ActionForm>
  );
}
