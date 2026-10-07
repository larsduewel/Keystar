"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { SectionTone } from "@/core/modules/types";
import { matchNavItem } from "./nav-match";
import { MobileNavBackdrop, useSidebar } from "./sidebar-state";

/**
 * App shell root. Sets `data-section-tone` from the current route so the
 * section colour (`--section` in globals.css) reaches headings, the sidebar
 * marker and the header glow, and `data-sidebar` so the server-rendered
 * sidebar can style its collapsed icon rail (`md:group-data-[sidebar=collapsed]/shell:`)
 * and, on phones, its drawer (`group-data-[mobile-nav=open]/shell:`).
 */
export function SectionScope({
  items,
  children,
}: {
  items: { href: string; exact?: boolean; tone?: SectionTone }[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tone = matchNavItem(pathname, items)?.tone;
  const { collapsed, fading, mobileOpen } = useSidebar();
  return (
    <div
      className="group/shell flex min-h-screen"
      data-section-tone={tone}
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      data-sidebar-fading={fading || undefined}
      data-mobile-nav={mobileOpen ? "open" : "closed"}
    >
      {children}
      <MobileNavBackdrop />
    </div>
  );
}
