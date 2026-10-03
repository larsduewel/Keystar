import { getCurrentUser } from "@/core/auth/dal";
import { liveCursorNow, parseLiveCursor } from "@/core/live-cursor";
import { getI18n } from "@/i18n/server";
import { SOCIAL_PERMISSIONS } from "@/modules/social/module";
import { getLiveMail } from "@/modules/social/queries";

/**
 * New unread mail in the viewer's own mailboxes, for the live notifications.
 * Without a valid `since` it only hands out a cursor (now), so a fresh page
 * never replays older mail.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const errors = (await getI18n()).t.social.live.api;
  if (!user) return Response.json({ error: errors.unauthorized }, { status: 401 });
  if (!user.can(SOCIAL_PERMISSIONS.mail)) return Response.json({ error: errors.forbidden }, { status: 403 });
  const headers = { "Cache-Control": "no-store" };
  const since = parseLiveCursor(new URL(request.url).searchParams.get("since"));
  if (!since) return Response.json({ events: [], cursor: await liveCursorNow() }, { headers });
  const { mails, cursor } = await getLiveMail(user.id, since);
  return Response.json({ events: mails, cursor }, { headers });
}
