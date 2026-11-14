import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { getDb, lootOperations } from "@/core/db";
import { canReadOperation } from "./model";
export async function listOperations(
  userId: string,
  characterIds: number[],
  day?: string,
) {
  const shared = characterIds.length
    ? sql`(${lootOperations.shared} AND EXISTS (SELECT 1 FROM jsonb_array_elements(${lootOperations.ledger}->'participants') p WHERE (p->>'characterId')::bigint IN (${sql.join(
        characterIds.map((id) => sql`${id}`),
        sql`, `,
      )})))`
    : sql`false`;
  return getDb()
    .select()
    .from(lootOperations)
    .where(
      and(
        or(eq(lootOperations.ownerId, userId), shared),
        day
          ? gte(lootOperations.startsAt, new Date(day + "T00:00:00Z"))
          : undefined,
        day
          ? lte(lootOperations.startsAt, new Date(day + "T23:59:59.999Z"))
          : undefined,
      ),
    )
    .orderBy(desc(lootOperations.startsAt))
    .limit(100);
}
export async function readOperation(
  id: string,
  userId: string,
  characterIds: number[],
) {
  const [op] = await getDb()
    .select()
    .from(lootOperations)
    .where(eq(lootOperations.id, id));
  return op && canReadOperation(op, userId, characterIds) ? op : null;
}
