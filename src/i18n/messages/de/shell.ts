import type { shell as en } from "../en/shell";
import { FORMATTERS } from "@/lib/format";

export const shell: typeof en = {
  mainNav: "Hauptmenü",
  releaseNotes: "Versionshinweise",
  unstableBuild: (tag: string | null, commit: string | null, builtAt: string | null) =>
    `Unveröffentlichter ${tag ?? "Entwicklungs"}-Build: möglicherweise instabil.${commit ? ` Commit ${commit}` : ""}${builtAt ? `, gebaut am ${FORMATTERS.de.dateTime(builtAt)}` : ""}`,
  unknownPilot: "Unbekannter Pilot",
  signOut: "Abmelden",
  noHomeCorp: "Keine Heimat-Corporation",
  demo: "Demo",
  serverOnline: (players: number) => `${FORMATTERS.de.integer(players)} online`,
  eveTime: "EVE-Zeit (UTC)",
  awaitingApproval: {
    title: "Freischaltung ausstehend.",
    body: "Ein Direktor muss dein Konto freischalten, bevor du Corporation-Daten sehen kannst. Deine Charaktere kannst du schon jetzt verknüpfen und ESI-Zugriff erteilen.",
  },
  theme: {
    light: "Hell", dark: "Dunkel", toLight: "Zum hellen Modus wechseln", toDark: "Zum dunklen Modus wechseln",
  },
  sidebar: { collapse: "Seitenleiste einklappen", expand: "Seitenleiste ausklappen", openMenu: "Menü öffnen", closeMenu: "Menü schließen" },
  language: {
    label: "Sprache",
    change: "Sprache ändern",
  },
  navSections: {
    overview: "Übersicht",
    account: "Konto",
    admin: "Administration",
  },
  nav: {
    dashboard: "Dashboard",
    characters: "Meine Charaktere",
    users: "Benutzer & Rollen",
    members: "Mitglieder-Audit",
    sync: "Sync-Status",
    settings: "Einstellungen",
    audit: "Audit-Log",
    system: "Systeminfo",
  },
  alerts: {
    button: "Alarme",
    menu: "Alarm-Einstellungen",
    desktop: {
      label: "Desktop-Benachrichtigungen",
      hint: "Alarme als System-Benachrichtigung zeigen, solange Keystar im Hintergrund ist",
      blocked: "Vom Browser, den System-Einstellungen oder einer Erweiterung blockiert",
      unsupported: "In diesem Browser hier nicht verfügbar (HTTPS nötig)",
    },
  },
};
