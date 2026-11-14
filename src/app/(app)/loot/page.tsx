import Link from "next/link";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { CreateLoot } from "@/modules/loot/create";
import { listOperations } from "@/modules/loot/queries";
import { getLiveFleets, getPastFleets } from "@/modules/fleet/queries";
import { settlement } from "@/modules/loot/model";
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.loot.title };
}
export default async function LootPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const user = await requirePermission("loot.view"),
    { t, f } = await getI18n(),
    m = t.loot;
  const params = await searchParams;
  const day =
    params.day &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.day) &&
    Number.isFinite(Date.parse(params.day))
      ? params.day
      : undefined;
  const operations = await listOperations(user.id, user.characterIds, day);
  const fleets = user.can("fleet.view")
    ? [...(await getLiveFleets()), ...(await getPastFleets(30))]
    : [];
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.killboard.module.navSection}
        title={m.title}
        description={m.help}
      />
      <CreateLoot
        fleets={fleets.map((x) => ({
          id: x.fleetId,
          name: `${x.bossName ?? x.bossCharacterId} · ${f.dateTime(x.startedAt)}`,
        }))}
      />
      <Panel title={m.operations}>
        <form className="mb-4 flex items-end gap-2">
          <label className="text-xs">
            {m.day}
            <input
              type="date"
              name="day"
              defaultValue={day}
              className="ml-2 rounded bg-space-700 p-2"
            />
          </label>
          <button className="glass-chip rounded p-2 text-xs">
            {m.refresh}
          </button>
        </form>
        <div className="space-y-2">
          {!operations.length && (
            <p className="text-sm text-ink-3">{m.empty}</p>
          )}
          {operations.map((op) => (
            <Link
              href={`/loot/${op.id}`}
              key={op.id}
              className="glass-chip flex flex-wrap justify-between gap-3 rounded-lg p-3 text-sm"
            >
              <span>
                {op.title}
                <span className="ml-2 text-ink-3">
                  {op.closed ? m.closed : m.open}
                </span>
              </span>
              <span>
                {f.dateTime(op.startsAt)} ·{" "}
                {f.isk(settlement(op.ledger).estimated)}
              </span>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
