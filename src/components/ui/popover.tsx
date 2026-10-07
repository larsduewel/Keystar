"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

const EDGE_GAP = 8;

/**
 * Shifts an open, absolutely positioned panel sideways so it stays on screen
 * (phones, or a trigger near the edge). Does nothing while the panel fits.
 */
export function useKeepInViewport(ref: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const fit = () => {
      el.style.translate = "";
      const { left, right } = el.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      let shift = Math.min(0, width - EDGE_GAP - right);
      if (left + shift < EDGE_GAP) shift = EDGE_GAP - left;
      if (shift) el.style.translate = `${shift}px 0`;
    };
    fit();
    // Rotating a phone or resizing the window moves the trigger.
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, open]);
}

/** Minimal anchored popover: closes on outside click and Escape, and stays on screen. */
export function Popover({
  open,
  onClose,
  trigger,
  children,
  align = "left",
  side = "bottom",
  className,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  /** "top" opens upwards, for triggers near the bottom of the screen. */
  side?: "top" | "bottom";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useKeepInViewport(panelRef, open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // handled: an enclosing drawer stays open
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "glass absolute z-50 max-w-[calc(100vw-1rem)] bg-space-800/95 shadow-2xl",
            side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
