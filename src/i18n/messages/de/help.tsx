import type { ReactNode } from "react";
import type { help as en } from "../en/help";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const help: typeof en = {
  button: "Hilfe",
  buttonTitle: "Hilfe und Rundgang (?)",
  title: "Hilfe",
  intro: "Wie Keystar funktioniert, was es aus EVE liest und wer was sieht.",
  close: "Hilfe schließen",
  topicsLabel: "Hilfethemen",
  topics: {
    page: "Diese Seite",
    basics: "So funktioniert Keystar",
    scopes: "Scopes und EVE-Zugriff",
    data: "Deine Daten und Sicherheit",
    access: "Wer sieht was",
  },
  shortcut: (key: ReactNode) => <>Drück {key} auf jeder Seite, um diese Hilfe zu öffnen.</>,
  whatsNew: (version: string) => `Neu in v${version}`,
  takeTour: "Rundgang starten",
  version: (version: string) => `Keystar v${version}`,
  newBadge: "Neu in dieser Version",

  page: {
    none: "Für diese Seite gibt es keine eigene Hilfe. Wähl ein Thema oder öffne eine Seite in der Seitenleiste und drück dort ?.",
    whoCanOpen: "Wer sie öffnen kann",
    everyone: "Alle, die angemeldet sind",
    nobody: "Derzeit keine Rolle",
    fromRole: (role: ReactNode) => <>{role} und höher</>,
    ownData: "Nur deine eigenen Daten: Niemand sonst sieht sie hier, egal mit welcher Rolle.",
    optional: (access: string) => `Optionaler Zugriff, pro Charakter: ${access}.`,
    manage: "Zugriff verwalten",
  },

  basics: {
    intro: (corp: string | null) =>
      `Keystar ist ein Dashboard für ${corp ?? "deine Corporation"}. Es läuft auf einem Server, den deine Corporation betreibt, nicht bei CCP, und liest aus EVE nur.`,
    steps: {
      signIn: {
        title: "Mit EVE Online anmelden",
        body: "Du meldest dich auf der Login-Seite von EVE an (EVE SSO). Keystar sieht dein EVE-Passwort nie, und die Anmeldung beweist nur, welcher Charakter du bist.",
      },
      grant: {
        title: "Lesezugriff erteilen",
        body: "Damit Keystar deine Daten zeigen kann, erteilt ein Charakter ESI-Scopes: Leserechte für jeweils eine Art von Daten, etwa sein Mining-Ledger. Alle sind optional: Du schaltest sie pro Charakter auf der Seite der jeweiligen Funktion ein.",
      },
      sync: {
        title: "Keystar synchronisiert im Hintergrund",
        body: "Ein Hintergrund-Worker holt die Daten nach Zeitplan von ESI, je nach Daten alle paar Minuten bis stündlich, und speichert sie in der Datenbank von Keystar.",
      },
      read: {
        title: "Seiten zeigen den letzten Sync",
        body: "Seiten lesen aus der Datenbank von Keystar, nicht aus EVE, daher können Daten ein paar Minuten alt sein. „Meine Charaktere“ zeigt die Hintergrund-Syncs jedes Charakters und kann sie sofort einreihen.",
      },
    },
    public:
      "Manche Funktionen brauchen gar keinen Zugriff: Killboard und Bedrohungsanalyse nutzen öffentliche Killmails von zKillboard, die Karte nutzt CCPs statische Daten und Bewertungen öffentliche Marktpreise.",
  },

  scopes: {
    intro:
      "Ein ESI-Scope ist ein Leserecht für eine Art von Daten eines Charakters, etwa sein Mining-Ledger oder seine Skill-Queue. EVE listet die Scopes auf seiner Login-Seite, bevor du zustimmst.",
    facts: {
      signIn: "Anmeldung, Registrierung und das Verknüpfen eines Charakters fragen keine Scopes an: Sie beweisen nur, wer du bist.",
      readOnly: "Jeder Scope, den Keystar anfragt, liest nur. Keystar kann keine Items, ISK oder Schiffe bewegen und im Spiel nichts tun.",
      perCharacter:
        "Jeder Charakter hat sein eigenes Token. EVE ersetzt die Scopes eines Charakters bei jeder Anmeldung, deshalb fragt Keystar die bereits erteilten erneut an.",
      revoke: (link: (text: string) => ReactNode) => (
        <>
          Optionalen Zugriff schaltest du jederzeit auf seiner Seite in Keystar ab. Um Keystar ganz zu widerrufen, nutze{" "}
          {link("Authorized Apps")} auf der EVE-Entwicklerseite.
        </>
      ),
    },
    member: {
      title: "Von allen angefragt",
      body: "Erteilt, wenn du dich registrierst oder einen Charakter verknüpfst.",
    },
    optional: {
      title: "Optional, pro Charakter",
      body: "Aus, bis du sie für einen Charakter auf der Seite der Funktion einschaltest.",
      manage: "Verwalten",
    },
    corporation: {
      title: "Corporation-Zugriff",
      body: "Nur für Corporation-Daten, von einem Charakter eines Direktors oder Offiziers. Sie liefern nur mit einer der genannten Rollen im Spiel Daten.",
      roles: (roles: string) => `Rolle im Spiel: ${roles}`,
    },
    none: "Keine",
  },

  data: {
    stored: {
      title: "Was Keystar speichert",
      body: "Namen und Corporations deiner Charaktere, deine Keystar-Rolle und die Daten, die deine Charaktere für den Zugriff liefern, den du einschaltest, etwa Mining-Ledger, Skill-Queues oder Mails.",
    },
    security: {
      title: "Wie sie geschützt sind",
      tokens: "ESI-Tokens werden mit AES-256-GCM verschlüsselt, bevor sie gespeichert werden. Der Schlüssel stammt aus dem Geheimnis des Servers, das nicht in der Datenbank liegt.",
      sessions: (days: number) =>
        `Deine Anmeldung ist ein zufälliges Cookie. Die Datenbank speichert nur einen Hash davon, mit deiner IP-Adresse und deinem Browser, und sie läuft ${n(days)} Tage nach deinem letzten Besuch ab.`,
      password: "Keystar sieht weder dein EVE-Passwort noch deinen EVE-Account.",
      selfHosted:
        "Keystar läuft auf einem Server, den deine Corporation betreibt. Wer ihn betreibt, hat die Datenbank und ihr Geheimnis und könnte alles darin lesen, auch private Daten.",
    },
    private: {
      title: "Nur du",
      body: "EVE-Mail, die Mining-GuV mit deinen Wallet-Importen, deine Industriejobs und deine Marktaufträge. Keine Rolle, nicht einmal Admin, kann sie in Keystar öffnen.",
    },
    visibility: {
      title: "Wer deine Daten sonst sieht",
      intro: "Mit der genannten Rolle oder höher. Admins können diese Rollen in den Einstellungen ändern.",
      rows: {
        account: "Dein Konto, deine Charaktere, deine Rolle und der Zustand deiner ESI-Tokens (Benutzer & Rollen, Mitglieder-Audit)",
        mining: "Was deine Charaktere abgebaut haben (Mining-Übersicht und Mining-Ledger, Corporation-Ansicht)",
        skills: "Skill-Queues der Charaktere, für die du Skills teilst (Corporation-Ansicht)",
        audit: "Deine Änderungen an Rollen, Einstellungen und deinem optionalen Zugriff (Audit-Log)",
        scans: "Deine Scans in der Bedrohungsanalyse, über ihren Link; ihre Piloten landen auch in der Corp-weiten Liste zuletzt gesehener Piloten",
        appraisals: "Gespeicherte Bewertungen, über ihren Link",
      },
    },
    delete: {
      title: "Daten entfernen",
      body: "Wenn du einen Charakter unter „Meine Charaktere“ entfernst, wird sein Token gelöscht und bei CCP widerrufen, und seine Wallet-, Mail-, Industrie- und Marktdaten werden gelöscht; sein Mining-Verlauf bleibt bei der Corporation, außer du löschst ihn vorher unter Mining-Zugriff. Mining-, Skill-, Industrie-, Markt-, Mail- und Wallet-Daten kannst du auch auf ihren eigenen Seiten löschen. Einen Knopf zum Löschen deines Kontos gibt es nicht: Bitte einen Direktor oder Admin, es zu deaktivieren.",
    },
    retention: (r: { appraisals: number; scans: number; pilots: number; killmails: number }) =>
      `Automatisch gelöscht: Bewertungen nach ${n(r.appraisals)} Tagen, Scans der Bedrohungsanalyse nach ${n(r.scans)} Tagen, Pilotenprofile nach ${n(r.pilots)} Tagen und Killmail-Zusammenfassungen nach ${n(r.killmails)} Tagen. Mining-Ledger (bis du deine eigenen löschst) und das Archiv der Corporation-Wallet bleiben dauerhaft.`,
    ai: "Dieser Server hat einen Claude-API-Schlüssel, daher schreibt Claude (von Anthropic) den wöchentlichen Lagebericht und die Lagebilder der Bedrohungsanalyse. Es bekommt Fakten, die Keystar aus öffentlichen Killmails und Scans ermittelt hat, etwa Piloten-, Corporation- und Schiffsnamen, Systeme und Standings; nie deine Tokens, Mails, Wallets oder Skills.",
  },

  access: {
    you: (role: ReactNode) => <>Deine Keystar-Rolle: {role}</>,
    intro:
      "Keystar-Rollen legen fest, was ein Konto sieht, und jede Rolle umfasst alles darunter. Sie sind unabhängig von den Corporation-Rollen im Spiel; Direktoren und Admins vergeben sie unter „Benutzer & Rollen“.",
    ladder: "Rollen",
    table: {
      title: "Seiten und die Rolle, die sie brauchen",
      page: "Seite",
      role: "Ab Rolle",
      you: "Du",
      yes: "Du kannst sie öffnen",
      no: "Nicht mit deiner Rolle",
    },
    everyone: "Alle",
    nobody: "Niemand",
    overrides: "Admins können die Rolle ändern, die eine Berechtigung braucht; diese Tabelle zeigt bereits die aktuellen Einstellungen.",
    manage: "In den Einstellungen ändern",
    guest: (corp: string | null, autoCorp: boolean, autoAlliance: boolean) =>
      autoCorp
        ? `Neue Mitglieder von ${corp ?? "der Heimat-Corporation"}${autoAlliance ? " und ihrer Allianz" : ""} werden automatisch als Mitglied freigeschaltet. Alle anderen starten als Gast, bis ein Direktor sie freischaltet.`
        : "Alle starten als Gast, bis ein Direktor sie freischaltet.",
  },

  tour: {
    title: "Willkommen bei Keystar",
    intro: "Ein kurzer Rundgang: was Keystar macht, was es aus EVE liest und wer was sieht.",
    stepsLabel: "Schritte des Rundgangs",
    welcome: "Willkommen",
    start: "Los geht's",
    progress: (step: number, total: number) => `Schritt ${n(step)} von ${n(total)}`,
    back: "Zurück",
    next: "Weiter",
    finish: "Fertig",
    skip: "Rundgang überspringen",
    hello: (name: string | null) => (name ? `Willkommen, ${name}` : "Willkommen"),
    body: "Keystar bringt die EVE-Daten deiner Corporation zusammen: Mining, Kämpfe, Flotten, Wallets und mehr. Der Rundgang dauert etwa zwei Minuten.",
    upgrade: (version: string) =>
      `Falls du Keystar gerade aktualisiert hast: Damit alles in v${version} funktioniert, muss, wer diesen Server betreibt:`,
    reopen: (key: ReactNode) => <>Du kannst ihn jederzeit über den ?-Knopf oben rechts oder mit {key} wieder öffnen.</>,
    nextSteps: {
      intro: "Ein paar gute erste Schritte:",
      characters: {
        title: "Verknüpfe alle deine Charaktere",
        body: "Füge unter „Meine Charaktere“ deine Twinks hinzu und prüfe, ob jedes Token in Ordnung ist.",
      },
      optional: {
        title: "Schalte ein, was du teilen willst",
        body: "Optionaler Zugriff gilt pro Charakter und ist aus, bis du ihn einschaltest:",
      },
      admin: {
        title: "Prüfe die Einstellungen",
        body: "Wer automatisch freigeschaltet wird, die Bewertung und welche Rolle jede Berechtigung braucht.",
      },
      guest: {
        title: "Warte auf die Freischaltung",
        body: "Ein Direktor muss dein Konto freischalten, bevor du Corporation-Daten siehst. Bis dahin kannst du deine Charaktere verknüpfen.",
      },
      dashboard: "Zum Dashboard",
    },
  },
};
