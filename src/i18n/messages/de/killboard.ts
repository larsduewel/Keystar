import type { killboard as en } from "../en/killboard";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;

export const killboard: typeof en = {
  module: {
    navSection: "Kampf",
    nav: { killboard: "Killboard" },
    alerts: { kills: { label: "Kills und Verluste", hint: "Wenn ein Corp-Mitglied einen Kill hat oder ein Schiff verliert" } },
    permissionGroup: "Killboard",
    permissions: {
      view: {
        label: "Killboard ansehen",
        description: "Kills, Verluste, Schiffs- und Pilotenstatistiken der Corporation sowie den Lagebericht sehen.",
      },
      manage: { label: "Killboard verwalten", description: "Den wöchentlichen Lagebericht neu schreiben lassen." },
    },
    jobs: {
      zkillSync: "Killboard (zKillboard)",
      liveFeed: "Killboard-Live-Feed (zKillboard)",
      situationReport: "Killboard-Lagebericht",
    },
  },
  terms: {
    kills: "Kills",
    losses: "Verluste",
    destroyed: "Zerstört",
    lost: "Verloren",
    netIsk: "Netto-ISK",
    finalBlows: "Final Blows",
    solo: "Solo",
    iskDestroyed: "ISK zerstört",
    iskLost: "ISK verloren",
    iskEfficiency: "ISK-Effizienz",
  },
  fallback: {
    corporation: (id) => `Corporation ${id}`,
    character: (id) => `Charakter ${id}`,
    type: (id) => `Typ ${id}`,
    system: "Unbekanntes System",
  },
  page: {
    metaTitle: "Killboard",
    description: (corp) => `${corp} · Kampfleistung laut zKillboard`,
    noCorp: {
      title: "Keine Heimat-Corporation festgelegt",
      body: "Das Killboard verfolgt die Kills und Verluste der Heimat-Corporation auf zKillboard. Ein Admin kann sie unter Admin → Einstellungen festlegen.",
    },
    importing: {
      title: "Import von zKillboard läuft",
      body: (corp) =>
        `Der Worker importiert die Killmails von ${corp} aus den letzten 90 Tagen von zKillboard und prüft danach stündlich.`,
    },
    empty: {
      title: "Noch keine Kills oder Verluste",
      body: (corp) =>
        `zKillboard hat keine Killmails für ${corp} aus den letzten 90 Tagen. Neue erscheinen hier innerhalb einer Stunde.`,
    },
    lastError: (error) => `Letzter Fehler: ${error}`,
    footer: ({ synced, since, week, prevWeek }) =>
      `Daten: zKillboard${synced ? `, synchronisiert ${synced}` : ""}${since ? ` · Historie seit ${since}` : ""}. ` +
      "Ein Kill zählt, wenn ein Corporation-Mitglied auf der Killmail steht; ISK-Werte sind Schätzungen von zKillboard " +
      `und zählen für jeden beteiligten Piloten und jedes beteiligte Schiff in voller Höhe. Wochenvergleiche: ${week} gegenüber ${prevWeek}.`,
    lastSyncError: (error) => `Letzter Sync-Fehler: ${error}`,
  },
  stats: {
    totalKills: "Kills gesamt",
    totalLosses: "Verluste gesamt",
    week: (value) => `7 Tage: ${value}`,
    weekInRange: (value, range) => `7 Tage: ${value} · ${range}`,
    vsPrevWeek: "ggü. Vorwoche",
    noPrevWeek: "Keine Daten für die vorigen 7 Tage",
    points: (value) => `${FORMATTERS.de.number(value, 1)} Pkt.`,
  },
  topPilots: {
    title: "Top-Piloten",
    mostKills: (period) => `Meiste Kills · ${period}`,
    mvp: "MVP",
    efficiency: "Effizienz",
    runnerUp: (finalBlows, destroyed) => `${count(finalBlows, "Final Blow", "Final Blows")} · ${destroyed} zerstört`,
    killsUnit: (kills) => (kills === 1 ? "Kill" : "Kills"),
    awards: {
      isk: "Meiste ISK zerstört",
      finalBlows: "Meiste Final Blows",
      solo: "Meiste Solo-Kills",
      efficiency: "Beste Effizienz",
    },
  },
  pilotTable: {
    title: "Piloteneffizienz",
    subtitle: (pilots, ticker) =>
      `${count(pilots, "Pilot ist", "Piloten sind")} in diesem Zeitraum für ${ticker ? `[${ticker}]` : "die Corporation"} geflogen`,
    entity: "Pilot",
  },
  columns: {
    kd: "K/D",
    kdTitle: "Kills / Verluste",
    iskLost: "ISK verloren",
    eff: "Eff.",
    delta7d: "Δ7T",
    killsDeltaTitle: "Kills der letzten 7 Tage ggü. den 7 Tagen davor",
    lossesDeltaTitle: "Verluste der letzten 7 Tage ggü. den 7 Tagen davor",
    killsDelta: "Δ Kills 7T",
    lossesDelta: "Δ Verluste 7T",
  },
  systems: {
    title: { kills: "Top-Systeme nach Kills", losses: "Top-Systeme nach Verlusten" },
    subtitle: (side, value, change) =>
      `7 Tage: ${side === "kills" ? count(value, "Kill", "Kills") : count(value, "Verlust", "Verluste")} (${change} ggü. Vorwoche)`,
    empty: { kills: "Keine Kills in diesem Zeitraum.", losses: "Keine Verluste in diesem Zeitraum." },
    tooltip: ({ system, side, value, isk, week, prevWeek }) =>
      `${system}: ${side === "kills" ? count(value, "Kill", "Kills") : count(value, "Verlust", "Verluste")}, ${isk} ISK. 7 Tage: ${n(week)} (davor ${n(prevWeek)})`,
  },
  breakdown: {
    title: "ISK-Aufschlüsselung",
    kdRatio: "K/D-Verhältnis",
    avgPerKill: "Ø ISK / Kill",
    avgPerLoss: "Ø ISK / Verlust",
    noData: "Keine Daten",
  },
  recent: {
    title: "Letzte Aktivität",
    subtitle: "Die 10 neuesten Kills und Verluste · Klick öffnet zKillboard",
    empty: "Keine Kills oder Verluste in diesem Zeitraum.",
    kind: { kill: "Kill", loss: "Verlust" },
    solo: "solo",
  },
  live: {
    api: { unauthorized: "Nicht angemeldet", forbidden: "Kein Zugriff" },
    region: "Live-Kill-Benachrichtigungen",
    kind: { kill: "Kill", loss: "Verlust" },
    finalBlow: "Final Blow",
    topDamage: "Höchster Schaden",
    killedBy: "Getötet von",
    others: (n: number) => `+${n} weitere`,
    npc: "NPC",
    noPilot: "Kein Pilot",
    open: "Diese Killmail auf zKillboard öffnen",
    dismiss: "Schließen",
  },
  ships: {
    entity: "Schiff",
    effectiveTitle: "Effektivste Schiffe",
    effectiveSubtitle: "Nach Netto-ISK: mit dem Schiff zerstörter Wert minus darin verlorener Wert",
    usedTitle: "Meistgeflogene Schiffe",
    usedSubtitle: "Schiffe, mit denen Kills erzielt wurden",
    lostTitle: "Meistverlorene Schiffe",
    lostSubtitle: "Verlorene Schiffe",
  },
  chart: {
    legend: "Legende",
    view: "Diagramm oder Tabelle",
    chart: "Diagramm",
    table: "Tabelle",
    date: "Datum",
  },
  report: {
    title: "Lagebericht",
    readiness: "Bereitschaft",
    pending: "Der erste Bericht entsteht, sobald eine volle Woche an Killmails importiert ist (kurz nach 02:00 EVE-Zeit).",
    byClaude: (model) => `Geschrieben von Claude (${model ?? "unbekanntes Modell"})`,
    byTemplate: "Aus den Wochenzahlen erstellt",
    claudeFailed: (error) => `Claude fehlgeschlagen: ${error}`,
    claudeHint: "Setze ANTHROPIC_API_KEY auf dem Server, damit Claude diese Berichte schreibt.",
    rewrite: "Bericht neu schreiben",
    rewriting: "Wird geschrieben …",
  },
};
