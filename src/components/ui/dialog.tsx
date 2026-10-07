"use client";

import { X } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const sizes = {
  md: "max-h-[min(780px,calc(100dvh-2rem))] w-[min(660px,calc(100vw-2rem))]",
  lg: "max-h-[min(820px,calc(100dvh-2rem))] w-[min(960px,calc(100vw-2rem))]",
  xl: "max-h-[min(860px,calc(100dvh-2rem))] w-[min(1040px,calc(100vw-2rem))]",
} as const;

/**
 * A modal on the native `<dialog>` element; open it with `ref.current.showModal()`. The browser
 * puts it in the top layer (above the blurred top bar), keeps focus inside, makes the page
 * behind it inert, closes it on Escape and returns focus to where it was. Clicking the
 * backdrop or the close button closes it too.
 */
export function Dialog({
  ref,
  icon,
  title,
  intro,
  closeLabel,
  footer,
  size = "xl",
  labelledBy,
  onClose,
  children,
}: {
  ref: Ref<HTMLDialogElement>;
  icon: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  closeLabel: string;
  footer?: ReactNode;
  size?: keyof typeof sizes;
  /** Id for the title; generated when omitted. */
  labelledBy?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const titleId = labelledBy ?? `${id}title`;
  const introId = `${id}intro`;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={intro ? introId : undefined}
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className={cn(
        "m-auto overflow-hidden rounded-2xl bg-transparent p-0 text-ink backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
        sizes[size],
      )}
    >
      <div className="glass flex max-h-[inherit] flex-col bg-space-800/95">
        <header className="flex items-start gap-3.5 border-b border-surface-contrast/[0.075] px-6 pt-5 pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent/12 text-accent">{icon}</span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            {intro && (
              <p id={introId} className="mt-1 text-sm text-ink-2">
                {intro}
              </p>
            )}
          </div>
          <form method="dialog">
            <Button type="submit" variant="ghost" className="size-9 px-0" aria-label={closeLabel}>
              <X className="size-4" aria-hidden />
            </Button>
          </form>
        </header>
        {children}
        {footer}
      </div>
    </dialog>
  );
}

/** The bar below a dialog's content, for its buttons. */
export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <footer className={cn("flex flex-wrap items-center gap-3 border-t border-surface-contrast/[0.075] px-6 py-3.5", className)}>
      {children}
    </footer>
  );
}
