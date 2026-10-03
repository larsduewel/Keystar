import type { intel as en } from "../en/intel";
import type { HullClass } from "@/modules/intel/hulls";
import { hourRange } from "@/modules/intel/text";
import type { GangSize, TagLabel, Tier, TimeZone } from "@/modules/intel/types";
import { FORMATTERS } from "@/lib/format";

const f = FORMATTERS.de;
const n = f.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;
const pct = (share: number) => f.percent(share, 0);
const ago = (iso: string, now: Date) => f.relativeTime(iso, now);
const list = (items: string[]) => new Intl.ListFormat("de-DE", { type: "conjunction" }).format(items);

type ThreatLevel = keyof typeof en.threatLevels;
type Role = keyof typeof en.roles;

const TIERS: Record<Tier | "unknown", string> = {
  low: "Niedrig",
  moderate: "Mittel",
  high: "Hoch",
  extreme: "Extrem",
  unknown: "Unbekannt",
};

const HULL_CLASSES: Record<HullClass, string> = {
  tackle: "Tackle",
  hunter: "Covert Ops / Bomber",
  recon: "Recon",
  logistics: "Logistik",
  frigate: "Fregatte",
  destroyer: "Zerstörer",
  cruiser: "Kreuzer",
  battlecruiser: "Schlachtkreuzer",
  battleship: "Schlachtschiff",
  capital: "Capital",
  supercapital: "Supercapital",
  blackOps: "Black Ops",
  industrial: "Industrieschiff",
  command: "Command Ship",
  pod: "Kapsel / Shuttle",
  other: "Sonstige",
};

const TIME_ZONES: Record<TimeZone, string> = { eu: "EU", use: "US-Ost", usw: "US-West", au: "AU", ru: "RU" };

const TAGS: Record<TagLabel, string> = {
  cyno: "Cyno",
  covertCyno: "Covert-Cyno",
  capital: "Capital",
  supercapital: "Supercapital",
  blops: "Black Ops",
  hunter: "Hunter",
  tackle: "Tackle",
  gatecamper: "Gatecamper",
  ganker: "Ganker",
  logi: "Logi",
  fc: "FC",
  solo: "Solo",
  blob: "Blob",
  newchar: "Neuer Charakter",
  npcalt: "NPC-Corp",
  activenow: "Gerade aktiv",
};

const historic = (label: string) => `${label} (früher)`;
const tagWord = (tag: { label: TagLabel; historic: boolean }) => (tag.historic ? historic(TAGS[tag.label]) : TAGS[tag.label]);

const GANG: Record<GangSize, string> = {
  solo: "solo",
  small: "Small Gang (2–9)",
  fleet: "Flotten (10–24)",
  blob: "Blobs (25+)",
};

const THREAT_LEVELS: Record<ThreatLevel, string> = {
  minimal: "Minimale Bedrohung",
  low: "Geringe Bedrohung",
  elevated: "Erhöhte Bedrohung",
  high: "Hohe Bedrohung",
  critical: "Kritische Bedrohung",
};

const ROLES: Record<Role, (value: number) => string> = {
  cyno: (value) => `${n(value)} Cyno`,
  capital: (value) => `${n(value)} Capital`,
  logi: (value) => `${n(value)} Logi`,
  tackle: (value) => `${n(value)} Tackle`,
  hunter: (value) => `${n(value)} Hunter`,
};

const VIA = { character: "Charakter", corporation: "Corporation", alliance: "Allianz", faction: "Fraktion" } as const;

