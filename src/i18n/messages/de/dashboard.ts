import type { dashboard as en } from "../en/dashboard";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const dashboard: typeof en = {
  metaTitle: "Dashboard",
  header: {
    eyebrow: "Übersicht",
    welcome: (name: string) => `Willkommen zurück, ${name}`,
    fallbackName: "Kapselpilot",
    description: "Das hat deine Corporation in den letzten 30 Tagen gemacht.",
  },
  info: {
    homeCorp: "Heimat-Corporation",
    notConfigured: "Nicht eingerichtet",
    registered: "Registrierte Charaktere",
    registeredOfMembers: (registered: number, members: number) => `${n(registered)} von ${n(members)} Mitgliedern`,
    registeredOnly: (registered: number) => `${n(registered)} registriert`,
    esiAccess: "Dein ESI-Zugriff",
    esiComplete: (healthy: number, total: number) =>
      `${n(healthy)} von ${n(total)} ${total === 1 ? "Charakter" : "Charakteren"} vollständig`,
    syncWorker: "Sync-Worker",
    workerOnline: "Online",
    workerOffline: "Kein Lebenszeichen",
  },
  tiles: {
    kills: "Kills · 30 Tage",
    losses: (count: number) => `${n(count)} ${count === 1 ? "Verlust" : "Verluste"}`,
    activePilots: (count: number) => `${n(count)} ${count === 1 ? "aktiver Pilot" : "aktive Piloten"}`,
    iskDestroyed: "ISK zerstört · 30 Tage",
    efficiency: "ISK-Effizienz · 30 Tage",
    points: (value: number) => `${FORMATTERS.de.number(value, 1)} Pkt.`,
    iskLost: (isk: string) => `${isk} ISK verloren`,
    corpMining: "Corporation-Mining · 30 Tage",
    ownMining: "Dein Mining · 30 Tage",
    characters: "Deine Charaktere",
    esiComplete: "ESI vollständig",
    needAttention: (count: number) => `${n(count)} mit Handlungsbedarf`,
    backgroundSync: "Hintergrund-Sync",
    jobs: (count: number) => `${n(count)} ${count === 1 ? "Job" : "Jobs"}`,
    failing: (count: number) => `${n(count)} fehlerhaft`,
    healthy: "Fehlerfrei",
    awaitingApproval: "Warten auf Freischaltung",
  },
  prior: {
    period: "Vorperiode",
    suffix: "ggü. Vorperiode",
    empty: "Keine Daten für die Vorperiode",
  },
  panels: {
    killsChart: "Kills im Zeitverlauf · letzte 30 Tage",
    killsChartSubtitle: "Kills und Verluste pro Tag",
    recent: "Neueste Kills und Verluste",
    recentSubtitle: "Öffnet sich auf zKillboard",
    corpMining: "Corporation-Mining · letzte 30 Tage",
    ownMining: "Dein Mining · letzte 30 Tage",
    miningSubtitle: "ISK pro Tag nach Rohstoff",
    miningOverview: "Mining-Übersicht",
    gettingStarted: "Erste Schritte",
    gettingStartedBody:
      "Verknüpfe deine Charaktere und erteile ESI-Zugriff, während ein Direktor dein Konto freischaltet.",
    manageCharacters: "Charaktere verwalten",
    mvp: "MVP · letzte 30 Tage",
    allPilots: "Alle Piloten",
    syncFailing: (count: number) => `${n(count)} ${count === 1 ? "Sync-Job" : "Sync-Jobs"} fehlerhaft`,
    syncStatus: "Sync-Status",
    characters: "Deine Charaktere",
    manage: "Verwalten",
    tokenRevoked: "Widerrufen",
    tokenScopes: "Scopes",
  },
  roadmap: {
    title: "Geplant",
    items: {
      skills: { title: "Skillpläne", text: "Skillpläne der Corp und wer was fliegen kann." },
      assets: { title: "Assets", text: "Gegenstände bei Mitgliedern und in Corp-Hangars finden." },
      wallets: { title: "Wallets", text: "Corporation-Divisionen und persönliche Wallets." },
    },
  },
};
