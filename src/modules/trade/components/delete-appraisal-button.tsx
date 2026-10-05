"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

/**
 * Small trash button that deletes one of the caller's own appraisals after a
 * confirmation, then reports the outcome in a toast. `labelled` shows the text
 * next to the icon (result page); without it the button is icon-only with an
 * accessible name (recent list). With `backTo`, a successful delete navigates
 * there, since the deleted appraisal's page no longer exists.
 */
export function DeleteAppraisalButton({
  action,
  labelled = false,
  backTo,
}: {
  action: () => Promise<ActionResult>;
  labelled?: boolean;
  backTo?: string;
}) {
  const { t } = useI18n();
  const m = t.trade.delete;
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!window.confirm(m.confirm)) return;
    startTransition(async () => {
      let result: ActionResult | null = null;
      try {
        result = await action();
      } catch {
        // Signed out or a server error; the generic message covers both.
      }
      if (result?.ok) {
        toast({ tone: "good", title: m.deleted });
        if (backTo) router.push(backTo);
      } else {
        const errors: Record<string, string> = m.errors;
        toast({ tone: "critical", title: m.failed, description: (result && errors[result.error]) || m.errors.unknown });
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={labelled ? "danger" : "ghost"}
      className={labelled ? undefined : "size-7 shrink-0 px-0 text-ink-3 hover:text-critical-text"}
      title={m.hint}
      aria-label={labelled ? undefined : m.hint}
      aria-busy={pending}
      disabled={pending}
      onClick={onClick}
    >
      <Trash2 className="size-3.5" aria-hidden />
      {labelled && m.button}
    </Button>
  );
}
