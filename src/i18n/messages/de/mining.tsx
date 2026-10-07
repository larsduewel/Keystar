import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";
import type { mining as en } from "../en/mining";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export const mining: typeof en = {
  module: {
    navSection: "Industrie",
    nav: {
      overview: "Mining-Übersicht",
      ledger: "Mining-Ledger",
      observers: "Mondbohrer",
      estimator: "Feldschätzer",
      pnl: "Mining-GuV",
    },
    permissionGroup: "Mining",
    permissions: {
      viewOwn: { label: "Eigenes Mining ansehen", description: "Das Mining-Ledger der eigenen Charaktere sehen." },
      viewCorp: {
        label: "Mining der Corporation ansehen",
        description: "Das Mining aller Mitglieder und an den Mondbohrern der Corporation sehen.",
      },
      export: { label: "Mining-Daten exportieren", description: "Ledger als CSV herunterladen." },
      pnl: {
        label: "Mining-GuV",
        description: "Persönliche Einnahmen-/Ausgaben-Übersicht der eigenen Charaktere (nie die anderer Mitglieder).",
      },
    },
    scopes: {
      characterMining: "Liest dein persönliches Mining-Ledger: Erz, Eis, Gas und Mond-Mining der letzten 30 Tage (optional).",
      characterMiningLabel: "Zugriff auf das Mining-Ledger",
      corporationMining: "Liest die Mondbohrer-Ledger der Raffinerien deiner Corporation.",
      structures: "Benennt Raffinerien auf der Seite Mondbohrer.",
    },
    jobs: {
      characterLedger: "Persönliches Mining-Ledger",
      observers: "Mondbohrer-Ledger",
      structures: "Raffinerie-Namen",
    },
    help: {
      overview:
        "Mining-Summen für den gewählten Zeitraum: ISK-Wert, Volumen, Tagesdiagramm, Top-Miner, Erze und Systeme. Mit Corporation-Zugriff kannst du zwischen der ganzen Corporation und deinen eigenen Charakteren wechseln, sonst siehst du nur deine. Auf der Zugriffsseite wählt jeder Pilot, welche Charaktere ihr persönliches Ledger teilen; es wird alle 15 Minuten synchronisiert, Mondbohrer stündlich. ESI hält 30 Tage vor, Keystar behält ab dann alles.",
      ledger:
        "Jeder Eintrag hinter der Mining-Übersicht, nach Tagen gruppiert: eine Zeile pro Charakter, Erz und System (oder Raffinerie) mit Einheiten, Volumen und ISK-Wert. Die Filter funktionieren wie in der Übersicht; mit der Export-Berechtigung kannst du die gefilterten Zeilen als CSV herunterladen.",
      observers:
        "Mond-Mining, erfasst von den Mondbohrern der Corporation, pro Raffinerie: Wert, Volumen, Piloten und Erze – auch von Piloten, die nie bei Keystar registriert waren oder nicht zur Corporation gehören. Dafür muss ein Charakter mit der Ingame-Rolle Accountant oder Direktor mit Corporation-Zugriff verknüpft sein; Sync stündlich.",
      estimator:
        "Füge ein Ergebnis des Survey-Scanners ein, um einen Asteroidengürtel oder Mond-Chunk nach Erz und Stufe zu bewerten – mit Keystars Preisquelle neben der Schätzung des Scanners. Gib den Flottenertrag in m³/s ein, um die Abbaudauer zu sehen. Der Scan wird nicht gespeichert.",
      pnl: "Deine eigene Mining-GuV: Einnahmen aus dem abgebauten Erz (oder aus deinen Wallet-Verkäufen) minus die Wallet-Käufe, die du übernimmst, und selbst erfasste Kosten. Nur du siehst sie, unabhängig von deiner Rolle. Der Wallet-Import ist optional pro Charakter: Im Tab „Einstellungen“ schaltest du ihn ein, legst fest, wie Einnahmen gezählt werden, und hinterlegst Erzpreise.",
    },
  },

  valuation: {
    modes: {
      historical: "Preis am Abbautag",
      current: "aktuelle Preise",
    },
  },

  sources: {
    all: { label: "Kombiniert", hint: "Mitglieder-Ledger plus Mondbohrer-Einträge, die dort noch nicht enthalten sind" },
    personal: { label: "Mitglieder-Ledger", hint: "Persönliche Ledger registrierter Charaktere (sämtliches Mining)" },
    observer: { label: "Mondbohrer", hint: "Mond-Mining, erfasst von den Mondbohrern der Corporation (alle Piloten)" },
  },

  metrics: {
    value: "ISK",
    volume: "m³",
    quantity: "Einheiten",
  },

  chartClasses: {
    moon: "Monderz",
    ore: "Asteroidenerz",
    ice: "Eis",
    gas: "Gas",
    other: "Sonstiges",
  },

  moonRarity: {
    moon_r4: "R4 Allgegenwärtig",
    moon_r8: "R8 Häufig",
    moon_r16: "R16 Ungewöhnlich",
    moon_r32: "R32 Selten",
    moon_r64: "R64 Außergewöhnlich",
  },

  columns: {
    date: "Datum",
    character: "Charakter",
    ore: "Erz",
    location: "Ort",
    source: "Quelle",
    system: "System",
    miners: "Miner",
    rocks: "Asteroiden",
    units: "Einheiten",
    volume: "Volumen",
    unitPrice: "Stückpreis",
    value: "Wert",
    scanner: "Scanner",
    keystar: "Keystar",
    share: "Anteil",
  },

  exportCsv: "CSV exportieren",
  /** Button to the Mining access page. */
  access: "Zugriff",

  filters: {
    members: "Mitglieder",
    registered: "Registriert",
    notRegistered: "Nicht registriert",
    class: "Klasse",
    ore: "Erz",
    system: "System",
    dataSource: "Datenquelle",
    measure: "Kennzahl",
    reset: "Zurücksetzen",
  },

  view: {
    label: "Mining anzeigen von",
    corp: "Corporation",
    corpHint: "Charaktere der Heimat-Corporation und die Raffinerien der Corporation",
    own: "Meine Charaktere",
    ownHint: "Alle deine verknüpften Charaktere, auch Alts in anderen Corporations",
  },

  groupBy: {
    label: "Miner gruppieren nach",
    pilots: "Piloten",
    pilotsHint: "Alts unter ihrem Hauptcharakter zusammenfassen",
    characters: "Charaktere",
  },

  chart: {
    legend: "Legende",
    view: "Diagramm oder Tabelle",
    chart: "Diagramm",
    table: "Tabelle",
    noMining: "Kein Mining",
    total: "Gesamt",
    allResources: "Alle Ressourcen",
    showOres: (resource: string) => `Erze in ${resource} anzeigen`,
    otherOres: (count: number) => `Übrige (${plural(count, "Erz", "Erze")})`,
  },

  breakdowns: {
    oresOf: (resource: string) => `${resource} · nach Sorte`,
    characters: (count: number) => plural(count, "Char", "Chars"),
    notRegistered: "nicht registriert",
    moonByRarity: "Monderz nach Seltenheit",
    unknownLocation: "Unbekannter Ort",
    groupOres: "Erzsorten gruppieren",
    groupOresHint: "Stufen und Varianten jedes Erzes (Scordite II-Grade, Thick Blue Ice …) in einer Zeile zusammenfassen",
    variants: (count: number) => plural(count, "Variante", "Varianten"),
    averagePrice: "Durchschnitt über die Stufen, gewichtet nach Einheiten",
  },

  overview: {
    metaTitle: "Mining",
    description: {
      corp: "Erz-, Eis-, Gas- und Mond-Mining der Charaktere der Heimat-Corporation und an den Raffinerien der Corporation.",
      noHomeCorp:
        "Mining deiner eigenen Charaktere. Corporation-weite Ansichten erscheinen, sobald ein Admin die Heimat-Corporation festlegt.",
      own: "Mining deiner eigenen Charaktere. Frag einen Direktor nach Corporation-weitem Zugriff.",
      ownView: "Mining aller deiner verknüpften Charaktere, auch Alts in anderen Corporations.",
    },
    ledger: "Ledger",
    empty: {
      title: "Noch keine Mining-Daten",
      action: "Mining-Zugriff",
      body: "Das Mining-Ledger zu teilen ist freiwillig: Schalte es auf der Seite Mining-Zugriff für deine Charaktere ein. Der Worker synchronisiert persönliche Ledger alle 15 Minuten und Mondbohrer stündlich; ESI hält die letzten 30 Tage vor, Keystar behält ab dann alles.",
    },
    // Short on purpose: it follows "ggü." in narrow stat tiles.
    priorPeriod: (days: number) => (days === 1 ? "Vortag" : "Vorperiode"),
    valueMined: (from: string, to: string) => `Abgebauter Wert · ${from} – ${to}`,
    volume: "Volumen",
    units: "Einheiten",
    activePilots: "Aktive Piloten",
    characters: (count: number) => plural(count, "Charakter", "Charaktere"),
    valuePerActiveDay: "Wert pro aktivem Tag",
    activeDays: (active: number, span: number) => `${n(active)} von ${plural(span, "Tag", "Tagen")} aktiv`,
    daily: {
      value: "ISK pro Tag nach Ressource",
      volume: "m³ pro Tag nach Ressource",
      quantity: "Einheiten pro Tag nach Ressource",
    },
    eveDays: "Tage in EVE-Zeit (UTC)",
    resourceMix: "Ressourcen-Mix",
    shareOf: {
      value: "Anteil an ISK",
      volume: "Anteil am Volumen",
      quantity: "Anteil an Einheiten",
    },
    topMiners: "Top-Miner",
    topMinersGrouped: "Alts unter ihrem Hauptcharakter zusammengefasst",
    topMinersDrill: "Klicke auf einen Charakter, um nur ihn anzuzeigen",
    noMiners: "In diesem Zeitraum hat niemand gemint.",
    oreBreakdown: "Aufschlüsselung nach Erz",
    noOre: "Kein Erz in diesem Zeitraum.",
    systems: "Systeme",
    systemsSubtitle: "Wo abgebaut wurde",
    coverage: {
      title: "Datenabdeckung",
      subtitle: "Wie vollständig diese Zahlen sind",
      tracked: "Charaktere mit Zugriff auf das Mining-Ledger",
      notEnabled: "Charaktere, die ihr Ledger nicht teilen",
      notEnabledHint: "Schalte das Mining-Ledger für diese Charaktere auf der Seite Mining-Zugriff ein.",
      notEnabledCorpHint:
        "Das persönliche Mining-Ledger zu teilen ist pro Charakter freiwillig. Mond-Mining an Raffinerien der Corporation erscheint weiterhin über die Mondbohrer.",
      invalidTokens: "Widerrufene oder abgelaufene Tokens",
      unregistered: "Nicht registrierte Corp-Mitglieder",
      lastLedgerSync: "Letzter Sync der persönlichen Ledger",
      lastObserverSync: "Letzter Sync der Mondbohrer",
      notConfigured: "nicht eingerichtet",
      unpriced: (rows: number) =>
        rows === 1
          ? "1 Ledger-Zeile hat noch keinen Preis und zählt als 0 ISK."
          : `${n(rows)} Ledger-Zeilen haben noch keinen Preis und zählen als 0 ISK.`,
      note: (valuation: string) =>
        `ESI-Ledger sind Tagessummen pro Erz und System. „Kombiniert“ zählt Mondbohrer-Einträge nur, wenn sie nicht schon im persönlichen Ledger eines Mitglieds stehen. ISK-Bewertung: ${valuation}.`,
    },
  },

  ledger: {
    metaTitle: "Mining-Ledger",
    description: "Jeder Ledger-Eintrag: ESI meldet eine Zeile pro Charakter, Tag, Erz und System (oder Raffinerie).",
    overview: "Übersicht",
    entries: (count: number, value: ReactNode) => (
      <>
        {value} {count === 1 ? "Eintrag" : "Einträge"}
      </>
    ),
    pageOf: (page: number, pages: number) => `Seite ${n(page)} von ${n(pages)}`,
    empty: "Keine Ledger-Einträge passen zu diesen Filtern.",
    unknownSystem: "Unbekannt",
    sourceBadge: {
      personal: "Persönlich",
      observer: "Mondbohrer",
    },
    dayMeta: (entries: number, characters: number) =>
      `${plural(entries, "Eintrag", "Einträge")} · ${plural(characters, "Charakter", "Charaktere")}`,
    dayPartial: (shown: number, entries: number) => `${n(shown)} von ${n(entries)} auf dieser Seite`,
    collapseAll: "Alle einklappen",
    expandAll: "Alle ausklappen",
    pagination: "Seitennavigation",
    previous: "Zurück",
    next: "Weiter",
  },

  observers: {
    metaTitle: "Mondbohrer",
    description:
      "Mond-Mining, erfasst von den Mondbohrern der Corporation – auch von Piloten, die sich nie bei Keystar registriert haben.",
    noHomeCorp: {
      title: "Keine Heimat-Corporation festgelegt",
      body: "Mondbohrer werden für die Heimat-Corporation erfasst. Ein Admin kann sie unter Administration → Einstellungen festlegen.",
    },
    noObservers: {
      title: "Noch keine Mondbohrer",
      body: (strong: (text: string) => ReactNode) => (
        <>
          Ein Direktor oder Accountant muss einen Charakter mit Corporation-Scopes verknüpfen (Meine Charaktere → „Mit
          Corporation-Zugriff verknüpfen“). Der Charakter braucht die Ingame-Rolle {strong("Accountant")}, um die Mondbohrer-Ledger
          zu lesen, und {strong("Station Manager")} für die Raffinerie-Namen.
        </>
      ),
    },
    structure: (id: number) => `Struktur ${id}`,
    unknownSystem: "Unbekanntes System",
    lastActivity: (date: string) => `letzte Aktivität ${date}`,
    ledgerLink: "Ledger →",
    value: "Wert",
    volume: "Volumen",
    pilots: "Piloten",
    outsideCorpCount: (count: number) => `${n(count)} außerhalb der Corp`,
    outsideCorp: "außerhalb der Corp",
    units: (quantity: string) => `${quantity} Einheiten`,
    noMining: "Kein Mining in diesem Zeitraum.",
  },

  estimator: {
    metaTitle: "Feldschätzer",
    title: "Feldschätzer",
    description:
      "Füge ein Ergebnis des Survey-Scanners ein, um einen Asteroidengürtel oder Mond-Chunk zu bewerten – gruppiert nach Erz und Stufe.",
    scan: {
      title: "Survey-Scan",
      subtitle: "Survey-Scanner → alles auswählen → kopieren, dann hier einfügen",
      example: "Beispiel",
      clear: "Leeren",
      input: "Ergebnis des Survey-Scanners",
      placeholder: "Scordite III-Grade\t8.904\t1.335 m3\t168.000,00 ISK\t25 km\n…",
    },
    skipped: (count: number, lines: string) =>
      count === 1
        ? `1 Zeile übersprungen, die nicht nach einem Asteroiden aussah (Zeile ${lines}).`
        : `${n(count)} Zeilen übersprungen, die nicht nach Asteroiden aussahen (Zeilen ${lines}).`,
    fleetYield: "Flottenertrag",
    fleetYieldPlaceholder: "z. B. 150",
    keystarValue: "Keystar-Wert",
    pricing: "bewerte …",
    unpriced: (count: number) => `${plural(count, "Typ", "Typen")} ohne Preis`,
    scannerEstimate: "Scanner-Schätzung",
    eveAverage: "EVE-Durchschnittspreis",
    volume: "Volumen",
    perM3: (price: string) => `${price} pro m³`,
    timeToClear: "Abbaudauer",
    asteroids: "Asteroiden",
    duration: (hours: number, minutes: number) => `${n(hours)} Std. ${minutes} Min.`,
    asteroidCount: (count: number) => plural(count, "Asteroid", "Asteroiden"),
    oreTypes: (count: number) => plural(count, "Erzsorte", "Erzsorten"),
    priceError: "Keystar-Preise konnten nicht geladen werden – es werden nur die Scanner-Werte angezeigt.",
    esiUnavailable: "EVEs ESI ist gerade nicht erreichbar, daher konnten einige Erze nicht bewertet werden – für sie werden die Scanner-Werte angezeigt.",
    empty: "Füge einen Survey-Scan ein, um das Feld nach Erz und Stufe aufgeschlüsselt zu sehen.",
    grades: (count: number) => plural(count, "Stufe", "Stufen"),
    baseGrade: "Basis",
    columns: {
      ore: "Erz",
      rocks: "Asteroiden",
      units: "Einheiten",
      volume: "Volumen",
      iskPerM3: "ISK/m³",
      scanner: "Scanner",
      keystar: "Keystar",
      share: "Anteil",
    },
  },

  /** Mining access: which characters share their personal mining ledger (opt-in). */
  settings: {
    metaTitle: "Mining-Zugriff",
    description: "Wähle für jeden Charakter, ob Keystar sein persönliches Mining-Ledger lesen darf.",
    title: "Mining-Ledger pro Charakter",
    subtitle: "Beim Einschalten wird der Charakter bei EVE neu autorisiert und der Mining-Ledger-Scope hinzugefügt.",
    on: "Eingeschaltet",
    off: "Aus",
    revoked: "Token widerrufen",
    enable: "Mining-Ledger teilen",
    stop: "Ausschalten",
    reauthorize: "Neu autorisieren",
    demo: "Im Demo-Modus nicht verfügbar",
    lastSync: (when: string) => `Zuletzt aktualisiert ${when}`,
    firstSync: "Die erste Aktualisierung läuft in wenigen Minuten.",
    nothing: "Nichts gespeichert.",
    kept: (from: string, to: string) => `Das Ledger vom ${from} bis ${to} ist noch gespeichert.`,
    deleteData: "Mining-Verlauf löschen",
    deleteDataHint: "Entfernt das gespeicherte persönliche Mining-Ledger und die gemessene Mining-Aktivität dieses Charakters aus Keystar.",
    deleteDataConfirm: (name: string) =>
      `Den gespeicherten Mining-Verlauf von ${name} löschen? ESI hält nur die letzten 30 Tage vor, Älteres lässt sich nicht erneut abrufen.`,
    toast: {
      deleted: (name: string) => `Gespeicherter Mining-Verlauf von ${name} gelöscht`,
      failed: (name: string) => `Der Mining-Verlauf von ${name} konnte nicht gelöscht werden`,
      errors: {
        forbidden: "Du hast in Keystar keinen Zugriff mehr auf Mining.",
        notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
        stillEnabled: "Schalte das Mining-Ledger für diesen Charakter zuerst aus.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    notes: {
      scopes:
        "Keystar liest das Mining-Ledger des Charakters alle 15 Minuten. Es fließt in die Mining-Übersicht, das Ledger und deine Mining-GuV ein und, für Direktoren und Betrachter, in die Mining-Zahlen der Corporation.",
      stop: "Ausschalten beendet das Lesen in Keystar sofort; der gespeicherte Verlauf bleibt (auch in den Zahlen der Corporation), bis du ihn löschst. Autorisiere den Charakter unter „Meine Charaktere“ neu, um den Scope auch aus seinem EVE-Token zu entfernen.",
      observers:
        "Mond-Mining an Raffinerien der Corporation erfassen die Mondbohrer, ob du dein Ledger teilst oder nicht; das Löschen deines Verlaufs entfernt diese Einträge nicht.",
    },
  },
};
