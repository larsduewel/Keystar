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
    register: "Neu hier? Registrieren",
    privacy: (link: (text: string) => ReactNode) => (
      <>
        Anmeldung und Registrierung bestätigen nur, wer du bist – dabei wird kein ESI-Zugriff angefragt. Optionalen
        Zugriff schaltest du später pro Charakter ein; seine Tokens werden verschlüsselt gespeichert und können jederzeit
        unter {link("Authorized Apps")} auf der EVE-Entwicklerseite widerrufen werden.
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
    license: "Keystar ist freie Software unter der AGPL-3.0",
    sourceCode: "Quellcode",
  },
  join: {
    metaTitle: "Beitreten",
    eyebrow: "Keystar-Registrierung",
    titleWithCorp: (corp: string) => `${corp} auf Keystar beitreten`,
    title: "Registriere deine Charaktere",
    intro:
      "Die Registrierung bestätigt nur, wer du bist: Keystar fragt bei EVE keinen Zugriff auf deine Daten an. Danach wählst du pro Charakter, was Keystar lesen darf. Der Zugriff ist rein lesend, im Spiel kann nichts verändert werden, und du kannst ihn jederzeit abschalten.",
    optional: "Optional, pro Charakter, nach der Registrierung",
    link: "Charakter mit EVE Online verknüpfen",
    register: "Mit EVE Online registrieren",
    alts: (page: ReactNode) => <>Du hast Alts? Öffne nach der Registrierung {page} und verknüpfe jeden einzeln.</>,
    back: "Zurück zur Anmeldung",
  },
};
