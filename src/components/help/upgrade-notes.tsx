"use client";

import { ExternalLink, ServerCog } from "lucide-react";
import type { ReactNode } from "react";
import type { WhatsNewDigest } from "@/core/help/onboarding";
import { upgradeText } from "@/core/help/releases";
import { useI18n } from "@/i18n/client";

/** "Action needed": a release's upgrade notes for whoever runs the server (admins), with links to the release notes. */
export function UpgradeNotes({ upgrades, intro, level = 3 }: { upgrades: WhatsNewDigest["upgrades"]; intro: ReactNode; level?: 3 | 4 }) {
  const { t } = useI18n();
  const w = t.whatsNew;
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <section className="rounded-lg bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/30 ring-inset">
      <Heading className="flex items-center gap-2 font-medium text-warning">
        <ServerCog className="size-4" aria-hidden /> {w.actionNeeded.title}
      </Heading>
      <p className="mt-1 text-xs text-ink-2">{intro}</p>
      <ul className="mt-2 space-y-2">
        {upgrades.map(({ version, href }) => (
          <li key={version} className="text-xs">
            <p className="text-ink">{upgradeText(t, version)}</p>
            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-accent hover:underline">
              {w.actionNeeded.link(version)} <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">{t.common.opensInNewTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
