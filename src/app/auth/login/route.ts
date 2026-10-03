import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, OAUTH_MAX_AGE_SECONDS, safeReturnTo, sealOAuthState } from "@/core/auth/oauth-state";
import { buildAuthorizeUrl, createPkcePair } from "@/core/auth/sso";
import { randomToken } from "@/core/crypto";
import { env, ssoConfigured } from "@/core/env";
import { LOGIN_INTENTS, parseOptionalScopes, scopesForIntent, type LoginIntent } from "@/core/modules/registry";

/**
 * Starts the EVE SSO flow. ?intent=login|join|link|link-corp&returnTo=/path
 * Linking may add opt-in scopes with &with=<scope>[,<scope>] (unknown ones are ignored); &drop= names the
 * opt-in scopes the user is deliberately giving up, so the callback doesn't warn about them. &character=<id>
 * re-authorises that one character: the callback refuses a login with another.
 */
export async function GET(request: NextRequest) {
  const appUrl = env().APP_URL;
  if (!ssoConfigured()) {
    return NextResponse.redirect(new URL("/login?error=sso_not_configured", appUrl));
  }

  const requested = request.nextUrl.searchParams.get("intent");
  const intent: LoginIntent = (LOGIN_INTENTS as readonly string[]).includes(requested ?? "")
    ? (requested as LoginIntent)
    : "login";
  const defaultReturn = intent === "link" || intent === "link-corp" ? "/characters" : "/";
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"), defaultReturn);

  const scopes = scopesForIntent(intent, parseOptionalScopes(request.nextUrl.searchParams.get("with")));
  const optionalRemoved = parseOptionalScopes(request.nextUrl.searchParams.get("drop"));
  const character = Number(request.nextUrl.searchParams.get("character"));
  const expectedCharacterId =
    (intent === "link" || intent === "link-corp") && Number.isSafeInteger(character) && character > 0 ? character : undefined;
  const { verifier, challenge } = createPkcePair();
  const state = randomToken(24);

  const response = NextResponse.redirect(buildAuthorizeUrl({ state, codeChallenge: challenge, scopes }));
  response.cookies.set(OAUTH_COOKIE, sealOAuthState({
      state,
      verifier,
      intent,
      returnTo,
      createdAt: Date.now(),
      optionalRemoved,
      expectedCharacterId,
    }), {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/auth",
    maxAge: OAUTH_MAX_AGE_SECONDS,
  });
  return response;
}
