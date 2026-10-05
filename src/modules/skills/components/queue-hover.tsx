"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface QueueHover {
  position: number | null;
  setPosition: (position: number | null) => void;
}

const HoverContext = createContext<QueueHover>({ position: null, setPosition: () => {} });

/** Shares which queue entry the pointer is on, so the timeline strip and the queue table highlight each other. */
export function QueueHoverProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<number | null>(null);
  return <HoverContext.Provider value={{ position, setPosition }}>{children}</HoverContext.Provider>;
}

function useHover(position: number) {
  const { position: current, setPosition } = useContext(HoverContext);
  return {
    hovered: current === position,
    dimmed: current !== null && current !== position,
    handlers: {
      onMouseEnter: () => setPosition(position),
      onMouseLeave: () => setPosition(null),
    },
  };
}

/**
 * One slice of the timeline strip; brighter while its row is hovered, faded while another entry is. Slices are
 * tab stops so keyboard users can reach each one (its label is read out) and highlight its row.
 */
export function TimelineSegment({
  position,
  width,
  title,
  className,
  children,
}: {
  position: number;
  width: number;
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  const { hovered, dimmed, handlers } = useHover(position);
  const { setPosition } = useContext(HoverContext);
  return (
    <li
      className={cn(
        "h-full min-w-px transition-[opacity,background-color] duration-150 not-last:border-r not-last:border-space-900/80",
        "outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset",
        className,
        hovered && "bg-accent",
        dimmed && "opacity-40",
      )}
      style={{ width: `${width * 100}%` }}
      title={title}
      tabIndex={0}
      onFocus={() => setPosition(position)}
      onBlur={() => setPosition(null)}
      {...handlers}
    >
      {children}
    </li>
  );
}

/** A queue table row that highlights its slice of the strip while the pointer is on it (and is highlighted from it). */
export function QueueRow({ position, className, children }: { position: number; className?: string; children: ReactNode }) {
  const { hovered, handlers } = useHover(position);
  return (
    <tr className={cn(className, hovered && "bg-accent/10")} {...handlers}>
      {children}
    </tr>
  );
}
