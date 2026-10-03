import { getCurrentUser } from "@/core/auth/dal";
import { liveCursorNow, parseLiveCursor } from "@/core/live-cursor";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import { getLiveEvents } from "@/modules/killboard/queries";

/**
 * New kills and losses for the live notifications. Without a valid `since`
 * it only hands out a cursor (now), so a fresh page never replays older killmails.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const errors = (await getI18n()).t.killboard.live.api;
  if (!user) return Response.json({ error: errors.unauthorized }, { status: 401 });
  if (!user.can(KILLBOARD_PERMISSIONS.view)) return Response.json({ error: errors.forbidden }, { status: 403 });
  const headers = { "Cache-Control": "no-store" };
  const since = parseLiveCursor(new URL(request.url).searchParams.get("since"));
  const corp = await getSetting("corp.homeCorporationId");
  if (!since || !corp) {
    return Response.json({ events: [], cursor: await liveCursorNow() }, { headers });
  }
  return Response.json(await getLiveEvents(corp, since), { headers });
}
