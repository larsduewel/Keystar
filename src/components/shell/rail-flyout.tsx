"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SectionTone } from "@/core/modules/types";
import { DESKTOP_QUERY, useSidebar } from "./sidebar-state";

const CLOSE_DELAY_MS = 120;

/**
 * Hover card for the collapsed sidebar rail: shows `card` beside the rail while
 * the pointer (or keyboard focus) is on the trigger. The card's
 * `[data-flyout-anchor]` lines up with the trigger's, so a section's links sit
 * level with its icons. It is a mouse shortcut only (`aria-hidden`, links out
 * of the tab order): the rail links already carry their labels as sr-only text.
 * Rendered into <body> so the nav's scroll clipping can't cut it off; `tone`
 * and the `group` class let the card tint its heading like the sidebar does.
 */
export function RailFlyout({
  card,
  tone,
  className,
  children,
}: {
  card: ReactNode;
  tone?: SectionTone;
  className?: string;
  children: ReactNode;
}) {
  const { collapsed, fading } = useSidebar();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    clearTimeout(closeTimer.current);
    // The rail only exists from `md` up; the phone drawer shows full labels.
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    setOpen(true);
    setOpenedAt(pathname);
  }, [pathname]);
  const hideSoon = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(closeTimer.current);
    setOpen(false);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Navigating (e.g. clicking a link in the card) closes it.
  const visible = open && collapsed && !fading && openedAt === pathname;

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const el = cardRef.current;
    if (!visible || !trigger || !el) return;
    const rail = document.getElementById("app-sidebar")?.getBoundingClientRect();
    const target = (trigger.querySelector("[data-flyout-anchor]") ?? trigger).getBoundingClientRect();
    const anchor = el.querySelector<HTMLElement>("[data-flyout-anchor]");
    const top = target.top - (anchor?.offsetTop ?? 0);
    const maxTop = window.innerHeight - el.offsetHeight - 8;
    el.style.left = `${(rail?.right ?? target.right) + 8}px`;
    el.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [visible, hide]);

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={hideSoon}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={cardRef}
            aria-hidden
            data-section-tone={tone}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            style={{ position: "fixed" }}
            className="glass group z-50 min-w-44 bg-space-800/95 p-1.5 shadow-2xl transition-[opacity,translate] duration-100 starting:-translate-x-1 starting:opacity-0 motion-reduce:transition-none"
          >
            {card}
          </div>,
          document.body,
        )}
    </div>
  );
}
