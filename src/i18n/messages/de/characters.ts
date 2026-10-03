import type { characters as en } from "../en/characters";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const characters: typeof en = {
  metaTitle: "Meine Charaktere",
  header: {
    eyebrow: "Konto",
    title: "Meine Charaktere",
    description:
      "Verknüpfe jeden Charakter, den du spielst. Keystar liest Daten ausschließlich über die hier aufgeführten ESI-Scopes.",
    link: "Charakter verknüpfen",
  },
  card: {
    main: "Hauptcharakter",
    noToken: "Kein ESI-Token",
    tokenRevoked: "Token widerrufen",
    scopesMissing: (count: number) => (count === 1 ? `${n(count)} Scope fehlt` : `${n(count)} Scopes fehlen`),
    esiActive: "ESI aktiv",
    corporationFallback: (id: number) => `Corporation ${id}`,
    reauthorise: "Neu autorisieren",
    syncNow: "Jetzt synchronisieren",
    syncNowHint: "Alle Syncs für diesen Charakter jetzt einreihen",
    makeMain: "Zum Hauptcharakter machen",
    remove: "Entfernen",
    removeHint: "Verknüpfung lösen und das Token dieses Charakters widerrufen",
    scopes: "Scopes",
    granted: "erteilt",
    missing: "fehlt",
    corporationScopes: (count: number) => `+ ${n(count)} Corporation-Scope${count === 1 ? "" : "s"}`,
    backgroundSync: "Hintergrund-Sync",
    noJobs: "Noch keine Sync-Jobs – sie erscheinen innerhalb einer Minute, nachdem du Scopes erteilt hast.",
    tokenRefreshed: (when: string) => `Token ${when} erneuert`,
    optional: "Optional",
    optionalOn: "an",
    optionalOff: "aus",
  },
  lostScope: {
    title: (name: string) => `Optionaler Zugriff für ${name} wurde abgeschaltet`,
    before: "Dieser EVE-Login enthielt",
    after:
      "nicht mehr, obwohl der Charakter es vorher hatte: EVE ersetzt bei jedem Login die Scopes eines Charakters. Importierte Daten bleiben erhalten.",
    action: "Wieder einschalten",
  },
  disabledScopes: {
    title: (what: string) => `In Keystar abgeschaltet: ${what}`,
    body: "Keystar nutzt diesen Zugriff nicht mehr, aber der EVE-Token des Charakters enthält ihn noch. Autorisiere den Charakter neu, um ihn endgültig aus dem Token zu entfernen.",
    pickCharacter: (name: string) => `Bitte achte darauf, dich beim EVE-Login mit ${name} anzumelden.`,
    action: "Neu autorisieren",
  },
  toast: {
    mainSet: (name: string) => `${name} ist jetzt dein Hauptcharakter`,
    syncQueued: (name: string) => `Syncs für ${name} eingeplant`,
    syncQueuedDetail: "Der Worker startet sie innerhalb einer Minute.",
    removed: (name: string) => `${name} entfernt`,
    removedDetail: "Der Token wurde gelöscht und bei CCP widerrufen.",
    failed: (name: string) => `${name} konnte nicht geändert werden`,
    errors: {
      notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
      onlyCharacter: "Du kannst deinen einzigen Charakter nicht entfernen.",
      unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
    },
  },
  scopeSwitch: {
    off: (what: string, name: string) => `${what} für ${name} abgeschaltet`,
    offDetail: "Keystar nutzt ihn ab sofort nicht mehr. Autorisiere den Charakter unter „Meine Charaktere“ neu, um ihn auch aus dem EVE-Token zu entfernen.",
    on: (what: string, name: string) => `${what} für ${name} eingeschaltet`,
    failed: (what: string, name: string) => `${what} für ${name} konnte nicht geändert werden`,
    errors: {
      forbidden: "Du darfst diesen Zugriff nicht ändern.",
      notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
      unknownScope: "Keystar kennt diesen Zugriff nicht.",
      notHeld: "Der EVE-Token des Charakters enthält ihn nicht mehr oder wurde widerrufen. Schalte ihn über den EVE-Login wieder ein.",
      active: "Beende zuerst das Flotten-Tracking für diesen Charakter.",
      unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
    },
  },
  sso: {
    linked: (name: string) => `${name} verknüpft`,
    linkedDetail: "Die Hintergrund-Syncs starten innerhalb einer Minute.",
    reauthorized: (name: string) => `${name} neu autorisiert`,
    corpGranted: (name: string) => `Corporation-Zugriff für ${name} erteilt`,
    scopesChanged: (name: string) => `Zugriff für ${name} aktualisiert`,
    added: (what: string) => `Eingeschaltet: ${what}`,
    removed: (what: string) => `Abgeschaltet: ${what}`,
    character: "den Charakter",
    failed: "Der Charakter konnte nicht verknüpft werden",
    wrongCharacter: (picked: string) => `Du hast dich mit ${picked} angemeldet`,
    wrongCharacterDetail: (expected: string) =>
      `Es wurde nichts geändert. Autorisiere erneut und wähle beim EVE-Login ${expected}.`,
    errors: {
      denied: "Der EVE-Login wurde abgebrochen.",
      invalidState: "Der EVE-Login ist abgelaufen oder wurde doppelt geöffnet. Bitte versuche es noch einmal.",
      signInFirst: "Melde dich an, bevor du einen weiteren Charakter verknüpfst.",
      linkedElsewhere: "Dieser Charakter ist bereits mit einem anderen Keystar-Konto verknüpft.",
      disabled: "Dieses Konto wurde von einem Administrator deaktiviert.",
      wrongCharacter: "Der EVE-Login hat einen anderen Charakter verwendet als den, den du neu autorisieren wolltest. Es wurde nichts geändert.",
      failed: "EVE hat den Login nicht bestätigt. Bitte versuche es gleich noch einmal.",
    },
  },
  corporationAccess: {
    title: "Corporation-Zugriff",
    subtitle: "Für Directors, Accountants und Station Manager",
    intro:
      "Corporation-Daten wie Mondbohrer-Ledger stammen aus dem Token eines Mitglieds mit der passenden Rolle im Spiel. Verknüpfe diesen Charakter mit den zusätzlichen Corporation-Scopes:",
    link: "Mit Corporation-Zugriff verknüpfen",
  },
  privacy: {
    title: "Datenschutz",
    subtitle: "Was Keystar speichert",
    encrypted: "Refresh-Tokens werden mit AES-256-GCM verschlüsselt, bevor sie in die Datenbank gelangen.",
    readOnly: "Keystar fragt nur Lese-Scopes an und kann im Spiel nichts ausführen.",
    removal:
      "Wenn du einen Charakter entfernst, wird sein Token gelöscht und bei CCP widerrufen. Der Mining-Verlauf bleibt bei der Corp.",
    wallet:
      "Wallet-Zugriff ist optional und gilt pro Charakter (Mining-GuV → Einstellungen). Importierte Wallet-Transaktionen siehst nur du, und sie werden gelöscht, wenn du den Charakter entfernst.",
    mail: "Mail-Zugriff ist optional und gilt pro Charakter (EVE-Mail). Importierte Mails siehst nur du, und sie werden gelöscht, wenn du den Charakter entfernst.",
    revoke:
      "Optionalen Zugriff kannst du hier in Keystar jederzeit abschalten; eine neue Autorisierung entfernt ihn dann aus dem Token. Um Keystar ganz zu widerrufen, nutze „Third-Party Applications“ auf der EVE-Online-Website.",
  },
};
