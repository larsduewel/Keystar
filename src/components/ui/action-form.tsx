"use client";

import { useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";

/**
 * A form around one button that runs a server action and confirms the outcome
 * in a toast. Pass the action already bound to its arguments and the texts
 * already translated (`errors` is keyed by the action's error codes and needs
 * an `unknown` entry). The button is disabled while the action runs.
 */
export function ActionForm({
  action,
  success,
  successDetail,
  failed,
  errors,
  className,
  children,
}: {
  action: () => Promise<ActionResult>;
  success: string;
  successDetail?: string;
  failed: string;
  errors: Record<string, string> & { unknown: string };
  className?: string;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          let result: ActionResult | null = null;
          try {
            result = await action();
          } catch {
            // Signed out or a server error; the generic message covers both.
          }
          if (result?.ok) toast({ tone: "good", title: success, description: successDetail });
          else toast({ tone: "critical", title: failed, description: (result && errors[result.error]) || errors.unknown });
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
