import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, unsealOAuthState, type OAuthState } from "@/core/auth/oauth-state";
import { ProvisionError, provisionFromSso, type ProvisionResult } from "@/core/auth/provision";
import { SESSION_COOKIE, createSession, sessionCookieOptions, validateSessionToken } from "@/core/auth/session";
import { exchangeCode, verifyAccessToken, type VerifiedCharacter } from "@/core/auth/sso";
import { characters, getDb } from "@/core/db";
import { env } from "@/core/env";
import { FLASH_COOKIE, encodeFlash, flashCookieOptions, type Flash, type LinkFailure } from "@/core/flash";
import { createLogger, errorMessage } from "@/core/logger";

const log = createLogger("sso");

function fail(code: string, message?: string) {
  const url = new URL("/login", env().APP_URL);
  url.searchParams.set("error", code);
  if (message) url.searchParams.set("message", message.slice(0, 200));
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
  return res;
}

/** Back to the page a signed-in user linked from, with a toast saying why linking failed. */
function linkFailed(returnTo: string, code: LinkFailure, names: Pick<Flash, "name" | "expected"> = {}) {
  const appUrl = env().APP_URL;
  const res = NextResponse.redirect(new URL(returnTo, appUrl));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
  res.cookies.set(
    FLASH_COOKIE,
    encodeFlash({ kind: "linkFailed", code, ...names }),
    flashCookieOptions(appUrl.startsWith("https://")),
  );
  return res;
}

/** What to confirm after a successful link or re-authorisation (sign-ins and joins get no toast). */
function successFlash(saved: OAuthState, result: ProvisionResult, verified: VerifiedCharacter): Flash | null {
  if (saved.intent !== "link" && saved.intent !== "link-corp") return null;
  const name = verified.name;
  if (result.newCharacter) return { kind: "linked", name };
  if (saved.intent === "link-corp") return { kind: "corpGranted", name };
  // The login granted nothing and the character's old token went: it shares nothing with Keystar any more.
  if (result.tokenRemoved) return { kind: "accessRemoved", name };
  // A plain link asks for no scope, so linking a character that is already on the account changes nothing.
  if (!verified.scopes.length) return { kind: "alreadyLinked", name };
  const removed = saved.optionalRemoved.filter((s) => !verified.scopes.includes(s));
  if (result.addedOptionalScopes.length || removed.length) {
    return { kind: "scopesChanged", name, added: result.addedOptionalScopes, removed };
  }
  return { kind: "reauthorized", name };
}

/** EVE SSO redirects here with ?code&state. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = unsealOAuthState(request.cookies.get(OAUTH_COOKIE)?.value);
  const existingToken = request.cookies.get(SESSION_COOKIE)?.value;
  const existingSession = existingToken ? await validateSessionToken(existingToken) : null;
  // A signed-in user linking a character goes back where they came from; /login would send them to / unexplained.
  const linkReturn =
    saved && existingSession && (saved.intent === "link" || saved.intent === "link-corp") ? saved.returnTo : null;

  if (params.get("error")) {
    return linkReturn ? linkFailed(linkReturn, "denied") : fail("sso_denied", params.get("error_description") ?? undefined);
  }

  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) {
    return linkReturn ? linkFailed(linkReturn, "invalidState") : fail("invalid_state");
  }

  try {
    const tokens = await exchangeCode(code, saved.verifier);
    const verified = await verifyAccessToken(tokens.access_token);
    // Re-authorising one character but EVE logged in another: storing this token would give that character the
    // scope set meant for the first (and drop, say, its corporation scopes). Keep both as they were.
    if (linkReturn && saved.expectedCharacterId && verified.characterId !== saved.expectedCharacterId) {
      const [expected] = await getDb()
        .select({ name: characters.name })
        .from(characters)
        .where(eq(characters.characterId, saved.expectedCharacterId));
      return linkFailed(linkReturn, "wrongCharacter", { name: verified.name, expected: expected?.name });
    }
    const result = await provisionFromSso({
      verified,
      tokens,
      intent: saved.intent,
      currentUserId: existingSession?.userId ?? null,
      // Checked above: a re-authorise link that reaches this point logged in with its own character.
      reauthorize: saved.expectedCharacterId === verified.characterId,
    });

    // An opt-in scope (e.g. wallet import) dropped by a generic link: say so instead of silently stopping it.
    const lost = result.lostOptionalScopes.filter((s) => !saved.optionalRemoved.includes(s));
    const target = lost.length
      ? `/characters?${new URLSearchParams({ lost: String(result.characterId), scopes: lost.join(",") })}`
      : saved.returnTo;
    const appUrl = env().APP_URL;
    const res = NextResponse.redirect(new URL(target, appUrl));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
    // The lost-scope banner explains itself; otherwise confirm what happened.
    const flash = lost.length ? null : successFlash(saved, result, verified);
    if (flash) res.cookies.set(FLASH_COOKIE, encodeFlash(flash), flashCookieOptions(appUrl.startsWith("https://")));
    // Linking keeps the current session; logins start a fresh one.
    if (!existingSession || existingSession.userId !== result.userId) {
      const token = await createSession(result.userId, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    }
    return res;
  } catch (err) {
    if (err instanceof ProvisionError) {
      // Only new accounts are refused for being outside the corporation, so this never comes from linking.
      if (err.code === "notMember") return fail("not_member");
      return linkReturn ? linkFailed(linkReturn, err.code) : fail("provision", err.message);
    }
    // Details stay in the server log; the unauthenticated login page only gets a generic error.
    log.error("SSO callback failed", { error: errorMessage(err) });
    return linkReturn ? linkFailed(linkReturn, "failed") : fail("sso_failed");
  }
}
