import { z } from "zod";
import { decrypt, deriveKey, encrypt } from "@/core/crypto";

export const OAUTH_COOKIE = "ks_oauth";
export const OAUTH_MAX_AGE_SECONDS = 600;

const stateSchema = z.object({
  state: z.string().min(16),
  verifier: z.string().min(43),
  intent: z.enum(["login", "join", "link", "link-corp"]),
  returnTo: z.string(),
  createdAt: z.number(),
  /** Opt-in scopes the user asked to remove; losing them is expected, not a surprise. */
  optionalRemoved: z.array(z.string()).max(20).default([]),
  /** Re-authorising one character: a login with any other character is refused (`?character=`). */
  expectedCharacterId: z.number().int().positive().optional(),
});

export type OAuthState = z.infer<typeof stateSchema>;

export function sealOAuthState(state: z.input<typeof stateSchema>): string {
  return encrypt(JSON.stringify(state), deriveKey("oauth-state"));
}

export function unsealOAuthState(value: string | undefined): OAuthState | null {
  if (!value) return null;
  try {
    const parsed = stateSchema.parse(JSON.parse(decrypt(value, deriveKey("oauth-state"))));
    if (Date.now() - parsed.createdAt > OAUTH_MAX_AGE_SECONDS * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

const RETURN_TO_BASE = "https://return-to.invalid";

/**
 * Only allow same-origin relative paths as post-login redirect targets.
 *
 * The value is later resolved with the WHATWG URL parser, which strips tab/LF/CR and treats
 * `\` as `/`, so a prefix check on the raw string is not enough ("/\t/evil.example" resolves
 * to another host). Resolve it the same way here and require the origin to be unchanged.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, RETURN_TO_BASE);
    if (url.origin !== RETURN_TO_BASE) return fallback;
    const path = url.pathname + url.search + url.hash;
    // Dot segments can collapse to "//host" ("/.//evil.example"), which resolves to another host again.
    if (path.startsWith("//")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
