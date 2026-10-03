import { and, eq, lt, or, isNull } from "drizzle-orm";
import { getDb, intelPilots, intelQueue, intelScanPilots } from "@/core/db";
import { STATS_TTL_MS } from "@/modules/intel/constants";
import { getCurrentUser } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { getScan, scanProgress } from "@/modules/intel/scans";

/** Progress of a scan, polled by the scan page while zKillboard data comes in. */
export async function GET(_request: Request, ctx: RouteContext<"/api/intel/scans/[id]">) {
  const user = await getCurrentUser();
  const errors = (await getI18n()).t.intel.api;
  if (!user) return Response.json({ error: errors.unauthorized }, { status: 401 });
  if (!user.can(INTEL_PERMISSIONS.use)) return Response.json({ error: errors.forbidden }, { status: 403 });
  const { id } = await ctx.params;
  if (!SHARE_ID_PATTERN.test(id)) return Response.json({ error: errors.notFound }, { status: 404 });
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: errors.notFound }, { status: 404 });
  const progress = await scanProgress(scan);
  if (scan.createdBy === user.id) {
    const rows = await getDb().select({ id: intelPilots.characterId }).from(intelPilots)
      .innerJoin(intelScanPilots, eq(intelScanPilots.characterId, intelPilots.characterId))
      .innerJoin(intelQueue, eq(intelQueue.characterId, intelPilots.characterId))
      .where(and(eq(intelScanPilots.scanId, id), eq(intelScanPilots.profiled, true), eq(intelQueue.stage, 1), or(isNull(intelPilots.statsAt), lt(intelPilots.statsAt, new Date(Date.now() - STATS_TTL_MS)))));
    progress.browserStats = rows.map(r => r.id);
  }
  return Response.json(progress, { headers: { "Cache-Control": "no-store" } });
}
