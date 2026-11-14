import { getTrackers } from "@/modules/fleet/queries";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/dal";
import { readOperation } from "@/modules/loot/queries";
import { LootWorkspace } from "@/modules/loot/workspace";
export default async function LootOperationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("loot.view"),
    { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const op = await readOperation(id, user.id, user.characterIds);
  if (!op) notFound();
  return (
    <LootWorkspace
      operation={{
        ...op,
        startsAt: op.startsAt.toISOString(),
        endsAt: op.endsAt.toISOString(),
        syncedAt: op.syncedAt?.toISOString() ?? null,
      }}
      trackers={
        op.ownerId === user.id
          ? (await getTrackers(user.characterIds))
              .filter((tr) => tr.status === "tracking" && tr.fleetId)
              .map((tr) => ({
                characterId: tr.characterId,
                name:
                  user.characters.find((c) => c.characterId === tr.characterId)
                    ?.name ?? String(tr.characterId),
              }))
          : []
      }
      owner={op.ownerId === user.id}
    />
  );
}
