import { Building2, Inbox, KeyRound, Layers, Mail, Send, Shield, Trash2, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { reauthorizeHref } from "@/core/modules/registry";
import type { Messages } from "@/i18n/messages";
import type { ActionResult } from "@/lib/action-result";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { folderKey, mailHref, type MailFolder, type MailParams } from "../filters";
import { MAIL_SCOPE } from "../module";
import type { FolderCounts, Mailbox } from "../queries";
import { LabelDot } from "./label-dot";

type T = Messages["social"];

function Count({ value, label }: { value: number; label: string }) {
  if (!value) return null;
  return (
    <span title={label} className="ml-auto rounded-full bg-accent/15 px-1.5 text-2xs font-semibold text-accent tabular-nums">
      {value}
    </span>
  );
}

function NavRow({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-contrast/6 hover:text-ink",
        active && "bg-surface-contrast/8 text-ink",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The viewer's characters: filter, mail access on/off, import status. Stopping
 * (and turning back on while the token still holds the scope) happens in
 * Keystar through `switchAction`; a first enable goes through the EVE login.
 */
export function MailboxPanel({
  mailboxes,
  unreadTotal,
  params,
  t,
  switchText,
  f,
  demo,
  deleteAction,
  switchAction,
}: {
  mailboxes: Mailbox[];
  unreadTotal: number;
  params: MailParams;
  t: T;
  switchText: Messages["characters"]["scopeSwitch"];
  f: Formatter;
  demo: boolean;
  deleteAction: (characterId: number) => Promise<ActionResult>;
  switchAction: (characterId: number, scope: string, enabled: boolean) => Promise<ActionResult>;
}) {
  const m = t.characters;
  const sw = switchText;
  const label = t.module.scopes.readMailLabel;
  return (
    <Panel title={m.title} bodyClassName="px-3 pb-3">
      {mailboxes.length === 0 ? (
        <p className="px-2 text-sm text-ink-3">{m.noCharacters}</p>
      ) : (
        <ul className="space-y-1">
          {mailboxes.length > 1 && (
            <li>
              <NavRow href={mailHref(params, { characterId: null })} active={params.characterId === null}>
                <Users className="size-4 text-ink-3" aria-hidden />
                <span className="truncate">{m.all}</span>
                <Count value={unreadTotal} label={m.unreadTitle(unreadTotal)} />
              </NavRow>
            </li>
          )}
          {mailboxes.map((b) => {
            const returnTo = mailHref(params, { characterId: b.characterId });
            const status =
              b.tokenStatus === "invalid" ? (
                <StatusBadge status="error" label={m.revoked} />
              ) : b.granted ? (
                <StatusBadge status={b.lastStatus === "error" ? "warning" : "ok"} label={m.on} />
              ) : (
                <StatusBadge status="pending" label={m.off} />
              );
            const detail = b.granted
              ? b.lastSuccessAt
                ? m.mails(b.mails, f.relativeTime(b.lastSuccessAt))
                : m.firstImport
              : b.mails > 0
                ? m.kept(b.mails)
                : null;
            return (
              <li key={b.characterId} className="space-y-1.5">
                <NavRow href={returnTo} active={params.characterId === b.characterId}>
                  <Portrait id={b.characterId} size={24} />
                  <span className="truncate">{b.name}</span>
                  <Count value={b.unread} label={m.unreadTitle(b.unread)} />
                </NavRow>
                <div className="flex flex-wrap items-center gap-1.5 pl-[2.6rem]">
                  {status}
                  {b.granted || b.switchedOff ? (
                    <ActionForm
                      action={switchAction.bind(null, b.characterId, MAIL_SCOPE, !b.granted)}
                      success={b.granted ? sw.off(label, b.name) : sw.on(label, b.name)}
                      successDetail={b.granted ? sw.offDetail : undefined}
                      failed={sw.failed(label, b.name)}
                      errors={sw.errors}
                    >
                      {b.granted ? (
                        <Button type="submit" size="sm" variant="ghost" title={m.stopHint} className="h-6 px-2">
                          {m.stop}
                        </Button>
                      ) : (
                        <Button type="submit" size="sm" variant="primary" className="h-6 px-2">
                          <Mail className="size-3" aria-hidden /> {m.enable}
                        </Button>
                      )}
                    </ActionForm>
                  ) : demo ? (
                    <Button size="sm" variant="ghost" disabled title={m.demo} className="h-6 px-2">
                      <KeyRound className="size-3" aria-hidden /> {m.enable}
                    </Button>
                  ) : (
                    <ButtonLink
                      href={reauthorizeHref(b.grantedScopes, { add: [MAIL_SCOPE], returnTo, characterId: b.characterId })}
                      size="sm"
                      variant="primary"
                      className="h-6 px-2"
                    >
                      <Mail className="size-3" aria-hidden /> {m.enable}
                    </ButtonLink>
                  )}
                </div>
                {(detail || (b.granted && b.lastStatus === "error" && b.lastError)) && (
                  <p className="pl-[2.6rem] text-2xs text-ink-3">
                    {detail}
                    {b.granted && b.lastStatus === "error" && b.lastError ? (
                      <span className="block text-warning">{m.error(b.lastError)}</span>
                    ) : null}
                  </p>
                )}
                {!b.granted && b.mails > 0 && (
                  <ActionForm
                    action={deleteAction.bind(null, b.characterId)}
                    success={m.toast.deleted(b.name)}
                    failed={m.toast.failed(b.name)}
                    errors={m.toast.errors}
                    className="pl-[2.6rem]"
                  >
                    <Button type="submit" size="sm" variant="danger" title={m.deleteStoredHint} className="h-6 px-2">
                      <Trash2 className="size-3" aria-hidden /> {m.deleteStored}
                    </Button>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Built-in folders, mailing lists and custom labels with unread counts. */
export function FolderPanel({ counts, params, t }: { counts: FolderCounts; params: MailParams; t: T }) {
  const m = t.folders;
  const active = folderKey(params.folder);
  const row = (folder: MailFolder, icon: ReactNode, label: string, unread: number) => (
    <li key={folderKey(folder)}>
      <NavRow href={mailHref(params, { folder })} active={active === folderKey(folder)}>
        {icon}
        <span className="truncate">{label}</span>
        <Count value={unread} label={t.characters.unreadTitle(unread)} />
      </NavRow>
    </li>
  );
  const icon = (Icon: typeof Inbox) => <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />;
  return (
    <Panel title={m.title} bodyClassName="px-3 pb-3">
      <ul className="space-y-0.5">
        {row({ kind: "all" }, icon(Layers), m.all, counts.unread.all)}
        {row({ kind: "inbox" }, icon(Inbox), m.inbox, counts.unread.inbox)}
        {row({ kind: "sent" }, icon(Send), m.sent, 0)}
        {row({ kind: "corp" }, icon(Building2), m.corp, counts.unread.corp)}
        {row({ kind: "alliance" }, icon(Shield), m.alliance, counts.unread.alliance)}
        {row({ kind: "lists" }, icon(Users), m.lists, counts.unread.lists)}
        {counts.lists.length > 0 && (
          <li>
            <ul className="ml-4 space-y-0.5 border-l border-surface-contrast/8 pl-2">
              {counts.lists.map((l) => row({ kind: "list", id: l.id }, null, l.name, l.unread))}
            </ul>
          </li>
        )}
      </ul>
      {counts.labels.length > 0 && (
        <>
          <h3 className="eve-label mt-4 mb-1.5 px-2.5 text-2xs text-ink-3">{m.labels}</h3>
          <ul className="space-y-0.5">
            {counts.labels.map((l) => row({ kind: "label", name: l.name }, <LabelDot color={l.color} />, l.name, l.unread))}
          </ul>
        </>
      )}
    </Panel>
  );
}
