/*
 * One-shot messages across a redirect. The SSO callback can't call
 * `useToast()`, so it leaves a short-lived cookie that `FlashToasts` (in the
 * app layout) turns into a toast and deletes. The cookie only carries codes,
 * scope ids and a character name; the text comes from the dictionaries.
 */

export const FLASH_COOKIE = "ks_flash";
export const FLASH_MAX_AGE_SECONDS = 60;

export const FLASH_KINDS = [
  "linked",
  "alreadyLinked",
  "accessRemoved",
  "reauthorized",
  "corpGranted",
  "scopesChanged",
  "linkFailed",
] as const;
export type FlashKind = (typeof FLASH_KINDS)[number];

/** Why linking a character failed (`linkFailed`). */
export const LINK_FAILURES = [
  "denied",
  "invalidState",
  "signInFirst",
  "linkedElsewhere",
  "disabled",
  "wrongCharacter",
  "failed",
] as const;
export type LinkFailure = (typeof LINK_FAILURES)[number];

export interface Flash {
  kind: FlashKind;
  /** The character the message is about. */
  name?: string;
  /** `scopesChanged`: opt-in scopes granted and removed by this login. */
  added?: string[];
  removed?: string[];
  /** `linkFailed`: what went wrong. */
  code?: LinkFailure;
  /** `wrongCharacter`: the character the user meant to re-authorise (`name` is the one they picked). */
  expected?: string;
}

export function encodeFlash(flash: Flash): string {
  return encodeURIComponent(JSON.stringify(flash));
}

const scopeList = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string" && /^esi-[\w.-]+$/.test(s)).slice(0, 10)
    : undefined;

/** Reads a flash cookie value; anything malformed or unknown is ignored. */
export function parseFlash(raw: string | null | undefined): Flash | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (!(FLASH_KINDS as readonly unknown[]).includes(v.kind)) return null;
    return {
      kind: v.kind as FlashKind,
      name: typeof v.name === "string" ? v.name.slice(0, 64) : undefined,
      added: scopeList(v.added),
      removed: scopeList(v.removed),
      code: (LINK_FAILURES as readonly unknown[]).includes(v.code) ? (v.code as LinkFailure) : undefined,
      expected: typeof v.expected === "string" ? v.expected.slice(0, 64) : undefined,
    };
  } catch {
    return null;
  }
}

/** Cookie options for the flash; readable by the page script that shows and deletes it. */
export function flashCookieOptions(secure: boolean) {
  return { httpOnly: false, secure, sameSite: "lax" as const, path: "/", maxAge: FLASH_MAX_AGE_SECONDS };
}