export const intel: typeof en = {
  module: {
    navItem: "Bedrohungsanalyse",
    permissionGroup: "Bedrohungsanalyse",
    permissions: {
      use: {
        label: "Bedrohungsanalyse nutzen",
        description: "Pilotenlisten scannen, geteilte Scans öffnen und die zuletzt gesehenen Feinde sehen.",
      },
      ai: {
        label: "Claude für die Analyse nutzen",
        description: "Claude Lagebilder, Pilotendossiers und D-Scan-Auswertungen schreiben lassen (nutzt den API-Schlüssel der Instanz).",
      },
      manage: { label: "Bedrohungsanalyse verwalten", description: "Beliebige Scans löschen." },
    },
    scopes: {
      corporationContacts: "Liest die Kontakte der Corporation, damit Scans Blues und Reds zeigen.",
      allianceContacts: "Liest die Kontakte der Allianz, damit Scans Blues und Reds zeigen.",
    },
    jobs: {
      scanWorker: "Bedrohungsanalyse (zKillboard)",
      briefings: "Bedrohungsanalyse: Lagebilder",
      housekeeping: "Bedrohungsanalyse: Aufräumen",
      corporationContacts: "Corporation-Kontakte (Standings)",
      allianceContacts: "Allianz-Kontakte (Standings)",
    },
  },
  tiers: TIERS,
  hullClasses: HULL_CLASSES,
  timeZones: TIME_ZONES,
  tags: TAGS,
  historic,
  dimensions: {
    activity: "Aktivität",
    lethality: "Gefährlichkeit",
    style: "Kampfstil",
    specialty: "Spezialisierung",
    relevance: "In der Nähe",
    history: "Historie mit uns",
    timezone: "Gerade aktiv",
    character: "Charakter",
  },
  threatLevels: THREAT_LEVELS,
  confidence: { low: "niedrig", medium: "mittel", high: "hoch" },
  matchConfidence: { likely: "wahrscheinlich", possible: "möglich", guess: "geraten" },
  roles: ROLES,
  standings: {
    labels: {
      own: "Freund",
      blue: "Blau",
      lightblue: "Hellblau",
      neutral: "Neutral",
      orange: "Orange",
      red: "Rot",
    },
    own: "Deine Corporation oder Allianz",
    contact: (source, via) => `Kontakt der ${source === "alliance" ? "Allianz" : "Corporation"}${via ? ` (über ${VIA[via]})` : ""}`,
  },

  reasons: {
    activityRecent: (r, now) =>
      `${count(r.kills7d, "Kill", "Kills")} in 7 Tagen, ${n(r.kills30d)} in 30${r.lastKillAt ? `; zuletzt ${ago(r.lastKillAt, now)}` : ""}`,
    activityWeek: (r) => `${count(r.kills7d, "Kill", "Kills")} in den letzten 7 Tagen (zKillboard)`,
    activityQuiet: (r) =>
      `Keine Kills ${r.days === 30 ? "in 30 Tagen" : "diese Woche"}${r.lastActiveMonth ? `; zuletzt aktiv ${r.lastActiveMonth}` : ""}`,
    lethality: (r) =>
      `${r.killShare === null ? "Keine Kämpfe in letzter Zeit" : `${pct(r.killShare)} Kills ggü. Verlusten`}, ${f.isk(r.iskDestroyed)} zerstört (nach Aktualität gewichtet)` +
      (r.finalBlowShare !== null ? `, Final Blow bei ${pct(r.finalBlowShare)}` : ""),
    style: (r) => `Meist ${GANG[r.gang]} (${pct(r.share)})`,
    styleUnknown: () => "Keine neueren Kills zum Einschätzen",
    specialty: (r) => r.tags.map(tagWord).join(", "),
    specialtyNone: () => "Keine besonderen Rollen gesehen",
    relevance: (r) => `${count(r.here, "Killmail", "Killmails")} in diesem System und ${n(r.nearby)} in der Nähe in 30 Tagen`,
    relevanceBefore: () => "Früher schon in dieser Gegend gesehen",
    relevanceNone: () => "Keine Aktivität in dieser Gegend",
    relevanceNoSystem: () => "Kein aktuelles System angegeben",
    history: (r, now) =>
      `Bei ${n(r.killsOnUs)} unserer Verluste dabei, ${n(r.lossesToUs)} an uns verloren${r.lastAt ? `; zuletzt ${ago(r.lastAt, now)}` : ""}`,
    historyNone: () => "Hat nie gegen uns gekämpft (laut unserem Killboard)",
    historyNoHome: () => "Keine Heimat-Corporation festgelegt",
    timezone: (r) => {
      const peak = hourRange(r.peakHours);
      return `${pct(r.share)} der Aktivität rund um die aktuelle Uhrzeit (±1 Std.)${peak ? `; Spitze ${peak} EVE` : ""}${r.zone ? ` (${TIME_ZONES[r.zone]})` : ""}`;
    },
    timezoneUnknown: () => "Zu wenig Aktivität für eine Aussage",
    character: (r) =>
      [
        r.ageDays === null ? null : r.ageDays < 30 ? `${count(r.ageDays, "Tag", "Tage")} alt` : `${count(Math.round(r.ageDays / 30), "Monat", "Monate")} alt`,
        r.corpHops ? `${count(r.corpHops, "Corporation-Wechsel", "Corporation-Wechsel")} dieses Jahr` : null,
        r.npcCorp ? "NPC-Corporation" : null,
        r.securityStatus === null ? null : `Sicherheitsstatus ${f.number(r.securityStatus, 1)}`,
      ]
        .filter(Boolean)
        .join(", "),
    characterNormal: () => "Nichts Auffälliges",
    cynoFits: (r, now) => `Cyno auf ${count(r.count, "verlorenem Schiff", "verlorenen Schiffen")}, zuletzt ${ago(r.lastAt, now)}`,
    capitalShare: (r) => `${pct(r.share)} der letzten Aktivität in Capitals`,
    capitalKillmails: (r) => `Auf ${count(r.count, "Capital-Killmail", "Capital-Killmails")} (zKillboard)`,
    blopsShare: (r) => `${pct(r.share)} der letzten Aktivität in Black Ops`,
    blopsKillmails: () => "Black-Ops-Kills auf zKillboard",
    hunterShare: (r) => `${pct(r.share)} der Aktivität in Covert-Ops-, Bomber- oder Recon-Schiffen, meist Small Gang`,
    hunterCloaks: () => "Tarnvorrichtungen auf verlorenen Schiffen, meist Small Gang",
    tackleShare: (r) => `${pct(r.share)} der Aktivität in Interceptors oder Dictors`,
    tackleFits: () => "Scrams oder Bubbles auf verlorenen Schiffen",
    logiShare: (r) => `${pct(r.share)} der Aktivität in Logistikschiffen`,
    gateKills: (r) => `${pct(r.share)} der letzten Kills an Gates, meist in einem System`,
    highsecKills: (r) => `${pct(r.share)} der letzten Kills im Highsec, Sicherheitsstatus ${f.number(r.securityStatus, 1)}`,
    fcRating: (r) => `zKillboard stuft das Flottenkommando als ${r.level === "high" ? "hoch" : "mittel"} ein`,
    soloKills: (r) => `${pct(r.share)} der letzten Kills solo`,
    blobKills: (r) => `${pct(r.share)} der letzten Kills mit 25+ Piloten`,
    newCharacter: (r) => `Vor ${count(r.ageDays, "Tag", "Tagen")} erstellt`,
    npcCorporation: () => "In einer NPC-Corporation",
    activeNow: (r) => `${pct(r.share)} der Aktivität rund um diese Uhrzeit`,
  },

  errors: {
    tooLong: (max) => `Der eingefügte Text ist zu lang (höchstens ${n(max)} Zeichen).`,
    dscanInPilots: "Das sieht nach einem D-Scan aus. Füge ihn ins D-Scan-Feld ein und die Piloten aus Local hier.",
    noNames: "Keine Pilotennamen gefunden. Füge die Local-Mitgliederliste, eine Flottenzusammensetzung oder Namen ein, einen pro Zeile.",
    tooMany: (found, max) => `Die Liste hat ${n(found)} Piloten; scanne höchstens ${n(max)} auf einmal.`,
    rateLimited: "Das sind viele Scans in kurzer Zeit. Gib zKillboard ein paar Minuten.",
    unknownSystem: (name) => `Unbekanntes Sonnensystem „${name}“.`,
    noCharacters: "Keiner dieser Namen ist ein EVE-Charakter.",
    dscanTooLong: "Der D-Scan ist zu lang.",
    notDscan: "Im D-Scan-Feld steht kein D-Scan (kopiere ihn aus dem Richtungsscanner).",
    pasteDscan: "Füge einen D-Scan ein (kopiere ihn aus dem Richtungsscanner).",
    scanGone: "Diesen Scan gibt es nicht mehr.",
  },
  api: {
    unauthorized: "Nicht angemeldet",
    forbidden: "Kein Zugriff",
    notFound: "Nicht gefunden",
  },

  index: {
    metaTitle: "Bedrohungsanalyse",
    title: "Bedrohungsanalyse",
    description:
      "Füge Local, eine Flotte oder ein paar Namen ein: wer sie sind, ob wir schon gegen sie gekämpft haben und wie gefährlich sie gerade sind, laut zKillboard.",
    scanTitle: "Piloten scannen",
    recentTitle: "Deine letzten Scans",
    noScans: "Noch keine Scans.",
    moreNames: (more) => `+${n(more)}`,
    feedTitle: "Zuletzt gesehene Feinde",
    feedSubtitle: (days) => `Piloten aus den Scans aller Mitglieder der letzten ${n(days)} Tage, neueste zuerst. Freunde sind ausgeblendet.`,
  },
  form: {
    pilots: "Piloten",
    placeholder:
      "Füge die Local-Mitgliederliste ein (in der Mitgliederliste alles markieren, Strg+C),\neine Flottenzusammensetzung, Chatzeilen oder Namen, einen pro Zeile:\n\nPilot Eins\nPilot Zwei\nNoch ein Pilot",
    addDscan: "D-Scan hinzufügen (optional)",
    dscan: "D-Scan",
    dscanPlaceholder: "Füge den Richtungsscanner ein (alles markieren, Strg+C). Keystar ordnet die Schiffe den Piloten oben zu.",
    system: "Aktuelles System",
    systemPlaceholder: "optional, z. B. Amamake",
    submit: "Piloten scannen",
    submitting: "Wird gescannt …",
    hint:
      "Corporations, Standings und Kämpfe mit uns erscheinen sofort. Bedrohungswerte folgen von zKillboard, sobald der Worker " +
      "die Piloten liest (etwa eine Sekunde pro Pilot, wichtigste zuerst); danach kommen die letzten Kills. Mit dem aktuellen " +
      "System zählen Kills in der Nähe stärker.",
  },
  buttons: {
    briefing: "Briefing",
    closeBriefing: "Briefing schließen",
    profileMore: (more) => `${n(more)} weitere analysieren`,
    queuing: "Wird eingereiht …",
    confirmDelete: "Diesen Scan für alle löschen?",
    delete: "Löschen",
    deleting: "Wird gelöscht …",
    rewriteBriefing: "Lagebild neu schreiben",
    writeDossier: "Dossier schreiben",
    writeAgain: "Neu schreiben",
    writing: "Wird geschrieben …",
    matchDscan: "D-Scan zuordnen",
    replaceDscan: "D-Scan ersetzen",
    matching: "Wird zugeordnet …",
    askClaude: "Claude fragen",
    summarize: "Zusammenfassen",
    reading: "Wird ausgewertet …",
  },
  progress: {
    stats: (pilots) => `Lese zKillboard-Statistiken: noch ${count(pilots, "Pilot", "Piloten")}`,
    newest: (pilots) => `Lese letzte Kills: noch ${count(pilots, "Pilot", "Piloten")}`,
    deeper: (pilots) => `Lese ältere Kills für ${count(pilots, "aktiven Piloten", "aktive Piloten")}`,
  },
  scan: {
    metaTitle: "Bedrohungsanalyse-Scan",
    title: (pilots, system) => `${count(pilots, "Pilot", "Piloten")}${system ? ` in ${system}` : ""}`,
    description: (ago, at, by) => `Gescannt ${ago} (${at})${by ? ` von ${by}` : ""}`,
    newScan: "Neuer Scan",
    pilots: "Piloten",
    foughtUs: "Gegen uns gekämpft",
    engagements: (value) => count(value, "Gefecht", "Gefechte"),
    noFights: "Keine Kämpfe auf unserem Killboard",
    groupTitle: "Historisches Schiffsprofil & Verbindungen",
    nonFriendly: (pilots) => count(pilots, "nicht befreundeter Pilot", "nicht befreundete Piloten"),
    notCharacters: (names, more) => `Keine EVE-Charaktere: ${names}${more > 0 ? ` und ${n(more)} weitere` : ""}`,
    pilotsTitle: "Piloten",
    allFriendly: "Alle hier sind Freunde.",
    friendlyPilots: (pilots) => count(pilots, "befreundeter Pilot", "befreundete Piloten"),
    historyTitle: "Historie mit uns",
    historySubtitle: (p) =>
      `Gegen ${n(p.pilots)} dieser Piloten in ${count(p.engagements, "Gefecht", "Gefechten")} gekämpft: ${n(p.ourKills)} zerstört ` +
      `(${p.iskKilled} ISK), ${n(p.ourLosses)} verloren (${p.iskLost} ISK). Neueste zuerst, laut unserem Killboard.`,
    olderEngagements: (value) => count(value, "älteres Gefecht", "ältere Gefechte"),
    noHome: "Lege die Heimat-Corporation in den Einstellungen fest, um Kämpfe mit diesen Piloten zu sehen.",
    shareTitle: "Teilen",
    shareHint: "Alle in der Corporation, die die Bedrohungsanalyse nutzen dürfen, können diesen Scan öffnen.",
    pasteDscan: "D-Scan einfügen",
    replaceDscan: "D-Scan ersetzen",
    templateHint: "Lagebilder kommen aus einer Vorlage. Setze ANTHROPIC_API_KEY, damit Claude sie schreibt.",
  },
  evidence: {
    situation: "Lage im Local",
    snapshotHint: "Anwesenheit in der eingefügten Momentaufnahme. Kämpfe und Ausrüstung sind historische Belege.",
    interest: "Piloten zur Prüfung",
    newest: "Letzter Kampfbeleg",
    lastKill: "Letzter bekannter Kill",
    lastLoss: "Letzter bekannter Verlust",
    cyno: "Cyno-Ausrüstungshistorie",
    association: "Historische Mitstreiter",
    unknown: "Unbekannt",
    noEvent: "Kein Eintrag in den geladenen Daten",
    noCyno: "Kein ausgerüstetes Cyno in den erfassten Verlusten gefunden",
    unknownCyno: "Unbekannt — Verlustausrüstung noch nicht geladen",
    cynoTagCaution: "Nur ausgerüstete Module in erfassten Verlusten. Cyno-Aktivierung und Kampfzuordnung unbekannt. Gezählt werden Ausrüstungsbelege, keine geöffneten Cynos.",
    ourTeam: "Unsere Schiffe",
    theirTeam: "Ihre Schiffe",
    shipsLost: (count: number) => `${count} verloren`,
    battleCoverage: "Nur erfasste Schiffe; nicht erfasste Teilnehmer und deren ISK sind unbekannt.",
    engagementPages: "Gefechtsseiten",
    engagementPage: "Gefecht",
    engagementWithUs: "Gefecht mit uns",
    allianceLegend: "Allianzen / Unternehmen",
    noAlliance: "Keine Allianz / Zugehörigkeit unbekannt",
    cynoTagLegend: "Cyno-Symbol: Ausrüstungshistorie. Aktivierung und Kampfzuordnung unbekannt.",
    cynoHint: "Nur erfasste Verluste; keine garantierte Abdeckung von 365 Tagen. Aktuelle Ausrüstung unbekannt.",
    snapshot: "Local-Momentaufnahme",
    notProvided: "Nicht bereitgestellt",
    groups: "Kürzlich beobachtete Gruppe",
    groupsHint: "Gemeinsame Killmails der letzten 2 Stunden; ersatzweise bis zu 6 Stunden. Nur nicht befreundete Piloten dieser Local-Momentaufnahme werden gezeigt.",
    noGroup: "Keine gemeinsame aktuelle Killmail in den geladenen Profilen gefunden. Eine aktuelle Gruppenrekonstruktion ist nicht verfügbar.",
    groupBrief: "Historischer gemeinsamer Angriff; aktuelle Flotte unbekannt.",
    groupCaution: "Historisch beobachtete Mitangreifer, keine aktuelle Flottenzusammensetzung. Vollständige Besetzung, aktuelle Schiffe und Zugehörigkeit der Mitangreifer sind unbekannt. Spätere Verluste können frühere Schiffsbeobachtungen entkräften.",
    recent: "Innerhalb von 2 Stunden",
    fallback: "Ersatzdaten: 2–6 Stunden",
    changed: "Schiff in dieser Stichprobe gewechselt",
    noSafety: "Fehlende Belege bedeuten keine Sicherheit.",
    historyHint: "Historische Einträge aus unserem Killboard.",
    sampleHint: "Neueste verfügbare Einträge der geladenen Stichprobe; Killboards und zwischengespeicherte Profile können unvollständig sein.",
    statsUnknown: "Killboard-Statistikprüfung: unbekannt.",
    recentKills: "Letzte Kills",
    recentLosses: "Letzte Verluste",
    writtenBriefing: "Optionaler Lagebericht — historische Interpretation",
    dscanCaution: "D-Scan ist eine eingefügte Schiffsbeobachtung. Treffer sind Korrelationen mit historischer Schiffsnutzung; sie ordnen keinem Piloten ein aktuelles Schiff zu. Zum Aktualisieren erneut einfügen.",
    associated: (value) => `${count(value, "Pilot", "Piloten")} durch historische gemeinsame Kills verbunden`,
    oldestCheck: (ago, checked, total) => `Älteste Statistikprüfung: ${ago} (${n(checked)}/${count(total, "Pilot", "Piloten")} geprüft)`,
    cynoKinds: { cyno: "Standard", covertCyno: "Verdeckt", industrialCyno: "Industriell" },
    observedHull: (ship) => `Pilot beobachtet in: ${ship}`,
    attackers: (value) => count(value, "erfasster Angreifer", "erfasste Angreifer"),
    fittedLosses: (value) => `${count(value, "ausgerüsteter Verlust", "ausgerüstete Verluste")} in der Stichprobe`,
    associates: (value) => value ? `${count(value, "Pilot", "Piloten")} dieser Momentaufnahme ${value === 1 ? "teilt" : "teilen"} erfasste Kills` : "Keine gemeinsamen Kills gefunden",
    highInterest: (value) => `${n(value)} als hoch / extrem eingestuft`,
    incomplete: (value) => value ? `${count(value, "nicht-freundlichem Profil", "nicht-freundlichen Profilen")} fehlen detaillierte Killmail-Daten` : "Basierend auf geladenen historischen Profilen",
    pasted: (ago) => `Eingefügt ${ago}`,
    tileKill: "Letzter Kill",
    tileLoss: "Letzter Verlust",
    tileCyno: "Cyno-Historie",
    tileNoCyno: "Keine in erfassten Verlusten",
    tileAssociates: "Gemeinsame Local-Piloten",
    latestGroupFight: "Letzter erfasster Kampf",
    destroyedHull: (ship) => `Zerstört: ${ship}`,
    involvedLocalPilots: "Beteiligte Local-Piloten",
    oneVictim: "1 Opfer",
    groupCount: (pilots, kills) => `${count(pilots, "Local-Pilot", "Local-Piloten")} · ${count(kills, "gemeinsame Killmail", "gemeinsame Killmails")}`,
    killmail: (id) => `Killmail ${id}`,
    profileBuilt: (ago) => `Profil erstellt ${ago}.`,
    statsChecked: (ago) => `Killboard-Statistik geprüft ${ago}.`,
  },
  pilot: {
    onOurLosses: (losses) => `bei ${n(losses)} unserer Verluste dabei`,
    diedToUs: (losses) => `${n(losses)}× an uns gestorben`,
    lastFought: (ago) => `Zuletzt ${ago}`,
    notProfiled: "nicht analysiert",
    noHistory: "keine Killboard-Historie",
    zkillUnavailable: "zKillboard nicht erreichbar",
    queued: "in der Warteschlange …",
    corporation: (id) => `Corporation ${id}`,
    alliance: (id) => `Allianz ${id}`,
    unknownCorporation: "Unbekannte Corporation",
    latestTitle: "Letzte Kills und Verluste",
    whyTitle: "Warum diese Bewertung",
    fliesWith: (pilots) => `Teilt historische Kills mit ${pilots} aus dieser Momentaufnahme.`,
    againstUs: "Gegen uns",
    againstUsText: (p) =>
      `Bei ${n(p.killsOnUs)} unserer Verluste dabei (${p.iskOnUs} ISK), ${count(p.lossesToUs, "Schiff", "Schiffe")} an uns verloren (${p.iskToUs} ISK). ` +
      `Erstmals ${p.first}, zuletzt ${p.last}.`,
    unknownHull: "Unbekanntes Schiff",
    fullProfile: "Vollständiges Profil",
  },
  score: {
    sample: "Erfasste Killmails",
    capability: "Kampfstärke",
    relevance: "Lokale Relevanz",
    confidence: "Vertrauen",
    explanation: "Wert /10: 70% Kampfstärke + 30% lokale Relevanz; bei unbekanntem Kontext nur Kampfstärke. Kampfstärke: 45% Aktivität, 30% Kampferfolg, 25% Kampfstil. Flottenbeteiligung und ISK zählen weniger. Kampf-/Lokalbelege halbieren sich nach 14/3 Tagen. Vertrauen berücksichtigt Umfang, Aktualität und Abdeckung. Historische Belege, keine Angriffswahrscheinlichkeit; Eskalation separat.",
    quick: "Schnelle Bewertung aus zKillboard-Statistiken; die letzten Kills werden noch geladen",
    damped: (gate) => `Bewertung auf ${pct(gate)} gedämpft, weil der Pilot zuletzt nicht aktiv war.`,
  },
  latest: {
    chip: (isLoss, ship) => `${ship ?? "Schiff"} ${isLoss ? "verloren" : "zerstört"}`,
    srKind: (isLoss) => (isLoss ? "Verlust: " : "Kill: "),
    title: (p) =>
      `${p.ship ?? "Ein Schiff"} ${p.isLoss ? "verloren" : "zerstört"}${p.system ? ` in ${p.system}` : ""} · ${p.isk} ISK · ${count(p.attackers, "Angreifer", "Angreifer")}`,
    solo: "solo",
    pilots: (pilots) => count(pilots, "Pilot", "Piloten"),
    lastSeen: (isLoss, ship, ago, system) =>
      `Zuletzt gesehen: ${ship ?? "ein Schiff"}${isLoss ? " verloren" : ""}, ${ago}${system ? ` in ${system}` : ""}`,
    recentlyFlying: "Historische Schiffe",
  },
  group: {
    threat: "Bedrohung",
    reds: "Rote Standings",
    likelyFlying: "Historisches Schiffsprofil",
    waiting: "Warte auf die letzten Kills.",
    likelyHint: "Vorherrschende erfasste Schiffsklasse pro Pilot; bevorzugt letzte Woche, sonst ältere Historie. Aktuelle Schiffe unbekannt.",
    flyTogether: "Gemeinsame Kill-Historie",
    clusterPilots: (pilots) => count(pilots, "Pilot", "Piloten"),
    noClusters: "Noch keine gemeinsamen Kills zwischen diesen Piloten.",
    unaffiliated: "ohne Zugehörigkeit",
    groupPilots: (pilots, who) => `${n(pilots)} ${who}`,
  },
  heatmap: {
    none: "Kein Aktivitätsmuster auf zKillboard.",
    label: "Kills nach Wochentag und EVE-Stunde",
    days: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    cell: (day, hour, kills) => `${day} ${hour}:00 EVE: ${count(kills, "Kill", "Kills")}`,
  },
  engagements: {
    system: (id) => `System ${id}`,
    killed: (ships, isk) => `${n(ships)} zerstört · ${isk}`,
    lost: (ships, isk) => `${n(ships)} verloren · ${isk}`,
    brought: "Sie brachten",
    with: (groups) => `Mit ${groups}`,
    fromGroup: (pilots, who) => `${n(pilots)} von ${who}`,
    unknown: "unbekannt",
    battleReport: "Kampfbericht",
    biggestKill: "Größte Killmail",
  },
  notes: {
    briefingTitle: "Lagebild",
    briefingPending: "Das Lagebild entsteht, sobald die letzten Kills der gefährlichsten Piloten geladen sind.",
    noBriefing: "Kein Lagebild für diesen Scan.",
    byClaude: (model) => `Geschrieben von Claude (${model ?? "unbekanntes Modell"})`,
    readByClaude: (model) => `Ausgewertet von Claude (${model ?? "unbekanntes Modell"})`,
    byTemplate: "Aus einer Vorlage erstellt",
    unavailable: (reason) => `Claude nicht verfügbar: ${reason}`,
    instanceBudget: "das stündliche Claude-Budget der Instanz ist aufgebraucht",
    userBudget: (limit) => `du hast diese Stunde ${n(limit)} Claude-Notizen erreicht`,
    dossierTitle: "Dossier",
    confidence: (level) => `Sicherheit: ${level}`,
    dossierHint: "Ein kurzes schriftliches Profil dieses Piloten, aus den Fakten auf dieser Seite.",
    dossierNotAllowed: "Deine Rolle darf keine Dossiers anfordern.",
    dossierTemplateHint: "Ohne ANTHROPIC_API_KEY kommt das Dossier aus einer Vorlage.",
  },
  dscan: {
    add: "D-Scan hinzufügen",
    manage: "D-Scan ansehen / ersetzen",
    title: "D-Scan",
    subtitle: (ships) => `${count(ships, "Schiff", "Schiffe")} im eingefügten Scan; historische Schiffskorrelationen folgen.`,
    empty: "Kein Richtungsscan bereitgestellt. Zum Vergleich beobachteter Schiffe mit historischer Aktivität einfügen.",
    unknown: (ships) => `+${n(ships)} unbekannt`,
    nobody: "Niemand aus dieser Liste ist es zuletzt geflogen",
    noShips: "Keine Schiffe auf diesem D-Scan.",
    placeholder: "Füge den Richtungsscanner ein (alles markieren, Strg+C).",
  },
  feed: {
    none: "In der letzten Woche wurde niemand Feindliches gescannt.",
    seen: (p) =>
      `Gesehen ${p.ago}${p.system ? ` in ${p.system}` : ""}${p.by ? ` von ${p.by}` : ""}${p.times > 1 ? ` · ${n(p.times)} Scans` : ""}${p.fought ? " · hat gegen uns gekämpft" : ""}`,
    hidden: (pilots) => `${count(pilots, "weiterer Pilot", "weitere Piloten")} mit geringer Bedrohung ausgeblendet.`,
  },
  pilotPage: {
    browserPreview: (kills, losses) => `Browser-Vorschau: ${kills} Kills · ${losses} Verluste. Server-Bestätigung steht aus.`,
    metaTitle: "Pilotenprofil",
    back: "Zurück zum Scan",
    noData: (queued) => `Noch keine zKillboard-Daten für diesen Piloten${queued ? " – sie sind unterwegs." : "."}`,
    latestSubtitle: "Neueste zuerst; Klick öffnet zKillboard.",
    noKillmails: "Keine Killmails in letzter Zeit.",
    loading: "Die letzten Killmails werden noch geladen.",
    kills7d: "Kills 7 Tage",
    kills30d: (kills) => `${n(kills)} in 30 Tagen`,
    losses30d: "Verluste 30 Tage",
    losses7d: (losses) => `${n(losses)} in 7 Tagen`,
    lastKill: "Letzter Kill",
    lastActiveMonth: (month) => `Zuletzt aktiv im Monat ${month}`,
    character: "Charakter",
    age: (days) => count(days, "Tag", "Tage"),
    security: (value) => `Sicherheitsstatus ${f.number(value, 1)}`,
    ships: "Schiffe",
    shipsSubtitle: "Nach Aktualität gewichtet, meistgeflogene zuerst.",
    type: (id) => `Typ ${id}`,
    notScored: "Noch nicht bewertet.",
    whenTitle: "Wann sie kämpfen",
    mostlyZone: (zone) => `Meist Zeitzone ${TIME_ZONES[zone]}`,
    fightsTitle: "Kämpfe mit uns",
    fightsSubtitle: "Laut unserem Killboard, neueste zuerst.",
    fliesWithTitle: "Fliegt mit",
    fliesWithSubtitle: "Piloten mit den meisten gemeinsamen Kills (aus diesem Scan fett).",
    shared: (kills) => `${n(kills)} gemeinsam`,
    noWingmen: "Keine regelmäßigen Flügelleute bekannt.",
    pilot: (id) => `Pilot ${id}`,
    corpHistoryTitle: "Corporation-Historie",
    since: (date) => `seit ${date}`,
    notLoaded: "Nicht geladen.",
    lifetimeTitle: "Gesamt (zKillboard)",
    lifetime: (p) =>
      `${count(p.kills, "Kill", "Kills")}, ${count(p.losses, "Verlust", "Verluste")}, ${f.isk(p.iskDestroyed)} zerstört, ${f.isk(p.iskLost)} verloren` +
      (p.danger !== null ? ` · Gefahr ${f.percent(p.danger / 100, 0)}` : "") +
      (p.solo !== null ? ` · solo ${f.percent(p.solo / 100, 0)}` : "") +
      (p.gang ? ` · Ø Gruppe ${f.number(p.gang, p.gang < 10 ? 1 : 0)}` : "") +
      ".",
  },

  template: {
    headline: (pilots, system, level) =>
      `${count(pilots, "nicht befreundeter Pilot", "nicht befreundete Piloten")}${system ? ` in ${system}` : ""}: ${THREAT_LEVELS[level]}`,
    recentActive: (pilots, latest) =>
      `${count(pilots, "Pilot hatte", "Piloten hatten")} Kills in der letzten Woche; zuletzt ${list(latest)}.`,
    recentPilot: (name, latest, now) =>
      latest ? `{@${name}} (${latest.isLoss ? "ein Verlust" : "ein Kill"} in **${latest.ship ?? "einem Schiff"}**, ${ago(latest.at, now)})` : `{@${name}}`,
    recentQuiet: (pilots, system) =>
      `Keiner der ${count(pilots, "nicht befreundeten Piloten", "nicht befreundeten Piloten")}${system ? ` in **${system}**` : ""} hatte in der letzten Woche einen Kill.`,
    mostDangerous: (pilots) => `Gerade am gefährlichsten: ${list(pilots)}.`,
    dangerousPilot: (name, tier, tags) => `{@${name}} (${TIERS[tier].toLowerCase()}${tags.length ? `, ${tags.map(tagWord).join(", ")}` : ""})`,
    composition: (comp, roles, together) =>
      `${comp.length ? `Fliegen wahrscheinlich ${list(comp.map((c) => `${n(c.pilots)}× ${HULL_CLASSES[c.cls]}`))}` : "Keine neueren Schiffe bekannt"}` +
      `${roles.length ? `; gesehene Rollen: ${list(roles.map((r) => ROLES[r.role](r.count)))}` : ""}.` +
      (together.length ? ` ${list(together.map((g) => g.map((name) => `{@${name}}`).join(", ")))} fliegen zusammen.` : ""),
    lastFight: (fight, now) =>
      `Zuletzt gekämpft gegen ${list(fight.pilots.map((name) => `{@${name}}`))} ${ago(fight.at, now)} in **${fight.system ?? "?"}**: ` +
      `sie brachten ${list(fight.brought.map((b) => `${b.count > 1 ? `${n(b.count)}× ` : ""}${b.ship ?? "?"}`))}; ` +
      `wir haben ${n(fight.weKilled)} zerstört ({+${f.isk(fight.iskKilled)}}) und ${n(fight.weLost)} verloren ({-${f.isk(fight.iskLost)}}).`,
    keyPilotFallback: (tier) => `Bedrohung: ${TIERS[tier].toLowerCase()}`,
    advice: {
      minimal: "Hier war zuletzt niemand gefährlich; flieg normal weiter und behalte Local im Blick.",
      low: "Wenig Aktivität in letzter Zeit; bleib aligned und beobachte den D-Scan.",
      elevated: "Hier sind einige aktive PvP-Piloten; flieg aligned, halte dich nicht an Gates auf und schick einen Scout vor.",
      high: "Hier sind aktive, gefährliche Piloten; flieg nicht allein und rechne mit Tackle an den Gates.",
      critical: "Hier ist eine aktive, gefährliche Gruppe; dock ein oder bilde eine Flotte, bevor du abdockst.",
    },
    dossierSummary: (name, tier, score, tags) =>
      tier === "unknown"
        ? `{@${name}} hat noch keine Bedrohungsbewertung.`
        : `{@${name}}: Bedrohung ${TIERS[tier].toLowerCase()}${score !== null ? ` (${n(score)})` : ""}${tags.length ? `; ${tags.map(tagWord).join(", ")}` : ""}.`,
    dossierLatest: (latest, kills7d, kills30d, now) =>
      `Zuletzt: ${latest.isLoss ? "ein Verlust" : "ein Kill"} in **${latest.ship ?? "einem Schiff"}** ${ago(latest.at, now)} in **${latest.system ?? "?"}**. ` +
      `${count(kills7d, "Kill", "Kills")} in den letzten 7 Tagen${kills30d !== null ? `, ${n(kills30d)} in 30` : ""}.`,
    dossierQuiet: (lastActiveMonth) => `Keine Killmails in letzter Zeit${lastActiveMonth ? `; zuletzt aktiv ${lastActiveMonth}` : ""}.`,
    flies: (ships) => `Fliegt ${list(ships)}`,
    zone: (zone) => `meist Zeitzone ${TIME_ZONES[zone]}`,
    dossierHistory: (h, now) =>
      `Bei ${n(h.killsOnUs)} unserer Verluste dabei und ${n(h.lossesToUs)}× an uns gestorben${h.lastAt ? `; zuletzt ${ago(h.lastAt, now)}` : ""}.`,
    dscanAssessment: (ships, comp, matched) =>
      `${count(ships, "Schiff", "Schiffe")} auf dem Scan: ${list(comp.map((c) => `${n(c.count)}× ${HULL_CLASSES[c.cls]}`))}. ` +
      (matched
        ? `${count(matched, "Pilot", "Piloten")} aus Local ${matched === 1 ? "passt" : "passen"} zu einem zuletzt geflogenen Schiff.`
        : "Niemand in Local ist diese Schiffe zuletzt geflogen."),
    flewHull: (lastAt, now) => (lastAt ? `Flog dieses Schiff ${ago(lastAt, now)}` : "Flog dieses Schiff schon einmal"),
    fliesClass: (cls) => `Fliegt Schiffe der Klasse ${HULL_CLASSES[cls]}`,
    unplaced: (ships) => `Niemand in Local fliegt bekanntermaßen ${list(ships)}; sie fehlen vielleicht in der Liste oder fliegen neue Schiffe.`,
  },
};
