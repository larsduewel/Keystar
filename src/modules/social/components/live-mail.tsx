"use client";

import { useCallback, useState } from "react";
import { useLiveFeed } from "@/components/shell/live-feed";
import { Toast, ToastViewport } from "@/components/ui/toast";
import { allianceLogo, characterPortrait, corporationLogo } from "@/core/eve/images";
import { useI18n } from "@/i18n/client";
import type { LiveMail as LiveMailEvent } from "../queries";
import { EntityAvatar } from "./entity-avatar";

/** The worker imports mail every five minutes; half a minute keeps the toast close to that. */
const POLL_MS = 30_000;
const TOAST_MS = 30_000;
const MAX_VISIBLE = 3;
const MAIL_COLOR = "var(--color-accent)";

const mailUrl = (m: LiveMailEvent) => `/mail?mail=${m.characterId}-${m.mailId}`;

function senderIcon(m: LiveMailEvent): string | undefined {
  switch (m.fromCategory) {
    case "character":
      return characterPortrait(m.fromId, 128);
    case "corporation":
      return corporationLogo(m.fromId, 128);
    case "alliance":
      return allianceLogo(m.fromId, 128);
    default:
      return undefined;
  }
}

/**
 * Live notifications for new EVE mail in the viewer's own mailboxes: toasts,
 * or desktop notifications while the user isn't looking at Keystar. Each opens
 * the mail in Keystar. Registered as `social.mail` in src/modules/alerts.ts.
 */
export function LiveMail() {
  const { t } = useI18n();
  const l = t.social.live;
  const [toasts, setToasts] = useState<LiveMailEvent[]>([]);

  useLiveFeed<LiveMailEvent>({
    url: "/api/mail/live",
    pollMs: POLL_MS,
    claimsKey: "ks_mail_alerts_shown",
    idOf: (m) => m.mailId,
    onToasts: (mails) => setToasts((list) => [...list, ...mails]),
    native: (m) => ({
      title: l.from(m.fromName ?? l.unknownSender),
      body: [m.subject || l.noSubject, recipientLine(l, m)].join("\n"),
      icon: senderIcon(m),
      tag: `mail-${m.mailId}`,
      onClick: () => window.location.assign(mailUrl(m)),
    }),
  });

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((m) => m.mailId !== id)), []);

  return (
    <ToastViewport label={l.region}>
      {toasts
        .slice(0, MAX_VISIBLE)
        .reverse()
        .map((m) => (
          <MailToast key={m.mailId} mail={m} onDismiss={dismiss} />
        ))}
    </ToastViewport>
  );
}

type LiveText = ReturnType<typeof useI18n>["t"]["social"]["live"];

/** "To <character>", plus the corporation, alliance or mailing list it went to. */
function recipientLine(l: LiveText, m: LiveMailEvent): string {
  const to = l.to(m.characterName ?? l.yourCharacter);
  const via = m.kind === "list" ? (m.listName ?? l.kind.list) : m.kind === "direct" ? null : l.kind[m.kind];
  return via ? `${to} · ${via}` : to;
}

function MailToast({ mail: m, onDismiss }: { mail: LiveMailEvent; onDismiss: (id: number) => void }) {
  const { t, f } = useI18n();
  const l = t.social.live;
  const close = useCallback(() => onDismiss(m.mailId), [onDismiss, m.mailId]);

  return (
    <Toast href={mailUrl(m)} newTab={false} linkLabel={l.open} dismissLabel={l.dismiss} color={MAIL_COLOR} durationMs={TOAST_MS} onDismiss={close}>
      <EntityAvatar id={m.fromId} category={m.fromCategory} size={40} className="self-start" />
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="eve-label inline-flex items-center gap-1.5 text-3xs text-ink-2">
            <span className="size-2 rounded-full" style={{ background: MAIL_COLOR }} aria-hidden />
            {l.title}
          </span>
          <span className="text-3xs text-ink-3 tabular-nums">{f.relativeTime(m.sentAt)}</span>
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-ink">{m.subject || l.noSubject}</div>
        <div className="truncate text-ink-2">{l.from(m.fromName ?? l.unknownSender)}</div>
        <div className="truncate text-ink-3">{recipientLine(l, m)}</div>
      </div>
    </Toast>
  );
}
