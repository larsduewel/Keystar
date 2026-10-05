import type { core as en } from "../en/core";

export const core: typeof en = {
  permissionGroup: "Kern",
  permissions: {
    settingsManage: {
      label: "App-Einstellungen verwalten",
      description: "Globale Einstellungen, Berechtigungsanpassungen und die Heimat-Corporation ändern.",
    },
    usersView: {
      label: "Benutzer ansehen",
      description: "Alle registrierten Benutzer, ihre Charaktere und den Zustand ihrer Tokens sehen.",
    },
    usersManage: {
      label: "Benutzer verwalten",
      description: "Gäste freischalten, Rollen (unterhalb der eigenen) ändern und Konten deaktivieren.",
    },
    membersAudit: {
      label: "Mitglieder-Audit der Corporation",
      description: "Die Mitgliederliste im Spiel mit registrierten Charakteren und fehlenden Scopes abgleichen.",
    },
    auditView: {
      label: "Audit-Log ansehen",
      description: "Das Protokoll administrativer Aktionen lesen.",
    },
    syncView: {
      label: "Sync-Status ansehen",
      description: "ESI-Sync-Jobs im Hintergrund und ihre Fehler sehen.",
    },
    syncTrigger: {
      label: "Syncs auslösen",
      description: "Einen ESI-Sync-Job zur sofortigen Ausführung einreihen.",
    },
    systemView: {
      label: "Systeminfo ansehen",
      description: "Den technischen Zustand dieser Instanz sehen und das Supportpaket für Fehlerberichte herunterladen.",
    },
  },
  scopes: {
    corporationRoles:
      "Erkennt, welche deiner Charaktere Director- oder Accountant-Rollen haben, damit Keystar das passende Token nutzt.",
    corporationMembership: "Liest die Mitgliederliste der Corporation, um noch nicht registrierte Mitglieder anzuzeigen.",
  },
  jobs: {
    serverStatus: "Tranquility-Status",
    affiliations: "Charakter-Zugehörigkeiten",
    characterRoles: "Corporation-Rollen im Spiel",
    corporationMembers: "Mitgliederliste der Corporation",
    marketPrices: "Marktpreise",
    housekeeping: "Aufräumarbeiten",
    universeSystems: "Sonnensystemliste",
  },
};
