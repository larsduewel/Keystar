import { Building2, KeyRound, Server, Users } from "lucide-react";
import { CorpLogo } from "@/components/ui/eve-image";
import { InfoItem } from "@/components/ui/info-item";
import type { CurrentUser } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { zkillCorporation } from "@/modules/killboard/links";
import type { AccountData } from "./data";

/** The four facts under the dashboard title: home corporation, registered members, ESI access, sync worker. */
export async function InfoStrip({ user, account }: { user: CurrentUser; account: AccountData }) {
  const { t } = await getI18n();
  const d = t.dashboard;
  const { homeCorp } = account;
  const canSync = user.can("sync.view");
  return (
    // Content-sized columns so longer (German) values fit before they truncate.
    <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 2xl:grid-cols-[repeat(4,minmax(0,auto))] 2xl:justify-between">
      {homeCorp ? (
        <InfoItem
          media={<CorpLogo id={homeCorp.corporationId} size={44} className="rounded-lg ring-1 ring-surface-contrast/10" />}
          label={d.info.homeCorp}
          href={zkillCorporation(homeCorp.corporationId)}
          newTabLabel={t.common.opensInNewTab}
        >
          {homeCorp.name} <span className="text-ink-3">[{homeCorp.ticker}]</span>
        </InfoItem>
      ) : (
        <InfoItem icon={Building2} label={d.info.homeCorp} href={user.can("app.settings.manage") ? "/admin/settings" : undefined}>
          {d.info.notConfigured}
        </InfoItem>
      )}
      <InfoItem icon={Users} label={d.info.registered} href={user.can("members.audit") ? "/admin/members" : undefined}>
        {account.members ? d.info.registeredOfMembers(account.registered, account.members) : d.info.registeredOnly(account.registered)}
      </InfoItem>
      <InfoItem icon={KeyRound} label={d.info.esiAccess} href="/characters">
        {d.info.esiComplete(account.healthy, user.characters.length)}
      </InfoItem>
      <InfoItem icon={Server} label={d.info.syncWorker} href={canSync ? "/admin/sync" : undefined}>
        <span className="inline-flex items-center gap-2">
          <span className={account.workerOnline ? "size-2 rounded-full bg-good" : "size-2 rounded-full bg-critical"} aria-hidden />
          {account.workerOnline ? d.info.workerOnline : d.info.workerOffline}
        </span>
      </InfoItem>
    </div>
  );
}
