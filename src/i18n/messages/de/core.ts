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
      description: "Die Mitgliederliste im Spiel mit registrierten Charakteren und ihrem ESI-Zugriff abgleichen.",
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
  help: {
    dashboard:
      "Eine Zusammenfassung der letzten 30 Tage deiner Corporation im Vergleich zu den 30 Tagen davor: Kills, Verluste und ISK-Effizienz aus dem Killboard und der abgebaute Wert aus der Mining-Übersicht, soweit deine Rolle sie sehen darf. Die obere Zeile und „Deine Charaktere“ zeigen registrierte Mitglieder, deinen ESI-Zugriff und ob der Sync-Worker läuft; Kacheln öffnen die Seite dahinter.",
    characters:
      "Verknüpfe jeden Charakter, den du spielst, über den EVE-Login; das Verknüpfen fragt keinen ESI-Zugriff an. Der optionale Zugriff, den ein Charakter teilt, steht mit einem Link zur Seite, die ihn schaltet; „Neu autorisieren“ behebt ein widerrufenes Token, „Jetzt synchronisieren“ reiht seine Hintergrund-Syncs ein. Directors, Accountants und Station Manager können einen Charakter zusätzlich mit Corporation-Zugriff verknüpfen, den Keystar für Corp-Daten wie die Mitgliederliste und Mondbohrer-Ledger braucht.",
    users:
      "Alle Keystar-Konten mit ihren Charakteren, ESI-Zustand, letzter Anmeldung und Rolle; ein Klick auf eine Rolle oben zeigt nur deren Konten. Wenn du Benutzer verwalten darfst, schaltest du hier Gäste frei, änderst Rollen unterhalb deiner eigenen und deaktivierst Konten. Keystar-Rollen legen fest, was ein Konto sehen darf, und sind unabhängig von den Corporation-Rollen im Spiel.",
    members:
      "Gleicht die Mitgliederliste der Heimat-Corporation im Spiel mit den in Keystar registrierten Charakteren ab, damit du siehst, wer noch nicht registriert ist und wessen ESI-Token widerrufen wurde. ESI-Zugriff ist pro Charakter optional, ein Charakter ohne ist also kein Problem. Die Liste kommt aus dem stündlichen Sync „Mitgliederliste der Corporation“, der einen Charakter der Heimat-Corporation mit Corporation-Zugriff braucht. Den Registrierungslink teilst du mit Mitgliedern, die sich noch nicht registriert haben.",
    sync:
      "Die ESI-Jobs, die der Worker im Hintergrund für die Corporation, jeden verknüpften Charakter und das System ausführt, mit letztem Ergebnis oder Fehler und dem nächsten Lauf. Wenn deine Rolle Syncs auslösen darf, reiht „Jetzt ausführen“ einen Job sofort ein, er bekommt aber keine frischeren Daten, als der ESI-Cache hergibt; Admins können hier außerdem den gesamten Sync pausieren.",
    settings:
      "Die anwendungsweite Konfiguration für Admins: welche Heimat-Corporation Keystar verfolgt, wer sich registrieren darf und wer automatisch freigeschaltet wird, wie ISK-Werte beim Mining berechnet werden und welche Mindestrolle jede Berechtigung braucht. Änderungen gelten, sobald du speicherst, und werden im Audit-Log festgehalten.",
    audit:
      "Die letzten 300 sicherheitsrelevanten und administrativen Aktionen, die neueste zuerst: Anmeldungen, verknüpfte und entfernte Charaktere, Freischaltungen, Rollen- und Einstellungsänderungen, ausgelöste Syncs und heruntergeladene Supportpakete. Jeder Eintrag zeigt, wer es war („System“ bei automatischen Aktionen), was betroffen ist und die Details.",
    system:
      "Der technische Zustand dieser Keystar-Instanz für Admins: Systemprüfungen für Datenbank, Worker, Hintergrund-Jobs, EVE SSO und ausgehende Verbindungen, dazu Version, Auslastung und Konfiguration. Wenn etwas nicht funktioniert, fang bei den fehlgeschlagenen Prüfungen an und melde den Fehler dann mit dem Supportpaket, das keine Piloten- oder Corporation-Daten enthält.",
  },
};
