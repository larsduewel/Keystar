import type { ReactNode } from "react";
import type { admin as en } from "../en/admin";
import type { CheckStatus } from "@/core/system/checks";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;
type CheckValues = Record<string, string | number>;
/** Service names in network check values ("esi,sso" or "zkill:403"); product names, the same in every language. */
const NETWORK_NAMES: Record<string, string> = { esi: "ESI", sso: "EVE SSO", zkill: "zKillboard" };
const names = (list: string | number) =>
  String(list)
    .split(",")
    .filter(Boolean)
    .map((e) => NETWORK_NAMES[e.split(":")[0]] ?? e)
    .join(", ");
/** One sentence per service that answered with an error ("zkill:403", "esi:503"). */
const refusedText = (list: string | number) =>
  String(list)
    .split(",")
    .filter(Boolean)
    .map((e) => {
      const [name, code] = e.split(":");
      return name === "zkill" && code === "403"
        ? "zKillboard sperrt diesen Server (HTTP 403): Es braucht einen User-Agent mit Kontaktdaten, setze ESI_CONTACT."
        : `${NETWORK_NAMES[name] ?? name} antwortet mit einem Fehler (HTTP ${code}) und ist vielleicht ausgefallen.`;
    })
    .join(" ");

export const admin: typeof en = {
  users: {
    metaTitle: "Benutzer & Rollen",
    description:
      "Keystar-Rollen legen fest, was ein Konto sehen und ändern darf. Sie sind unabhängig von den Corporation-Rollen im Spiel.",
    awaitingApproval: (count: number) => `Freischaltung ausstehend (${n(count)})`,
    awaitingApprovalHint: "Von außerhalb der Heimat-Corporation oder vor der automatischen Freischaltung angemeldet",
    outsideGuests: {
      title: (count: number) => `Gäste außerhalb der Corporation (${n(count)})`,
      hint: "Registrieren können sich jetzt nur noch Mitglieder, diese Konten sind aber schon vorher entstanden. Deaktivieren meldet sie ab und lässt sich pro Konto rückgängig machen; freigeschaltete Konten sind nicht betroffen.",
      disable: "Diese Konten deaktivieren",
      confirm: (count: number) =>
        `${n(count)} ${count === 1 ? "Gastkonto" : "Gastkonten"} von außerhalb der Corporation deaktivieren? Sie werden sofort abgemeldet.`,
      done: "Gastkonten von außerhalb deaktiviert",
      failed: "Die Konten konnten nicht deaktiviert werden",
      errors: {
        forbidden: "Du darfst keine Benutzer mehr verwalten.",
        notRestricted: "Die Registrierung ist nicht mehr auf Mitglieder beschränkt, daher wurde nichts geändert.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
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
      restrict: "Nur Mitglieder können sich registrieren",
      restrictHint:
        "Charaktere außerhalb der Heimat-Corporation (oder ihrer Allianz, falls oben freigeschaltet) bekommen gar kein Konto, statt als Gast zu warten. Schalte das beim Rekrutieren über den Beitrittslink aus. Bestehende Konten bleiben unverändert.",
      outsideGuests: (count: number) =>
        `${n(count)} ${count === 1 ? "Gastkonto stammt" : "Gastkonten stammen"} von außerhalb der Corporation.`,
      reviewOutsideGuests: "Unter Benutzer prüfen",
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
  system: {
    metaTitle: "Systeminfo",
    description:
      "Technischer Zustand dieser Keystar-Instanz. Hilft, wenn etwas nicht funktioniert, und beim Melden eines Fehlers mit allem, was die Entwickler brauchen, ohne Piloten- oder Corporation-Daten.",
    actions: {
      copySummary: "Zusammenfassung kopieren",
      summaryCopied: "Zusammenfassung kopiert. Füge sie in dein GitHub-Issue ein.",
      reportIssue: "Fehler melden",
      download: "Supportpaket herunterladen",
    },
    overall: {
      ok: "Alle Prüfungen bestanden",
      problems: (count: number) => `${plural(count, "Problem braucht", "Probleme brauchen")} Aufmerksamkeit`,
      breakdown: (failed: number, warnings: number) =>
        [failed ? `${n(failed)} fehlgeschlagen` : null, warnings ? plural(warnings, "Warnung", "Warnungen") : null]
          .filter(Boolean)
          .join(" · "),
      checkedWhenLoaded: "Geprüft beim Laden dieser Seite",
      recheck: "Erneut prüfen",
      whatNext: "Was jetzt?",
    },
    /** Warnings wherever private data could leave the instance (logs, the public GitHub issue). */
    privacy: {
      label: "Datenschutz",
      logs: "Logs enthalten Charakter- und Corporation-IDs und können Namen von Piloten, Corporations und Systemen oder die Adresse deines Servers enthalten. Ersetze sie vor dem Posten: GitHub-Issues sind öffentlich.",
      report: "GitHub-Issues sind öffentlich. Schreibe keine Namen oder IDs von Piloten oder Corporations und nicht die Adresse deines Servers in die Beschreibung oder Anhänge.",
      package: "Fehlermeldungen werden automatisch bereinigt, aber ein Name ohne Anführungszeichen wird nicht immer erkannt. Sieh dir die Vorschau an, bevor du sie teilst.",
    },
    checksTitle: "Systemprüfungen",
    checksSubtitle: "Automatische Prüfungen auf die häufigsten Ursachen von Problemen.",
    status: { ok: "OK", warn: "Warnung", fail: "Fehlgeschlagen", skip: "Nicht geprüft" } satisfies Record<CheckStatus, string>,
    checks: {
      database: {
        label: "Datenbank erreichbar",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? `Antwort in ${v.ms} ms`
            : "Keystar erreicht PostgreSQL nicht. Prüfe DATABASE_URL und ob der Datenbank-Container läuft.",
      },
      migrations: {
        label: "Migrationen aktuell",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? `${n(Number(v.applied))} von ${n(Number(v.bundled))} angewendet`
            : s === "fail"
              ? `${plural(Number(v.pending), "Migration fehlt", "Migrationen fehlen")}. Starte den App-Container neu, er migriert beim Start.`
              : s === "warn" && v.reason === "unknown"
                ? "Die Datenbank wurde von einer neueren Keystar-Version migriert. Starte diese Version wieder oder spiele ein Backup ein."
                : s === "warn"
                  ? `${plural(Number(v.changed), "angewendete Migration weicht", "angewendete Migrationen weichen")} von den Dateien dieser Version ab.`
                  : "Braucht die Datenbank.",
      },
      schema: {
        label: "Datenbankschema vollständig",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? "Alle erwarteten Tabellen und Spalten sind vorhanden"
            : s === "fail"
              ? `${plural(Number(v.missing), "Tabelle oder Spalte fehlt", "Tabellen oder Spalten fehlen")}. Das Supportpaket listet sie auf.`
              : "Braucht die Datenbank.",
      },
      worker: {
        label: "Worker läuft",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? `Letztes Lebenszeichen vor ${n(Number(v.seconds))} s`
            : s === "fail"
              ? "Kein Lebenszeichen in den letzten 2 Minuten. Starte ihn mit docker compose up -d worker."
              : "Braucht die Datenbank.",
      },
      workerVersion: {
        label: "Worker und Web auf derselben Version",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? `Beide laufen auf ${v.version}`
            : s === "warn"
              ? `Der Worker läuft auf ${v.worker}, die Web-App auf ${v.web}. Starte nach einem Update auch den Worker-Container neu.`
              : "Braucht einen laufenden Worker.",
      },
      jobs: {
        label: "Hintergrund-Jobs gesund",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? "Kein Job scheitert wiederholt"
            : s === "fail"
              ? `${plural(Number(v.count), "Job ist", "Jobs sind")} ${v.streak}-mal oder öfter in Folge gescheitert`
              : "Braucht die Datenbank.",
      },
      jobQueue: {
        label: "Job-Warteschlange läuft",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? "Keine überfälligen Jobs"
            : s === "warn"
              ? `${plural(Number(v.overdue), "Job ist", "Jobs sind")} überfällig, ${plural(Number(v.stale), "Sperre", "Sperren")} abgelaufen. Der Worker ist vielleicht überlastet oder hängt.`
              : "Braucht einen laufenden Worker und aktiven Sync.",
      },
      syncPaused: {
        label: "Sync aktiv",
        detail: (s: CheckStatus) =>
          s === "ok" ? "Nicht pausiert" : s === "warn" ? "Der Sync ist auf der Seite Sync-Status pausiert." : "Braucht die Datenbank.",
      },
      sso: {
        label: "EVE SSO eingerichtet",
        detail: (s: CheckStatus) =>
          s === "ok"
            ? "Client-ID und Secret sind gesetzt"
            : s === "fail"
              ? "Setze EVE_CLIENT_ID und EVE_CLIENT_SECRET, sonst kann sich niemand anmelden."
              : "Im Demo-Modus nicht nötig.",
      },
      appUrl: {
        label: "App-URL stimmt",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? "APP_URL ist die Adresse, mit der du Keystar geöffnet hast"
            : s === "warn" && v.reason === "origin"
              ? "APP_URL weicht von der Adresse im Browser ab. Anmeldung und Cookies funktionieren dann nicht; setze APP_URL auf die öffentliche Adresse."
              : s === "warn"
                ? "APP_URL nutzt kein https. EVE SSO und sichere Cookies brauchen im Betrieb https."
                : "Wird nur im Browser geprüft.",
      },
      clock: {
        label: "Serveruhr",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? "Im Takt mit Datenbank und ESI"
            : s === "warn"
              ? `Weicht ${v.dbSeconds} s von der Datenbank und ${v.esiSeconds} s von ESI ab. Schalte die Zeitsynchronisation (NTP) auf dem Host ein.`
              : "Braucht die Datenbank.",
      },
      esiLimits: {
        label: "ESI-Ratenlimits",
        detail: (s: CheckStatus, v: CheckValues) =>
          s === "ok"
            ? `Fehlerbudget: noch ${v.remain}`
            : s === "warn"
              ? "Anfragen pausieren wegen eines ESI-Ratenlimits. Die Jobs laufen weiter, sobald es zurückgesetzt ist."
              : "Noch keine ESI-Anfragen.",
      },
      network: {
        label: "Ausgehende Verbindungen",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? `ESI, EVE SSO und zKillboard antworten (langsamste ${n(Number(v.ms))} ms)`
            : s === "skip"
              ? "Nicht geprüft."
              : v.down
                ? `${names(v.down)} nicht erreichbar. Prüfe DNS, Firewall und Proxy des Servers.`
                : refusedText(v.refused),
      },
      auditLog: {
        label: "Audit-Log geschrieben",
        detail: (s: CheckStatus, v: CheckValues): string =>
          s === "ok"
            ? "Seit dem Start der Web-App ging kein Audit-Eintrag verloren"
            : s === "warn"
              ? `${plural(Number(v.count), "Audit-Eintrag konnte", "Audit-Einträge konnten")} seit dem Start der Web-App nicht geschrieben werden (zuletzt: ${v.action}). Der Fehler steht im Server-Log; meist war die Datenbank kurz nicht erreichbar.`
              : "Wird nur im Browser geprüft.",
      },
    },
    keystar: {
      title: "Keystar",
      releaseNotes: "Versionshinweise",
      version: "Version",
      install: "Installation",
      installDocker: (tag: string | null) => (tag ? `Docker-Image :${tag}` : "Docker-Image (eigener Build)"),
      installSource: "Aus dem Quellcode",
      uptime: "Laufzeit",
      uptimeValue: (seconds: number) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return d ? `${d} T ${h} Std.` : h ? `${h} Std. ${m} Min.` : `${m} Min.`;
      },
      runtime: "Laufzeitumgebung",
      node: (version: string) => `Node ${version}`,
      host: "Host",
      hostValue: (platform: string, cpus: number, memory: string | null) =>
        [platform, `${n(cpus)} CPU`, memory ? `Limit ${memory}` : null].filter(Boolean).join(" · "),
      environment: "Umgebung",
      demo: "Demo-Modus",
    },
    load: {
      title: "Auslastung",
      subtitle:
        "Die Werte der Web-App gelten seit dem letzten Aufruf dieser Seite, die des Workers für seinen letzten Heartbeat (30 s). Der Load Average gilt für den ganzen Host, nicht den Container.",
      columns: { web: "Web-App", worker: "Worker" },
      cpu: "CPU",
      cpuValue: (percent: string, cores: string) => `${percent} von ${cores} CPU`,
      memory: "Speicher (RSS)",
      memoryValue: (used: string, limit: string | null) => (limit ? `${used} von ${limit}` : used),
      heap: "JS-Heap",
      container: "Container-Speicher",
      hostFree: "Frei auf dem Host",
      hostFreeValue: (free: string, total: string) => `${free} von ${total}`,
      loadAverage: "Load Average (1 · 5 · 15 Min.)",
      loadValue: (one: string, five: string, fifteen: string) => `${one} · ${five} · ${fifteen}`,
      workerStale: "Kein Heartbeat in den letzten 2 Minuten.",
      workerOld: "Dieser Worker läuft in einer älteren Version und meldet seine Auslastung noch nicht.",
    },
    database: {
      title: "Datenbank",
      postgres: "PostgreSQL",
      migrations: "Migrationen",
      migrationsValue: (applied: number, bundled: number | null) =>
        bundled === null ? `${n(applied)} angewendet` : `${n(applied)} / ${n(bundled)} angewendet`,
      latest: (tag: string, when: string) => `Letzte Migration ${tag} · angewendet am ${when}`,
      tables: {
        title: "Größte Tabellen",
        rows: "Zeilen",
        size: "Größe",
        approx: (rows: string) => `~${rows}`,
        estimated: "Schätzung von PostgreSQL: Das Zählen dieser Tabelle dauerte zu lange",
      },
      unavailable: (error: string) => `Die Datenbank konnte nicht gelesen werden: ${error}`,
    },
    network: {
      title: "Netzwerk",
      subtitle: "Ausgehende Verbindungen der Web-App, geprüft beim Laden dieser Seite.",
      targets: { esi: "ESI", sso: "EVE SSO", zkill: "zKillboard" },
      purpose: { esi: "Alle Sync-Jobs", sso: "Anmeldung", zkill: "Killboard und Bedrohungsanalyse" },
      answered: (status: number, ms: string) => `HTTP ${status} · ${ms} ms`,
      unreachable: (error: string) => `Nicht erreichbar: ${error}`,
    },
    worker: {
      title: "Worker & Hintergrund-Jobs",
      subtitle: "Jobs startest, pausierst und wiederholst du auf der Seite Sync-Status.",
      openSync: "Sync-Status öffnen",
      none: "Noch kein Worker hat sich gemeldet.",
      version: "Version",
      lastBeat: "Letztes Lebenszeichen",
      started: "Gestartet",
      slots: (running: number, total: number) => `${n(running)} von ${n(total)} Plätzen`,
      running: "Aktiv",
      stats: { ok: "OK", failing: "Fehlerhaft", running: "Laufend", overdue: "Überfällig", errorBudget: "ESI-Fehlerbudget" },
      failing: {
        job: "Fehlerhafter Job",
        owners: "Betroffen",
        streak: "Fehler in Folge",
        lastError: "Letzter Fehler",
        lastRun: "Letzter Lauf",
        ownerCount: (count: number) => plural(count, "Besitzer", "Besitzer"),
      },
      noFailing: "Keine fehlerhaften Jobs.",
    },
    config: {
      title: "Konfiguration",
      subtitle: "Umgebungsvariablen dieser Instanz. Geheime Werte werden nie angezeigt, auch hier nicht.",
      columns: { variable: "Variable", status: "Status", value: "Wert" },
      states: { set: "Gesetzt", default: "Standard", unset: "Nicht gesetzt" },
      hidden: "Verborgen",
      custom: "Angepasst",
      https: (https: boolean, matches: boolean | null) =>
        [https ? "https" : "http", matches === true ? "passt zu dieser Adresse" : matches === false ? "weicht von dieser Adresse ab" : null]
          .filter(Boolean)
          .join(" · "),
      ids: (count: number) => plural(count, "Charakter", "Charaktere"),
    },
    help: {
      title: "Fehlersuche & Fehler melden",
      checks: {
        title: "Prüfe die Systemprüfungen oben",
        body: "Meist ist es ein gestoppter Worker, eine fehlende Migration oder ein fehlender ESI-Scope. Die Seite Sync-Status zeigt den letzten Fehler jedes Jobs.",
      },
      search: { title: "Bestehende Issues durchsuchen", body: "Vielleicht hat es schon jemand gemeldet.", link: "Issues auf GitHub durchsuchen" },
      download: {
        title: "Supportpaket herunterladen",
        body: "Nur technische Details, keine Piloten- oder Corporation-Daten. Startet die Web-App nicht, erzeugst du es auf der Kommandozeile:",
      },
      logs: {
        title: "Logs sammeln",
        body: "Keystar speichert selbst keine Logs. Kopiere die letzte Stunde aus Docker und entferne vor dem Teilen alles Geheime:",
      },
      report: {
        title: "Fehlerbericht öffnen",
        body: "Version und eine Systemzusammenfassung sind schon eingetragen. Hänge Supportpaket und Logs an.",
      },
    },
    package: {
      title: "Supportpaket",
      intro: "Eine technische Momentaufnahme dieser Instanz für einen Fehlerbericht. Prüfe den Inhalt, bevor du es teilst.",
      close: "Schließen",
      included: "Enthalten",
      includedItems: [
        ["Build & Laufzeit", "Version, Commit, Node, Limits"],
        ["Systemprüfungen", "alle Ergebnisse"],
        ["Konfiguration", "gesetzt / Standard / fehlt"],
        ["Datenbank", "Migrationen, Schema, Tabellen"],
        ["Worker & Jobs", "je Job, Fehlermuster"],
        ["ESI & zKillboard", "Anfragezähler"],
        ["Module & Tokens", "nur Anzahlen"],
        ["Audit-Aktivität", "Anzahl je Aktion, 7 Tage"],
      ] as [string, string][],
      never: "Nie enthalten",
      neverItems: [
        "Namen oder IDs von Piloten, Corporations und Allianzen",
        "Secrets, Passwörter und Tokens",
        "Die Adresse deiner Instanz und Hostnamen",
        "Inhalte von Wallets, Mining, Kills oder Mails",
        "Wer was im Audit-Log getan hat",
      ],
      removed: "Aus Fehlermeldungen entfernt",
      rules: {
        token: (count: number) => plural(count, "Token", "Tokens"),
        url: (count: number) => plural(count, "URL", "URLs"),
        email: (count: number) => plural(count, "E-Mail", "E-Mails"),
        host: (count: number) => plural(count, "Hostname", "Hostnamen"),
        eveId: (count: number) => plural(count, "EVE-ID", "EVE-IDs"),
        name: (count: number) => plural(count, "Name", "Namen"),
      },
      preview: "Vorschau",
      copyJson: "JSON kopieren",
      size: (kb: number) => `${n(kb)} KB`,
      auditNote: "Downloads werden im Audit-Log protokolliert.",
      cancel: "Abbrechen",
      download: "Herunterladen",
    },
    issue: {
      title: "Fehler melden",
      intro: "Fehlerberichte gehen an das Keystar-Projekt auf GitHub. Du brauchst ein GitHub-Konto, und Berichte sind öffentlich.",
      close: "Schließen",
      checks: {
        title: "Systemprüfungen ansehen",
        problems: (count: number) => `${plural(count, "Problem", "Probleme")} gefunden`,
        none: "Keine Probleme gefunden",
        body: "Diese erklären das Problem oft schon ohne Bericht:",
      },
      search: {
        title: "Bestehende Issues durchsuchen",
        body: "Hat es schon jemand gemeldet, schreib dort lieber einen Kommentar.",
        label: "Issues durchsuchen",
        placeholder: "z. B. corp.wallet 403",
        button: "Auf GitHub suchen",
      },
      download: { title: "Supportpaket herunterladen", body: "Hänge es an den Bericht an.", button: "Herunterladen" },
      logs: { title: "Logs sammeln", body: "Führe das auf dem Server aus und entferne dann alles Geheime aus der Datei:" },
      open: {
        title: "Fehlerbericht öffnen",
        body: "GitHub öffnet sich mit den Feldern rechts bereits ausgefüllt. Beschreibe, was du getan hast und was schiefging, und ziehe Supportpaket und Logs in den Bericht.",
      },
      prefilled: "Für dich ausgefüllt",
      version: "Version",
      summary: "Systemzusammenfassung",
      copySummary: "Zusammenfassung kopieren",
      openGithub: "Fehlerbericht auf GitHub öffnen",
    },
  },
};
