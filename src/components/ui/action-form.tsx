"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";

const PendingContext = createContext(false);

/**
 * True while the surrounding form's action runs, for an `ActionForm` as well
 * as a plain `<form action>`: submit buttons and switches that dim themselves.
 */
export function useFormPending(): boolean {
  const { pending } = useFormStatus();
  return useContext(PendingContext) || pending;
}

/**
 * A form that runs a server action and confirms the outcome in a toast. Pass
 * the action already bound to its arguments (it also receives the form's
 * fields) and the texts already translated (`errors` is keyed by the action's
 * error codes and needs an `unknown` entry). Controls are disabled while the
 * action runs.
 *
 * Without `success`, only a failure shows a toast (inline edits whose result
 * is visible on the page). With `successByField`, the title is picked by the
 * submitted value of that field instead. With `confirm`, the browser asks that
 * question first and nothing runs on cancel. `reset` clears the fields after a
 * success (forms that add an entry) or a failure (a select that saves on change,
 * so it doesn't keep showing a value that wasn't saved). With `redirectTo`, a
 * success navigates there.
 *
 * Submitted by hand rather than through `<form action>`: React resets a form
 * after its action, which would throw away a rejected entry.
 */
export function ActionForm({
  action,
  success,
  successByField,
  successDetail,
  failed,
  errors,
  confirm,
  reset,
  redirectTo,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  success?: string;
  successByField?: { name: string; titles: Record<string, string> };
  successDetail?: string;
  failed: string;
  errors: Record<string, string> & { unknown: string };
  confirm?: string;
  reset?: "success" | "failure";
  redirectTo?: string;
  className?: string;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          let result: ActionResult | null = null;
          try {
            result = await action(data);
          } catch {
            // Signed out or a server error; the generic message covers both.
          }
          if (result?.ok) {
            const title = successByField ? successByField.titles[String(data.get(successByField.name))] : success;
            if (title) toast({ tone: "good", title, description: successDetail });
            if (reset === "success") form.reset();
            if (redirectTo) router.push(redirectTo);
          } else {
            toast({ tone: "critical", title: failed, description: (result && errors[result.error]) || errors.unknown });
            if (reset === "failure") form.reset();
          }
        });
      }}
    >
      <PendingContext.Provider value={pending}>
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </PendingContext.Provider>
    </form>
  );
}
