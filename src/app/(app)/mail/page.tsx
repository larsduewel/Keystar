import { Hourglass, Inbox, Mail, SearchX } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { MailList, MailSearch } from "@/modules/social/components/mail-list";
import { BackToList, MailReader } from "@/modules/social/components/mail-reader";
import { FolderPanel, MailboxPanel } from "@/modules/social/components/mail-sidebar";
import { parseMailParams } from "@/modules/social/filters";
import { SOCIAL_PERMISSIONS } from "@/modules/social/module";
import { getFolderCounts, getLabelMap, getMail, getMailboxes, getMailList, getRecipientNames, getUnreadTotal } from "@/modules/social/queries";
import { setOptionalScope } from "@/app/(app)/characters/actions";
import { deleteMailData } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.social.page.metaTitle };
}

export default async function MailPage({ searchParams }: PageProps<"/mail">) {
  const user = await requirePermission(SOCIAL_PERMISSIONS.mail);
  const { t, f } = await getI18n();
  const s = t.social;
  const now = new Date();
  const params = parseMailParams(await searchParams, user.characterIds);

  const [mailboxes, unreadTotal, counts, list, labels, open] = await Promise.all([
    getMailboxes(user.id),
    getUnreadTotal(user.id),
    getFolderCounts(user.id, params.characterId),
    getMailList(user.id, params),
    getLabelMap(user.id),
    params.open ? getMail(user.id, params.open.characterId, params.open.mailId) : null,
  ]);
  const names = await getRecipientNames(
    user.id,
    list.items.filter((m) => m.sent).flatMap((m) => m.recipients),
  );
  const characterNames = new Map(user.characters.map((c) => [c.characterId, c.name]));
  const anyGranted = mailboxes.some((b) => b.granted);
  const anyMail = mailboxes.some((b) => b.mails > 0);
  const lastSync = mailboxes.reduce<Date | null>((latest, b) => (b.lastSuccessAt && (!latest || b.lastSuccessAt > latest) ? b.lastSuccessAt : latest), null);
  const reading = params.open !== null;

  const listContent =
    list.items.length > 0 ? (
      <MailList
        items={list.items}
        total={list.total}
        params={params}
        names={names}
        labels={labels}
        characterNames={characterNames}
        t={s}
        f={f}
        now={now}
      />
    ) : params.q ? (
      <EmptyState icon={SearchX} title={s.empty.search.title}>
        {s.empty.search.body}
      </EmptyState>
    ) : anyMail ? (
      <EmptyState icon={Inbox} title={s.empty.folder.title}>
        {s.empty.folder.body}
      </EmptyState>
    ) : anyGranted ? (
      <EmptyState icon={Hourglass} title={s.empty.importing.title}>
        {s.empty.importing.body}
      </EmptyState>
    ) : (
      <EmptyState icon={Mail} title={s.empty.noAccess.title}>
        {s.empty.noAccess.body}
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={s.page.eyebrow}
        title={s.page.metaTitle}
        description={s.page.description}
        actions={
          <>
            {unreadTotal > 0 && <Badge tone="accent">{s.page.unread(unreadTotal)}</Badge>}
            {lastSync && <span className="text-xs text-ink-3">{s.page.synced(f.relativeTime(lastSync, now))}</span>}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className={cn("space-y-4", reading && "hidden lg:block")}>
          <MailboxPanel
            mailboxes={mailboxes}
            unreadTotal={unreadTotal}
            params={params}
            t={s}
            switchText={t.characters.scopeSwitch}
            f={f}
            demo={env().KEYSTAR_DEMO_MODE}
            deleteAction={deleteMailData}
            switchAction={setOptionalScope}
          />
          {anyMail && <FolderPanel counts={counts} params={params} t={s} />}
        </aside>

        <div className={cn("grid items-start gap-6", (anyMail || reading) && "2xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]")}>
          <Panel className={cn(reading && "hidden 2xl:flex")} bodyClassName="space-y-3">
            {anyMail && <MailSearch params={params} t={s} />}
            {listContent}
          </Panel>

          {reading ? (
            <Glass className="px-6 py-5 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100dvh-6rem)] 2xl:overflow-y-auto">
              {open ? (
                <MailReader mail={open} params={params} characterNames={characterNames} t={s} f={f} now={now} />
              ) : (
                <div className="space-y-4">
                  <BackToList params={params} t={s} />
                  <EmptyState icon={SearchX} title={s.reader.notFound} />
                </div>
              )}
            </Glass>
          ) : (
            anyMail && (
              <Glass className="hidden 2xl:sticky 2xl:top-20 2xl:block">
                <EmptyState icon={Mail} title={s.reader.choose} />
              </Glass>
            )
          )}
        </div>
      </div>
    </div>
  );
}
