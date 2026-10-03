import type { ReactNode } from "react";
import type { admin as en } from "../en/admin";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const admin: typeof en = {
  users: {
    metaTitle: "Benutzer & Rollen",
    description:
      "Keystar-Rollen legen fest, was ein Konto sehen und ändern darf. Sie sind unabhängig von den Corporation-Rollen im Spiel.",
    awaitingApproval: (count: number) => `Freischaltung ausstehend (${n(count)})`,
    awaitingApprovalHint: "Von außerhalb der Heimat-Corporation oder vor der automatischen Freischaltung angemeldet",
    unknown: "Unbekannt",
    registered: (when: string) => `registriert ${when}`,
    approve: "Als Mitglied freischalten",
    columns: {
      pilot: "Pilot",
      characters: "Charaktere",
      esiHealth: "ESI-Zustand",
      lastLogin: "Letzte Anmeldung",
      role: "Rolle",
      actions: "Aktionen",
    },
    you: "(du)",
    health: {
      disabled: "Deaktiviert",
      revoked: (count: number) => `${n(count)} widerrufen`,
      missingScopes: (count: number) =>
        count === 1 ? "1 Charakter mit fehlenden Scopes" : `${n(count)} Charaktere mit fehlenden Scopes`,
      allGood: "Alles in Ordnung",
      fixOwn: "Unter „Meine Charaktere“ beheben",
      openAudit: "Mitglieder-Audit öffnen",
    },
    roleFor: (name: string | null) => `Rolle für ${name ?? "Benutzer"}`,
    saveRole: "Rolle speichern",
    roleChange: {
      changed: (name: string, role: string) => `${name} ist jetzt ${role}`,
      from: (role: string) => `Vorher ${role}`,
      restored: (name: string, role: string) => `${name} ist wieder ${role}`,
      failed: (name: string) => `Die Rolle von ${name} konnte nicht geändert werden`,
      errors: {
        self: "Du kannst deine eigene Rolle nicht ändern.",
        forbidden: "Du darfst keine Benutzer mehr verwalten.",
        notFound: "Dieses Konto existiert nicht mehr.",
        higherRole: "Nur eine höhere Rolle kann dieses Konto ändern.",
        unassignable: "Diese Rolle kannst du nicht vergeben.",
        changed: "Jemand hat diese Rolle inzwischen geändert. Die Tabelle zeigt jetzt die aktuelle Rolle.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    enable: "Aktivieren",
    disable: "Deaktivieren",
    access: {
      approved: (name: string) => `${name} als Mitglied freigegeben`,
      disabled: (name: string) => `${name} deaktiviert`,
      enabled: (name: string) => `${name} wieder aktiviert`,
      failed: (name: string) => `${name} konnte nicht geändert werden`,
      errors: {
        self: "Dein eigenes Konto kannst du hier nicht ändern.",
        forbidden: "Du darfst keine Benutzer mehr verwalten.",
        notFound: "Dieses Konto existiert nicht mehr.",
        higherRole: "Nur eine höhere Rolle kann dieses Konto ändern.",
        unassignable: "Diese Rolle kannst du nicht vergeben.",
        changed: "Dieses Konto wartet nicht mehr auf Freigabe. Die Seite zeigt jetzt seine aktuelle Rolle.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    noAction: {
      self: "Du kannst dein eigenes Konto nicht deaktivieren",
      higher: "Nur eine höhere Rolle kann dieses Konto ändern",
    },
    rolePermissions: "Rollenrechte",
    filter: {
      showing: (count: number, role: string) => `${n(count)} Benutzer mit der Rolle ${role}`,
      showAll: "Alle anzeigen",
      onlyRole: "Nur diese Rolle anzeigen",
      allUsers: "Alle Benutzer anzeigen",
      empty: "Keine Benutzer mit dieser Rolle.",
    },
    zkill: (name: string) => `${name} auf zKillboard`,
  },
  members: {
    metaTitle: "Mitglieder-Audit",
    noHome: {
      title: "Keine Heimat-Corporation eingerichtet",
      body: (settings: string) => `Lege die Heimat-Corporation unter „${settings}“ fest, um ihre Mitglieder zu prüfen.`,
    },
    description:
      "Gleiche die Mitgliederliste der Corporation im Spiel mit den in Keystar registrierten Charakteren ab und hake bei fehlendem ESI-Zugriff nach.",
    stats: {
      roster: "Mitgliederliste im Spiel",
      rosterHint: "Braucht ein Token für die Mitgliederliste",
      registered: "Registriert",
      ofRoster: (share: string) => `${share} der Mitgliederliste`,
      notRegistered: "Nicht registriert",
      missingEsi: "ESI fehlt oder widerrufen",
    },
    columns: { character: "Charakter", status: "Status", account: "Konto", esi: "ESI" },
    characterFallback: (id: string) => `Charakter ${id}`,
    search: {
      label: "Mitglieder durchsuchen",
      placeholder: "Nach Charakter, Konto oder Charakter-ID suchen…",
      clear: "Suche löschen",
    },
    filter: {
      onlyThese: "Nur diese anzeigen",
      showAll: "Alle anzeigen",
      labels: {
        roster: "in der Mitgliederliste im Spiel",
        registered: "registriert",
        unregistered: "nicht registriert",
        esi: "mit fehlendem oder widerrufenem ESI",
      },
    },
    results: (count: number, filter: string | null, q: string | null, account: string | null) =>
      `${n(count)} ${count === 1 ? "Charakter" : "Charaktere"}${account ? ` ${account}` : ""}${filter ? ` ${filter}` : ""}${q ? `, Suche „${q}“` : ""}`,
    ofAccount: (main: string | null) => (main ? `des Kontos ${main}` : "eines unbekannten Kontos"),
    clearAll: "Suche und Filter zurücksetzen",
    empty: "Keine passenden Charaktere.",
    pageOf: (page: number, pages: number) => `Seite ${n(page)} von ${n(pages)}`,
    pagination: "Seitennavigation",
    previous: "Zurück",
    next: "Weiter",
    status: {
      notRegistered: "Nicht registriert",
      notInRoster: "Nicht in der Mitgliederliste",
      registered: "Registriert",
    },
    esi: {
      tokenRevoked: "Token widerrufen",
      noToken: "Kein Token",
      missing: (count: number) => `${n(count)} fehlen`,
      complete: "Vollständig",
    },
    request: {
      title: "ESI-Zugriff anfordern",
      subtitle: "Teile diesen Link mit den Mitgliedern",
      body: (page: string) =>
        `Die Seite erklärt genau, welche Scopes angefragt werden und warum, und führt das Mitglied dann durch EVE SSO. Alts lassen sich danach unter „${page}“ verknüpfen.`,
    },
    rosterUnavailable: {
      title: "Mitgliederliste nicht verfügbar",
      subtitle: "Warum einige Zahlen fehlen",
      body: (scope: ReactNode, page: string) => (
        <>
          Die Mitgliederliste im Spiel stammt aus {scope}. Verknüpfe einen Charakter der Heimat-Corporation mit
          Corporation-Zugriff ({page}), dann erscheint die Liste nach dem nächsten Sync.
        </>
      ),
    },
  },
  sync: {
    metaTitle: "Sync-Status",
    description:
      "ESI-Jobs, die der Worker im Hintergrund ausführt. Jeder Job hält sich an die Cache-Zeiten und Rate-Limits von ESI.",
    resume: "Sync fortsetzen",
    pause: "Sync pausieren",
    runAll: "Alle jetzt ausführen",
    stats: {
      worker: "Worker",
      online: (count: number) => `${n(count)} online`,
      offline: "Offline",
      paused: "Pausiert",
      running: "Läuft",
      noHeartbeat: "Kein Heartbeat",
      lastBeat: (when: string) => `letzter Heartbeat ${when}`,
      activeJobs: "Aktive Jobs",
      disabled: (count: number) => `${n(count)} deaktiviert`,
      failing: "Fehlgeschlagen",
      needsAttention: "Handlungsbedarf",
      allHealthy: "Alle fehlerfrei",
      nextRun: "Nächster Lauf",
    },
    noWorker: (compose: ReactNode, dev: ReactNode) => (
      <>
        Seit 2 Minuten kein Heartbeat vom Worker. Starte ihn mit {compose} (oder {dev} in der Entwicklung).
      </>
    ),
    columns: {
      job: "Job",
      owner: "Besitzer",
      status: "Status",
      result: "Ergebnis",
      lastSuccess: "Letzter Erfolg",
      nextRun: "Nächster Lauf",
    },
    ownerTypes: {
      character: "Charakter",
      corporation: "Corporation",
      global: "Global",
    },
    disabled: "Deaktiviert",
    errorCount: (count: number) => `Fehler ×${n(count)}`,
    runNow: "Jetzt ausführen",
    toast: {
      queued: (job: string) => `${job} eingeplant`,
      allQueued: "Alle Sync-Jobs eingeplant",
      queuedDetail: "Startet, sobald ein Worker frei ist, meist innerhalb von Sekunden.",
      paused: "Synchronisierung pausiert",
      resumed: "Synchronisierung fortgesetzt",
      failed: "Die Synchronisierung konnte nicht geändert werden",
      errors: {
        forbidden: "Dafür hast du keine Berechtigung mehr.",
        notFound: "Dieser Job existiert nicht mehr oder ist deaktiviert. Die Seite zeigt jetzt die aktuellen Jobs.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    sections: {
      corporation: (name: string | null) => (name ? `Corporation · ${name}` : "Corporation"),
      characters: "Charaktere",
      system: "System",
      jobCount: (count: number) => `${n(count)} ${count === 1 ? "Job" : "Jobs"}`,
      characterCount: (characters: number, jobs: number) =>
        `${n(characters)} ${characters === 1 ? "Charakter" : "Charaktere"} · ${n(jobs)} ${jobs === 1 ? "Job" : "Jobs"}`,
      charactersHint:
        "Nur Charaktere, die mit Keystar verknüpft sind und die nötigen ESI-Scopes freigegeben haben, bekommen eigene Jobs. Andere Mitglieder erscheinen hier, sobald sie sich anmelden und die Scopes erteilen.",
      account: (main: string) => `Konto: ${main}`,
      failingCount: (count: number) => `${n(count)} fehlgeschlagen`,
      nextRun: (when: string) => `nächster Lauf ${when}`,
      empty: "Noch keine Jobs.",
    },
  },
  settings: {
    metaTitle: "Einstellungen",
    description: "Anwendungsweite Konfiguration. Änderungen gelten sofort und werden im Audit-Log festgehalten.",
    save: "Einstellungen speichern",
    saved: "Einstellungen gespeichert",
    savedHomeChanged: "Das Killboard der neuen Heimat-Corporation wird im Hintergrund importiert.",
    saveFailed: "Einstellungen nicht gespeichert",
    errors: {
      forbidden: "Du darfst die Einstellungen nicht mehr ändern.",
      invalidCorporation: "Die Heimat-Corporation muss eine numerische Corporation-ID sein, z. B. 98765432.",
      unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und prüfe, welche Änderungen übernommen wurden.",
    },
    home: {
      title: "Heimat-Corporation",
      subtitle: "Die Corporation, deren Mitglieder, Mitgliederliste und Raffinerien Keystar verfolgt",
      corporationId: "Corporation-ID",
      placeholder: "z. B. 98765432",
      hint: "Wähle aus den Corporations verknüpfter Charaktere oder füge eine ID ein (aus zKillboard oder EVE Who).",
    },
    access: {
      title: "Zugang",
      subtitle: "Wer ohne manuelle Freischaltung hineinkommt",
      autoCorp: "Mitglieder der Heimat-Corporation automatisch freischalten",
      autoCorpHint: (member: string, guest: string) => `Sie starten als ${member}, alle anderen als ${guest}.`,
      autoAlliance: "Allianzmitglieder automatisch freischalten",
      autoAllianceHint: "Charaktere in der Allianz der Heimat-Corporation.",
      ssoConfigured: "Eingerichtet",
      ssoNotConfigured: "Nicht eingerichtet – setze EVE_CLIENT_ID und EVE_CLIENT_SECRET.",
      callbackUrl: (url: ReactNode) => <>Callback-URL für developers.eveonline.com: {url}</>,
      compatibilityDate: (date: string) => `ESI-Kompatibilitätsdatum: ${date}`,
    },
    valuation: {
      title: "Mining-Bewertung",
      subtitle: "Wie ISK-Werte berechnet werden",
      source: "Preisquelle",
      mode: "Preisdatum",
      modes: {
        current: "Aktuelle Preise",
        historical: "Preis am Tag des Abbaus",
      },
      hint: "Roherz ohne eigenen Markt fällt auf seine komprimierte Variante zurück, danach auf den ESI-Durchschnittspreis. Historische Preise werden täglich aufgezeichnet, sobald Keystar läuft.",
    },
    permissions: {
      title: "Berechtigungen",
      subtitle: "Mindestrolle in Keystar je Berechtigung. Rollen sind hierarchisch: Höhere Rollen umfassen alles darunter.",
      columns: { permission: "Berechtigung", description: "Beschreibung", minRole: "Mindestrolle" },
      fixed: (role: string) => `${role} (fest)`,
      withDefault: (role: string) => `${role} (Standard)`,
    },
  },
  audit: {
    metaTitle: "Audit-Log",
    description: (count: number) => `Die letzten ${n(count)} sicherheitsrelevanten und administrativen Aktionen.`,
    columns: { time: "Zeit", actor: "Ausgeführt von", action: "Aktion", target: "Ziel", details: "Details" },
    empty: "Noch nichts protokolliert.",
    system: "System",
  },
};
