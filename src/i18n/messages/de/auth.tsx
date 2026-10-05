import type { ReactNode } from "react";
import type { auth as en } from "../en/auth";

export const auth: typeof en = {
  login: {
    metaTitle: "Anmelden",
    tagline: "Corporation-Kommando für Kapselpiloten.",
    errors: {
      sso_not_configured: "EVE SSO ist auf diesem Server noch nicht eingerichtet (EVE_CLIENT_ID / EVE_CLIENT_SECRET).",
      invalid_state: "Dein Anmeldeversuch ist abgelaufen oder wurde manipuliert. Bitte versuche es erneut.",
      sso_denied: "Die Anmeldung über EVE SSO wurde abgebrochen.",
      sso_failed: "Die Anmeldung mit EVE Online ist fehlgeschlagen.",
      provision: "Deine Anmeldung konnte nicht abgeschlossen werden.",
      not_member: "Hier können sich nur Mitglieder der Corporation registrieren.",
      demo_disabled: "Der Demo-Modus ist auf diesem Server deaktiviert.",
    },
    genericError: "Etwas ist schiefgelaufen.",
    signIn: "Mit EVE Online anmelden",
    register: "Neu hier? Registrieren & ESI-Zugriff erteilen",
    privacy: (site: ReactNode) => (
      <>
        Die Anmeldung bestätigt nur, wer du bist – dabei wird kein ESI-Zugriff angefragt. Tokens werden separat
        angefragt, verschlüsselt gespeichert und können jederzeit unter {site} widerrufen werden.
      </>
    ),
    setupTitle: "Server-Einrichtung nötig",
    setupApp: (site: ReactNode) => <>Lege unter {site} eine Anwendung mit dieser Callback-URL an:</>,
    setupScopes: "Aktiviere diese Scopes für die Anwendung:",
    setupEnv: (id: ReactNode, secret: ReactNode, file: ReactNode, command: ReactNode) => (
      <>
        Trage Client-ID und Secret als {id} / {secret} in {file} ein und führe {command} aus.
      </>
    ),
    setupFirstPilot: "Melde dich an – der erste Pilot wird Admin und durch die restliche Einrichtung geführt.",
    demoTitle: "Demo-Modus – anmelden als",
    trademark:
      "EVE Online und das EVE-Logo sind eingetragene Marken von CCP hf. Keystar ist ein Fan-Projekt ohne Verbindung zu CCP.",
    license: "Keystar ist freie Software unter der AGPL-3.0",
    sourceCode: "Quellcode",
  },
  join: {
    metaTitle: "Beitreten",
    eyebrow: "Keystar-Registrierung",
    titleWithCorp: (corp: string) => `${corp} auf Keystar beitreten`,
    title: "Registriere deine Charaktere",
    intro:
      "Melde dich mit jedem Charakter an, den du registrieren möchtest. Keystar fragt Lesezugriff auf die folgenden ESI-Daten an. Im Spiel kann nichts verändert werden, und du kannst den Zugriff jederzeit widerrufen.",
    link: "Charakter mit EVE Online verknüpfen",
    register: "Mit EVE Online registrieren",
    alts: (page: ReactNode) => <>Du hast Alts? Öffne nach der Registrierung {page} und verknüpfe jeden einzeln.</>,
    back: "Zurück zur Anmeldung",
  },
};
