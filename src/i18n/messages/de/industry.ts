import { FORMATTERS } from "@/lib/format";
import type { industry as en } from "../en/industry";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export const industry: typeof en = {
  module: {
    scopes: {
      jobs: "Liest deine Industriejobs (Produktion, Forschung, Kopieren, Erfindung, Reaktionen) und wann sie fertig sind (optional).",
      structures: "Benennt die Spielerstrukturen, in denen deine Industriejobs laufen (optional).",
      jobsLabel: "Zugriff auf Industriejobs",
      structuresLabel: "Zugriff auf Strukturnamen",
    },
    jobs: {
      characterJobs: "Industriejobs",
    },
    permissionGroup: "Industrie",
    permissions: {
      viewOwn: {
        label: "Eigene Industriejobs ansehen",
        description: "Industriejobs deiner eigenen Charaktere mit Fortschritt und Fertigstellungszeit.",
      },
    },
    nav: {
      jobs: "Industriejobs",
    },
  },

  metaTitle: "Industriejobs",
  page: {
    description: "Was deine Charaktere bauen, erforschen, kopieren und erfinden – und wann jeder Job fertig ist.",
    synced: (when: string) => `Aktualisiert ${when}`,
    settings: "Zugriff",
  },

  states: {
    running: { label: "Laufend", hint: "Installiert, pausiert oder bereit zur Auslieferung" },
    finished: { label: "Abgeschlossen", hint: "Ausgeliefert, abgebrochen oder rückgängig gemacht (ESI behält 90 Tage)" },
    all: { label: "Alle", hint: "Jeder Job, den Keystar gesehen hat" },
  },

  activities: {
    manufacturing: "Produktion",
    te_research: "Zeiteffizienz-Forschung",
    me_research: "Materialeffizienz-Forschung",
    copying: "Kopieren",
    invention: "Erfindung",
    reaction: "Reaktionen",
    other: "Sonstiges",
  },
  activityShort: {
    manufacturing: "Bau",
    te_research: "TE",
    me_research: "ME",
    copying: "Kopie",
    invention: "Erfindung",
    reaction: "Reaktion",
    other: "Sonstiges",
  },

  statuses: {
    active: "Läuft",
    paused: "Pausiert",
    ready: "Bereit",
    delivered: "Ausgeliefert",
    cancelled: "Abgebrochen",
    reverted: "Rückgängig",
  },
  phases: {
    running: "Läuft",
    "ending-soon": "Endet bald",
    ready: "Bereit zur Auslieferung",
    paused: "Pausiert",
    finished: "Abgeschlossen",
  },

  filters: {
    state: "Jobs",
    characters: "Charaktere",
    activity: "Tätigkeit",
    system: "System",
    location: "Station",
    reset: "Filter zurücksetzen",
    unknownLocation: (id: number) => `Struktur ${n(id)}`,
  },

  stats: {
    running: "Laufend",
    ready: "Bereit zur Auslieferung",
    endingSoon: "Enden innerhalb von 24 h",
    jobs: "Angezeigte Jobs",
    cost: "Installationskosten",
    costHint: "Gebühren und Anlagensteuern der angezeigten Jobs",
    paused: (count: number) => plural(count, "pausiert", "pausiert"),
    lastEnds: (when: string) => `Der letzte endet ${when}`,
    byActivity: "Nach Tätigkeit",
  },

  table: {
    title: "Jobs",
    character: "Charakter",
    job: "Job",
    productArrow: "→",
    runs: "Durchläufe",
    location: "Ort",
    progress: "Fortschritt",
    ends: "Endet",
    status: "Status",
    cost: "Kosten",
    runsOf: (done: number, runs: number) => `${n(done)} von ${n(runs)}`,
    probability: (pct: string) => `${pct} Chance`,
    pageOf: (page: number, pages: number) => `Seite ${n(page)} von ${n(pages)}`,
    previous: "Zurück",
    next: "Weiter",
    noLocation: "Unbekannte Struktur",
    noLocationHint: "Diese Struktur konnte nicht benannt werden: Der Charakter hat dort keine Andockrechte, oder sie existiert nicht mehr.",
    completedBy: (name: string) => `Ausgeliefert von ${name}`,
    ago: (when: string) => `fertig ${when}`,
  },
  duration: ({ days, hours, minutes }: { days: number; hours: number; minutes: number }) =>
    days > 0 ? `${days}T ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,

  coverage: {
    title: "Abdeckung",
    subtitle: "Welche deiner Charaktere ihre Jobs melden",
    tracked: "Erfasste Charaktere",
    notEnabled: "Industrie-Zugriff aus",
    notEnabledHint: "Schalte den Industrie-Zugriff für diese Charaktere auf der Zugriffsseite ein, um ihre Jobs zu sehen.",
    invalidTokens: "Widerrufene ESI-Token",
    lastSync: "Letzte Aktualisierung",
    note: "ESI führt einen Job als laufend, bis der Installierende das Industriefenster öffnet; Keystar zeigt einen Job, dessen Endzeit vorbei ist, als bereit zur Auslieferung.",
  },

  empty: {
    noCharacters: {
      title: "Keine Charaktere verknüpft",
      body: "Verknüpfe einen Charakter unter Meine Charaktere; seine Industriejobs erscheinen hier nach der ersten Aktualisierung.",
      action: "Meine Charaktere",
    },
    notEnabled: {
      title: "Industrie-Zugriff ist aus",
      body: "Wähle auf der Zugriffsseite, welche deiner Charaktere ihre Industriejobs mit Keystar teilen. Jobs erscheinen wenige Minuten nach dem Einschalten.",
      action: "Industrie-Zugriff einschalten",
    },
    noJobs: {
      title: "Noch keine Industriejobs",
      body: "Keiner deiner Charaktere hat einen Industriejob im Datenbestand. Jobs erscheinen wenige Minuten, nachdem sie im Spiel installiert wurden.",
    },
    filtered: "Kein Job passt zu den Filtern.",
  },

  settings: {
    metaTitle: "Industrie-Zugriff",
    description: "Lege für jeden Charakter fest, ob Keystar seine Industriejobs lesen und die Strukturen benennen darf, in denen sie laufen.",
    title: "Industrie-Zugriff pro Charakter",
    subtitle: "Das Einschalten autorisiert den Charakter bei EVE neu und fügt die beiden Industrie-Scopes hinzu.",
    on: "Eingeschaltet",
    off: "Aus",
    revoked: "Token widerrufen",
    partial: "Teilweise eingeschaltet",
    enable: "Industrie-Zugriff einschalten",
    stop: "Ausschalten",
    reauthorize: "Neu autorisieren",
    demo: "Im Demo-Modus nicht verfügbar",
    lastSync: (when: string) => `Letzte Aktualisierung ${when}`,
    firstSync: "Die erste Aktualisierung läuft in wenigen Minuten.",
    nothing: "Nichts gespeichert.",
    kept: "Industriejobs von früher sind noch gespeichert.",
    deleteData: "Industriedaten löschen",
    deleteDataHint: "Entfernt die gespeicherten Industriejobs dieses Charakters aus Keystar.",
    accessLabel: "Industrie-Zugriff",
    toast: {
      deleted: (name: string) => `Gespeicherte Industriejobs von ${name} gelöscht`,
      failed: (name: string) => `Die Industriejobs von ${name} konnten nicht gelöscht werden`,
      errors: {
        forbidden: "Du hast keinen Zugriff mehr auf Industriejobs in Keystar.",
        notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
        stillEnabled: "Schalte zuerst den Industrie-Zugriff für diesen Charakter aus.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    notes: {
      scopes: "Keystar liest die Industriejobs des Charakters alle fünf Minuten und benennt die Stationen und Strukturen, in denen sie laufen; Strukturen nur dort, wo der Charakter andocken darf. Nur du siehst die Jobs deiner Charaktere.",
      stop: "Das Ausschalten beendet das Lesen in Keystar sofort; gespeicherte Jobs bleiben, bis du sie löschst. Autorisiere den Charakter unter Meine Charaktere neu, um die Scopes auch aus seinem EVE-Token zu entfernen.",
    },
  },
};
