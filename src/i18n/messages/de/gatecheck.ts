import { FORMATTERS } from "@/lib/format";
import type { gatecheck as en } from "../en/gatecheck";

const f = FORMATTERS.de;
const n = f.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;
const list = (items: string[]) => new Intl.ListFormat("de-DE", { type: "conjunction" }).format(items);

export const gatecheck: typeof en = {
  module: {
    navItem: "Gate-Check",
    permissionGroup: "Gate-Check",
    help: "Plane eine Stargate-Route (kürzeste, sicherere oder weniger sichere) und sieh die Kills an den Toren entlang der Route, live aus dem Feed von zKillboard: Camps, Smartbombs, Interdictoren und Ganker, Tor für Tor. Schätzt, wie wahrscheinlich ein Camp ist, wenn du an jedes Tor kommst – aus den Kills an diesen Toren der letzten Wochen und den Stamm-Campern, die gerade unterwegs sind.",
    permissions: {
      use: {
        label: "Gate-Check nutzen",
        description: "Routen planen und Kills und Camp-Schätzungen entlang der Route sehen.",
      },
    },
    jobs: { housekeeping: "Gate-Check aufräumen" },
  },
  page: {
    title: "Gate-Check",
    description: "Kills an den Toren entlang einer Route, live, und wie wahrscheinlich ein Camp ist, wenn du dort ankommst.",
  },
  form: {
    from: "Von",
    to: "Nach",
    fromPlaceholder: "Startsystem",
    toPlaceholder: "Ziel",
    swap: "Start und Ziel tauschen",
    preference: "Route",
    preferences: {
      shortest: "Kürzeste",
      safer: "Sicherer",
      insecure: "Weniger sicher",
    },
    preferenceHints: {
      shortest: "Möglichst wenige Sprünge, egal welche Sicherheit.",
      safer: "Bleibt im Highsec, solange es einen Weg gibt – wie der Autopilot „Sicherer“ in EVE.",
      insecure: "Zieht Lowsec dem Highsec vor – wie der Autopilot „Weniger sicher“ in EVE.",
    },
    avoid: "Meiden",
    avoidPlaceholder: "Systeme, mit Kommas getrennt",
    submit: "Route prüfen",
  },
  errors: {
    unknownFrom: (name: string) => `„${name}“ ist kein System im bekannten Weltraum mit Stargates.`,
    unknownTo: (name: string) => `„${name}“ ist kein System im bekannten Weltraum mit Stargates.`,
    unknownAvoid: (names: string[]) => `Nicht gefunden, nicht gemieden: ${list(names)}.`,
    noRoute: "Zwischen diesen Systemen gibt es keine Stargate-Route (ohne die gemiedenen Systeme).",
  },
  empty: {
    title: "Wohin geht's?",
    body: "Gib Start und Ziel ein. Keystar plant die Route und prüft jedes Tor darauf gegen die Kills, die zKillboard gesehen hat.",
  },
  feed: {
    fresh: (ago: string) => `Live: Feed von zKillboard ${ago} gelesen`,
    delayed: (ago: string) => `Verzögert: Feed von zKillboard zuletzt ${ago} gelesen. Die neuesten Kills können fehlen.`,
    offline: "Offline: Keystar liest den Feed von zKillboard nicht (läuft der Worker?). „Keine Kills“ heißt gerade gar nichts.",
    never: "Noch keine Kills: Keystar liest den Feed von zKillboard, sobald der Worker läuft.",
    coverage: (since: string) => `Jeder Kill seit ${since}`,
    history: (days: number) => `Camp-Verlauf: ${count(days, "Tag", "Tage")}`,
    delay:
      "Kills kommen Minuten bis eine halbe Stunde nach dem Geschehen bei zKillboard an; das neueste Camp ist vielleicht noch nicht zu sehen.",
  },
  summary: {
    jumps: (value: number) => count(value, "Sprung", "Sprünge"),
    mix: (high: number, low: number, nul: number) => `${n(high)} High · ${n(low)} Low · ${n(nul)} Null`,
    arrival: "Ankunft ≈",
    hotspots: "Vorsicht",
    noHotspots:
      "Keine Kills an den Toren der Route in den letzten zwei Stunden und keine wahrscheinlichen Camps. Bleib trotzdem wachsam: Camps, die nichts erwischen, hinterlassen keine Spuren.",
    route: "Route",
    avoid: "Meiden",
    avoidTitle: (system: string) => `Route um ${system} herum planen`,
    avoiding: (names: string[]) => `Meidet ${list(names)}`,
    eta: "ET",
  },
  status: {
    camp: "Camp",
    recent: "Kills am Tor",
    activity: "Kills im System",
    quiet: "Ruhig",
    unknown: "Unbekannt",
  },
  statusHint: {
    camp: "Ein Spieler-Kill an einem deiner Tore in den letzten 30 Minuten oder drei innerhalb einer Stunde.",
    recent: (hours: number) => `Spieler-Kills an einem deiner Tore in den letzten ${count(hours, "Stunde", "Stunden")}.`,
    activity: "Spieler-Kills anderswo im System: an anderen Toren oder abseits der Tore.",
    quiet: "Keine Kills in den letzten zwei Stunden.",
    unknown: "Keine Kills gefunden, aber der Feed hängt hinterher – das heißt wenig.",
  },
  place: {
    entry: (system: string) => `am Tor von ${system}`,
    exit: (system: string) => `am Tor nach ${system}`,
    gate: (system: string) => `am Tor nach ${system} (nicht auf deiner Route)`,
    elsewhere: "abseits der Tore",
  },
  tags: {
    smartbomb: "Smartbombs",
    interdictor: "Interdictor",
    hic: "HIC",
    gank: "Ganker",
    hotdrop: "Hot Drop",
    pod: "Pods gekillt",
  },
  tagHints: {
    smartbomb: "Smartbombs haben Schaden gemacht: Schnelle Schiffe und Pods sterben, bevor sie alignen können.",
    interdictor: "Ein Interdictor war am Kill beteiligt: Warp-Störblasen im Nullsec.",
    hic: "Ein Heavy Interdiction Cruiser war am Kill beteiligt: Blasen im Nullsec, ein unbrechbarer Point überall.",
    gank: "CONCORD war auf der Killmail: An diesem Tor arbeiten Suicide-Ganker.",
    hotdrop: "Black Ops, Capitals oder Supercapitals waren am Kill beteiligt.",
    pod: "Das Camp killt auch Pods.",
  },
  kill: {
    attackers: (value: number) => count(value, "Angreifer", "Angreifer"),
    distance: (km: string) => `${km} km vom Tor`,
    onZkill: "Auf zKillboard öffnen",
    npc: "Nur NPCs",
    gankLoss: "Ganker von CONCORD erledigt",
    by: "von",
    more: (value: number) => `und ${count(value, "weiterer Kill", "weitere Kills")}`,
    otherKills: (value: number) => count(value, "Kill anderswo im System", "Kills anderswo im System"),
    npcKills: (value: number) => count(value, "Kill durch NPCs", "Kills durch NPCs"),
  },
  prediction: {
    title: "Camp-Schätzung",
    level: {
      low: "Niedrig",
      moderate: "Mittel",
      high: "Hoch",
      severe: "Sehr hoch",
    },
    chance: (pct: string) => `${pct} Wahrscheinlichkeit`,
    confidence: {
      none: "Noch zu wenig Verlauf (unter 3 Tagen): Die Schätzung nutzt nur, was gerade passiert.",
      limited: (days: number) => `Aus ${count(days, "Tag", "Tagen")} Verlauf: noch grob.`,
      good: (days: number) => `Aus ${count(days, "Tag", "Tagen")} Verlauf.`,
    },
    history: (active: number, days: number) =>
      `Kills an diesen Toren um diese Tageszeit an ${n(active)} der letzten ${count(days, "Tag", "Tage")}`,
    campDays: (value: number, days: number) => `Kills an diesen Toren an ${n(value)} von ${count(days, "Tag", "Tagen")}`,
    live: (ago: string) => `Letzter Kill an einem Routentor ${ago}`,
    regulars: (value: number) => `${count(value, "Stamm-Camper", "Stamm-Camper")} in den letzten zwei Stunden in der Nähe gesehen`,
    quietHistory: "Keine Kills an diesen Toren im Verlauf.",
    hourly: "Kills an diesen Toren nach Stunde (EVE-Zeit); markiert ist die Stunde deiner Ankunft.",
    regularsTitle: "Stammgäste an diesen Toren",
    regular: (days: number, kills: number) => `${count(days, "Tag", "Tage")}, ${count(kills, "Kill", "Kills")}`,
    regularHours: (hours: string) => `meist ${hours}`,
    nearEta: "Um deine Ankunftszeit aktiv",
    lastSeen: (ago: string) => `zuletzt dort ${ago}`,
    sighting: (system: string, jumps: number, ago: string) =>
      jumps === 0 ? `Kill in ${system} ${ago}` : `Kill in ${system} (${count(jumps, "Sprung", "Sprünge")} entfernt) ${ago}`,
    groupsTitle: "Hinter den meisten Kills",
    tagHistory: "An diesen Toren gesehen",
    factors: "Verlauf · live · Stammgäste",
    disclaimer:
      "Eine Schätzung aus öffentlichen Killmails, keine Vorhersage. Sie kennt nur Camps, die etwas gekillt haben; ein gerade entstandenes oder wartendes Camp sieht sie nicht.",
  },
  hint: "Die Kills stammen aus dem Live-Feed von zKillboard, den Keystar ohnehin für das Killboard liest: Eine Routenprüfung kostet zKillboard nichts. Ein Kill innerhalb von 150 km eines Stargates zählt als Kill an diesem Tor. Nur Tore: keine Wurmlöcher, Ansiblex-Sprungbrücken oder Filamente; durch Zarzakh führt keine Route (Torsperre).",
};
