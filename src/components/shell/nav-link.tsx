"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { isActivePath, matchNavItem } from "./nav-match";
import { markNavSeen, useNavNew } from "./nav-news";

/**
 * Sidebar link. `exact` is set when another nav item is nested below this one
 * (e.g. /mining vs /mining/ledger) so only the most specific item lights up.
 * `inFlyout` renders it in the collapsed rail's hover card (RailFlyout): full
 * width, no side marker, out of the tab order. `newKey` ("version:href") marks a page that is
 * new in this release with a dot until it is opened (nav-news.ts). The icon takes the
 * section colour when the link is active or hovered.
 */
export function NavLink({
  href,
  exact,
  inFlyout,
  newKey,
  children,
}: {
  href: string;
  exact?: boolean;
  inFlyout?: boolean;
  newKey?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const isActive = isActivePath(pathname, href, exact);
  const isNew = useNavNew(newKey);
  useEffect(() => {
    if (isActive && newKey) markNavSeen(newKey);
  }, [isActive, newKey]);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      tabIndex={inFlyout ? -1 : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.84rem] transition-colors",
        isActive
          ? "bg-surface-contrast/[0.07] text-ink [&_svg]:text-(--section) [&_svg]:opacity-100"
          : "text-ink-2 hover:bg-surface-contrast/[0.04] hover:text-ink hover:[&_svg]:text-(--section) hover:[&_svg]:opacity-100",
      )}
    >
      {isActive && !inFlyout && (
        <span className="absolute top-1.5 bottom-1.5 -left-3 w-[2px] rounded-full bg-(--section)" aria-hidden />
      )}
      {children}
      {isNew && !isActive && (
        <>
          <span
            aria-hidden
            className={cn(
              "ml-auto size-1.5 shrink-0 rounded-full bg-accent",
              // In the collapsed rail, on the icon's corner.
              !inFlyout &&
                "md:group-data-[sidebar=collapsed]/shell:absolute md:group-data-[sidebar=collapsed]/shell:top-1.5 md:group-data-[sidebar=collapsed]/shell:left-[1.45rem] md:group-data-[sidebar=collapsed]/shell:ring-2 md:group-data-[sidebar=collapsed]/shell:ring-space-900",
            )}
          />
          <span className="sr-only">{t.help.newBadge}</span>
        </>
      )}
    </Link>
  );
}

/** Current page title for the top-bar breadcrumb. */
export function CurrentPageCrumb({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  const match = matchNavItem(pathname, items);
  return <span className="min-w-0 truncate font-medium text-ink">{match?.label ?? "Keystar"}</span>;
}
