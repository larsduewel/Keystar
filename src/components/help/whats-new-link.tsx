"use client";

import type { MouseEvent, ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { isPlainClick } from "./clicks";
import { useHelp } from "./help-provider";

/**
 * The sidebar's version: opens What's new when the running release has highlights; otherwise (a patch
 * release, a test build) and on a modified click (new tab), it is a plain link to the release notes or,
 * for a test build, the commit.
 */
export function WhatsNewLink({
  href,
  prerelease,
  title,
  className,
  children,
}: {
  href: string;
  prerelease: boolean;
  /** The link's own title (release notes, or the unstable build warning). */
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { latest, current, openWhatsNew } = useHelp();
  // Older highlights would hide the running version's notes behind a dialog about another release.
  const opens = !prerelease && latest?.version === current;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!opens || !isPlainClick(e)) return;
    e.preventDefault();
    openWhatsNew();
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-haspopup={opens ? "dialog" : undefined}
      title={opens ? t.help.whatsNew(current) : title}
      className={className}
    >
      {children}
    </a>
  );
}
