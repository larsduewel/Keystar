import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** My Characters page: linked characters, their ESI tokens and background syncs. */
export const characters = {
  metaTitle: "My characters",
  header: {
    eyebrow: "Account",
    title: "My Characters",
    description:
      "Link every character you play. Linking only confirms who the character is: Keystar reads data only through the ESI access listed here, which you switch on per character.",
    link: "Link a character",
  },
  card: {
    main: "Main",
    /** No token: nothing granted, which is fine (every ESI scope is opt-in). */
    noToken: "No ESI access",
    tokenRevoked: "Token revoked",
    scopesMissing: (count: number) => `${n(count)} scope${count > 1 ? "s" : ""} missing`,
    esiActive: "ESI active",
    corporationFallback: (id: number) => `Corporation ${id}`,
    reauthorise: "Re-authorise",
    syncNow: "Sync now",
    syncNowHint: "Queue all syncs for this character now",
    makeMain: "Make main",
    remove: "Remove",
    removeHint: "Unlink and revoke this character's token",
    scopes: "Scopes",
    granted: "granted",
    missing: "missing",
    corporationScopes: (count: number) => `+ ${n(count)} corporation scope(s)`,
    backgroundSync: "Background sync",
    noJobs: "No sync jobs yet — they appear within a minute of granting scopes.",
    tokenRefreshed: (when: string) => `Token refreshed ${when}`,
    optional: "Optional",
    optionalOn: "on",
    optionalOff: "off",
  },
  /** Shown after an EVE login dropped an opt-in scope (e.g. wallet import) the character had. */
  lostScope: {
    title: (name: string) => `Optional access was turned off for ${name}`,
    before: "That EVE login didn't include",
    after: "which the character had before: EVE replaces a character's scopes on every login. Imported data is kept.",
    action: "Turn it back on",
  },
  /** A character whose opt-in scopes are switched off in Keystar but still in its EVE token. */
  disabledScopes: {
    title: (what: string) => `Switched off in Keystar: ${what}`,
    body: "Keystar no longer uses this access, but the character's EVE token still includes it. Re-authorise the character to remove it from the token for good.",
    /** EVE lists every character of the account; picking another one re-authorises that one instead. */
    pickCharacter: (name: string) => `Please make sure you log in with ${name} on the EVE login.`,
    action: "Re-authorise",
  },
  /** Toasts for the buttons on a character card. */
  toast: {
    mainSet: (name: string) => `${name} is now your main`,
    syncQueued: (name: string) => `Syncs queued for ${name}`,
    syncQueuedDetail: "The worker picks them up within a minute.",
    removed: (name: string) => `${name} removed`,
    removedDetail: "The token was deleted and revoked with CCP.",
    failed: (name: string) => `Couldn't update ${name}`,
    errors: {
      notOwned: "That character isn't linked to your account any more.",
      onlyCharacter: "You can't remove your only character.",
      unknown: "Something went wrong. Reload the page and try again.",
    },
  },
  /** Toasts for switching an opt-in scope (fleet access, wallet import, mail) off or on in Keystar. */
  scopeSwitch: {
    off: (what: string, name: string) => `${what} switched off for ${name}`,
    offDetail: "Keystar stops using it right away. Re-authorise the character on My Characters to remove it from its EVE token too.",
    on: (what: string, name: string) => `${what} switched on for ${name}`,
    failed: (what: string, name: string) => `Couldn't change ${what} for ${name}`,
    errors: {
      forbidden: "You don't have permission to change this access.",
      notOwned: "That character isn't linked to your account any more.",
      unknownScope: "Keystar doesn't know this access.",
      notHeld: "The character's EVE token no longer includes it or was revoked. Turn it on again through the EVE login.",
      active: "Stop fleet tracking for this character first.",
      unknown: "Something went wrong. Reload the page and try again.",
    },
  },
  /** Toasts after coming back from the EVE login. */
  sso: {
    linked: (name: string) => `${name} linked`,
    linkedDetail: "Switch on optional access, such as the mining ledger, on the feature's page; syncs start within a minute.",
    /** A plain link (no scopes) with a character that is already on the account. */
    alreadyLinked: (name: string) => `${name} is already linked`,
    alreadyLinkedDetail: "Nothing changed. Switch on optional access, such as the mining ledger, on the feature's page.",
    /** A login that granted no scope removed the character's old token. */
    accessRemoved: (name: string) => `${name} no longer shares any ESI access`,
    accessRemovedDetail:
      "Its old token was deleted and revoked with CCP. Switch optional access back on, such as the mining ledger, on the feature's page.",
    reauthorized: (name: string) => `${name} re-authorised`,
    corpGranted: (name: string) => `Corporation access granted for ${name}`,
    scopesChanged: (name: string) => `Access updated for ${name}`,
    added: (what: string) => `Turned on: ${what}`,
    removed: (what: string) => `Turned off: ${what}`,
    character: "the character",
    failed: "Linking the character didn't work",
    /** Re-authorising one character, but the EVE login used another: nothing is stored. */
    wrongCharacter: (picked: string) => `You logged in with ${picked}`,
    wrongCharacterDetail: (expected: string) =>
      `Nothing was changed. Re-authorise again and pick ${expected} on the EVE login.`,
    errors: {
      denied: "The EVE login was cancelled.",
      invalidState: "The EVE login expired or was opened twice. Please try again.",
      signInFirst: "Sign in before linking another character.",
      linkedElsewhere: "That character is already linked to another Keystar account.",
      disabled: "This account has been disabled by an administrator.",
      wrongCharacter: "The EVE login used a different character than the one you re-authorised. Nothing was changed.",
      failed: "EVE didn't confirm the login. Please try again in a moment.",
    },
  },
  corporationAccess: {
    title: "Corporation access",
    subtitle: "For directors, accountants and station managers",
    intro:
      "Corporation data such as moon-drill ledgers comes from one member's token who holds the right in-game role. Link that character with the additional corporation scopes:",
    link: "Link with corporation access",
  },
  privacy: {
    title: "Privacy",
    subtitle: "What Keystar stores",
    encrypted: "Refresh tokens are encrypted with AES-256-GCM before they touch the database.",
    readOnly: "Only read scopes are requested; Keystar cannot act in game.",
    removal:
      "Removing a character deletes its token and revokes it with CCP. Its mining history stays with the corp unless you delete it first (Mining → Access).",
    mining:
      "Mining ledger access is optional and per character (Mining → Access). Synced ledger entries count towards the corporation's mining figures; you can delete them once access is off.",
    wallet:
      "Wallet access is optional and per character (Mining P&L → Settings). Imported wallet transactions are only ever shown to you, and are deleted when you remove the character.",
    mail: "Mail access is optional and per character (EVE Mail). Imported mail is only ever shown to you, and is deleted when you remove the character.",
    /** `link` renders the link to EVE's authorised apps page. */
    revoke: (link: (text: string) => ReactNode) => (
      <>
        Optional access can be switched off here in Keystar any time; re-authorising then removes it from the token. To
        revoke Keystar entirely, use {link("Authorized Apps")} on the EVE developers site.
      </>
    ),
  },
};
