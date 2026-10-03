import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";
import type { pnl as en } from "../en/pnl";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export const pnl: typeof en = {
  title: "Mining-GuV",
  metaTitle: {
    overview: "Mining-GuV",
    expenses: "Mining-GuV · Ausgaben",
    settings: "Mining-GuV · Einstellungen",
  },
  tabs: {
    label: "Mining-GuV",
    overview: "Übersicht",
    expenses: "Ausgaben",
    settings: "Einstellungen",
  },
  filters: {
    characters: "Charaktere",
    groupBy: "Gruppieren nach",
    reset: "Zurücksetzen",
  },
  buckets: {
    day: "Tag",
    week: "Woche",
    month: "Monat",
  },
  categories: {
    crystals: { label: "Mining-Kristalle", hint: "Mining- und Mercoxit-Mining-Kristalle" },
    fuel: { label: "Treibstoff", hint: "Heavy Water für die Industriekerne von Orca / Rorqual" },
    bursts: { label: "Burst-Ladungen", hint: "Mining-Foreman-Burst-Ladungen" },
    drones: { label: "Mining-Drohnen", hint: "Mining-, Eis- und Excavator-Drohnen" },
    ships: { label: "Schiffe & Fittings", hint: "Mining-Schiffe, Mining-Module, Rigs, Kompressoren" },
    subscription: { label: "PLEX / Omega", hint: "Spielzeit für Mining-Alts" },
    other: { label: "Sonstiges", hint: "Alles andere, was du als Mining-Kosten zählst" },
  },
  statuses: {
    counted: { label: "Gezählt", hint: "In deinen Ausgaben enthalten" },
    suggested: { label: "Vorgeschlagen", hint: "Als Mining-Kosten erkannt, wartet darauf, dass du sie übernimmst" },
    excluded: { label: "Ausgeschlossen", hint: "Von dir ausgeschlossen" },
    untagged: { label: "Andere Käufe", hint: "Nicht als Mining-Kosten erkannt; ordne eine Kategorie zu, um sie zu zählen" },
  },
  statusFilters: {
    mining: "Mining-Kosten",
    suggested: "Vorgeschlagen",
    counted: "Gezählt",
    excluded: "Ausgeschlossen",
    untagged: "Andere Käufe",
  },
  spread: (days: number) => (days === 1 ? "Ein Tag" : `${n(days)} Tage`),
  hours: (value: string) => `${value} h`,
  accountWide: "Kontoweite Einträge",
  characterFallback: (id: number) => `Charakter ${id}`,
  switch: { on: "An", off: "Aus" },

  chart: {
    legend: "Legende",
    view: "Diagramm oder Tabelle",
    chart: "Diagramm",
    table: "Tabelle",
    expenses: "Ausgaben",
    net: "Gewinn",
    netShort: "Netto",
    partial: "unvollständig",
    income: "Einnahmen",
  },

  overview: {
    description: "Einnahmen und Ausgaben deiner eigenen Charaktere. Nur du siehst diese Übersicht.",
    empty: {
      title: "Für diesen Zeitraum gibt es nichts anzuzeigen",
      action: "GuV-Einstellungen",
      body: "Einnahmen stammen aus den Mining-Ledgern deiner Charaktere (Sync alle 15 Minuten). Ausgaben stammen aus Wallet-Käufen, die du übernimmst, und aus manuellen Einträgen. Der Wallet-Import ist optional und bleibt aus, bis du ihn pro Charakter einschaltest.",
    },
    tiles: {
      net: (from: string, to: string) => `Gewinn · ${from} – ${to}`,
      netHint: (income: string, expenses: string, margin: string | null) =>
        `${income} Einnahmen − ${expenses} Ausgaben${margin ? ` · ${margin} Marge` : ""}`,
      income: "Einnahmen",
      rate: (percent: string) => `${percent} der Bewertung`,
      rules: (count: number) => plural(count, "Preisregel", "Preisregeln"),
      expenses: "Ausgaben",
      suggested: (count: number, amount: string) => `${n(count)} vorgeschlagen (${amount})`,
      manual: (amount: string) => `${amount} manuell`,
      iskPerHour: "ISK pro Stunde",
      noActivity: "Noch keine gemessene Aktivität",
      iskPerHourHint: (net: string, hours: string) => `netto ${net} · ${hours} aktiv`,
      costPerM3: "Kosten pro m³",
      mined: (volume: string) => `${volume} abgebaut`,
    },
    chartTitle: {
      day: "Einnahmen und Ausgaben pro Tag",
      week: "Einnahmen und Ausgaben pro Woche",
      month: "Einnahmen und Ausgaben pro Monat",
    },
    chartSubtitle: "EVE-Zeit (UTC); Wochen beginnen am Montag",
    expenses: {
      title: "Ausgaben",
      subtitle: "Gezählte Käufe und manuelle Einträge",
      review: "Prüfen",
      empty: "In diesem Zeitraum wurden keine Ausgaben gezählt.",
      split: "Wallet-Käufe · manuelle Einträge",
      walletOff: (enable: ReactNode) => (
        <>
          Der Wallet-Import ist für alle deine Charaktere aus. {enable}, damit gekaufte Kristalle, Treibstoff,
          Burst-Ladungen, Drohnen und Schiffe erfasst werden.
        </>
      ),
      enable: "Schalte ihn ein",
    },
    columns: {
      character: "Charakter",
      activity: "Aktivität",
      income: "Einnahmen",
      volume: "m³",
      active: "Aktiv",
      iskPerHour: "ISK/h",
      expenses: "Ausgaben",
      net: "Netto",
    },
    byCharacter: { title: "Nach Charakter", subtitle: "Ausgaben beim Charakter, der bezahlt hat" },
    byActivity: {
      title: "Nach Aktivität",
      subtitle: {
        hours: "Ausgaben nach aktiven Stunden verteilt",
        volume: "Ausgaben nach abgebauten m³ verteilt",
        none: "Erz, Mond, Eis und Gas",
      },
      empty: "Kein Mining in diesem Zeitraum.",
    },
    how: {
      title: "So wird gerechnet",
      income: (valuation: string, rate: string | null, base: string | null) => (
        <>
          <b className="text-ink">Einnahmen</b> sind das Erz, das deine Charaktere abgebaut haben, bewertet wie im
          Mining-Dashboard ({valuation}){rate ? `, zu ${rate} dieses Werts` : ""}. Erze mit einer Preisregel verwenden
          stattdessen deinen Preis.
          {/* "369 Mio." already ends with a period. */}
          {base ? ` Zum reinen Dashboard-Wert wären es ${base}${base.endsWith(".") ? "" : "."}` : ""}
        </>
      ),
      expenses: () => (
        <>
          <b className="text-ink">Ausgaben</b> sind Wallet-Käufe, die du gezählt hast (oder die bei Charakteren mit
          eingeschalteter automatischer Zählung automatisch zählen), plus manuelle Einträge; verteilte Einträge werden
          gleichmäßig auf ihre Tage aufgeteilt. Handel zwischen deinen eigenen Charakteren zählt nicht.
        </>
      ),
      iskPerHour: (wallClock: string, characterHours: string, since: string | null, share: string) => (
        <>
          <b className="text-ink">ISK pro Stunde</b> ergibt sich daraus, wie stark deine Ledger zwischen den
          15-Minuten-Syncs gewachsen sind (Genauigkeit ±15 Min. pro Session). Gleichzeitig minende Charaktere zählen
          einmal ({wallClock} Echtzeit, {characterHours} Charakterstunden).{" "}
          {since
            ? `Gemessen seit ${since}; deckt ${share} der Einnahmen dieses Zeitraums ab.`
            : "Die Messung beginnt mit dem nächsten Ledger-Sync; für früheres Mining gibt es keine Aktivitätsdaten."}
        </>
      ),
      costPerM3: (unpriced: number) => (
        <>
          <b className="text-ink">Kosten pro m³</b> sind alle Ausgaben geteilt durch das abgebaute Volumen.
          {unpriced > 0
            ? ` ${plural(unpriced, "Ledger-Zeile hat", "Ledger-Zeilen haben")} noch keinen Preis und zählen mit 0 ISK.`
            : ""}
        </>
      ),
    },
  },

  expenses: {
    description: "Entscheide, welche Wallet-Käufe Mining-Kosten waren, und erfasse Kosten, die ESI nicht sieht.",
    purchases: {
      title: "Wallet-Käufe",
      subtitle: "Automatisch nach Item-Gruppe erkannt: Kristalle, Heavy Water, Burst-Ladungen, Mining-Drohnen, Mining-Schiffe und Fittings",
      includeAll: (count: number) => `Alle ${n(count)} vorgeschlagenen übernehmen`,
      includeAllHint: "Jeden vorgeschlagenen Kauf in diesem Zeitraum zählen",
      walletOff:
        "Der Wallet-Import ist für alle deine Charaktere aus. Schalte ihn pro Charakter ein, damit Mining-Käufe hier vorgeschlagen werden; gezählt wird nichts, bis du es übernimmst (oder die automatische Zählung für diesen Charakter einschaltest).",
      enableWallet: "Wallet-Import einschalten",
      statusNav: "Status der Käufe",
      tabCount: (count: number, amount: string) => `${n(count)} · ${amount}`,
      empty: "Hier gibt es in diesem Zeitraum keine Käufe.",
      columns: {
        date: "Datum",
        item: "Item",
        quantity: "Menge",
        total: "Summe",
        category: "Kategorie",
        status: "Status",
        countIt: "Zählen?",
      },
      unitPrice: (price: string) => `à ${price}`,
      categoryLabel: "Kategorie",
      auto: (label: string) => `${label} (auto)`,
      notMiningCost: "Keine Mining-Kosten",
      include: "Übernehmen",
      includeHint: "Diesen Kauf als Mining-Kosten zählen",
      exclude: "Ausschließen",
      excludeHint: "Ausschließen: keine Mining-Kosten",
      reset: "Zurück auf automatisch",
      page: (page: number, pages: number, total: number) => `Seite ${n(page)} von ${n(pages)} · ${plural(total, "Kauf", "Käufe")}`,
      newer: "Neuer",
      older: "Älter",
    },
    add: {
      title: "Kosten erfassen",
      subtitle: "PLEX / Omega für Alts, Contracts, alles, was ESI nicht sieht",
      date: "Datum",
      amount: "Betrag (ISK)",
      amountPlaceholder: "z. B. 2,1b oder 450.000.000",
      category: "Kategorie",
      spread: "Verteilen über",
      character: "Charakter",
      accountWide: "Kontoweit",
      note: "Notiz",
      notePlaceholder: "z. B. 12 Monate Omega",
      submit: "Kosten erfassen",
    },
    manual: {
      title: "Manuelle Kosten",
      subtitle: "Einträge, die in den gewählten Zeitraum fallen",
      empty: "Keine manuellen Kosten in diesem Zeitraum.",
      columns: { date: "Datum", category: "Kategorie", character: "Charakter", note: "Notiz", amount: "Betrag", actions: "Aktionen" },
      spreadDays: (days: number) => `+${n(days - 1)} T.`,
      deleteHint: "Diese Kosten löschen",
      footer: (back: ReactNode) => (
        <>
          Verteilte Kosten zählen pro Tag anteilig, sodass ein Jahr Omega gleichmäßig erscheint statt an einem Tag. {back}
        </>
      ),
      back: "Zurück zur Übersicht",
    },
  },

  settings: {
    description: "Wallet-Import pro Charakter, wie Erz-Einnahmen bewertet werden und was du tatsächlich beim Verkauf bekommst.",
    wallet: {
      title: "Wallet-Import",
      subtitle:
        "Optional und pro Charakter. Keystar liest dann die Marktkäufe und -verkäufe dieses Charakters; sehen kannst sie nur du.",
      revoked: "Token widerrufen",
      on: "Wallet-Import an",
      off: "Wallet-Import aus",
      imported: (count: number, since: string, synced: string) =>
        `${plural(count, "Transaktion", "Transaktionen")} seit ${since} · synchronisiert ${synced}`,
      noTransactions: (synced: string) => `Keine Markttransaktionen in den letzten 30 Tagen · synchronisiert ${synced}`,
      firstImport: "Erster Import in wenigen Minuten",
      kept: (count: number) => `${plural(count, "importierte Transaktion bleibt", "importierte Transaktionen bleiben")} erhalten`,
      nothing: "Nichts importiert",
      activitySince: (date: string) => `Mining-Aktivität gemessen seit ${date}`,
      activityNext: "Die Mining-Aktivität wird ab dem nächsten Ledger-Sync gemessen",
      activityNone: "Kein Zugriff aufs Mining-Ledger: Aktivität kann nicht gemessen werden",
      autoCount: "Erkannte Käufe automatisch zählen",
      enable: "Wallet-Import einschalten",
      stop: "Wallet-Import beenden",
      demo: "Im Demo-Modus nicht verfügbar",
      deleteHistory: "Verlauf löschen",
      deleteHistoryHint: "Die importierten Wallet-Transaktionen dieses Charakters löschen",
      toast: {
        deleted: (name: string) => `Wallet-Verlauf von ${name} gelöscht`,
        failed: (name: string) => `Der Wallet-Verlauf von ${name} konnte nicht gelöscht werden`,
        errors: {
          forbidden: "Du hast keinen Zugriff mehr auf die Mining-GuV.",
          notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
          stillImporting: "Beende zuerst den Wallet-Import für diesen Charakter.",
          unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
        },
      },
      notes: {
        enable: () => (
          <>
            Beim Einschalten landest du beim EVE-Login mit deinen bisherigen Scopes plus Lesezugriff aufs Wallet.{" "}
            <b>Wähle dort denselben Charakter</b>; EVE ersetzt bei jedem Login die Scopes eines Charakters.
          </>
        ),
        autoCount:
          "„Erkannte Käufe automatisch zählen“ ist standardmäßig aus: Als Mining-Kosten erkannte Käufe werden nur vorgeschlagen, bis du sie übernimmst. Schalte es für Charaktere ein, die ausschließlich fürs Mining einkaufen; einzelne Käufe kannst du trotzdem ausschließen.",
        stop: "Beenden schaltet den Wallet-Import in Keystar sofort ab; autorisiere den Charakter unter „Meine Charaktere“ neu, um den Scope auch aus seinem EVE-Token zu entfernen. Der importierte Verlauf bleibt, bis du ihn löschst.",
      },
    },
    income: {
      title: "Bewertung der Einnahmen",
      base: (valuation: string) => `Basis: ${valuation}`,
      share: "Anteil der Bewertung, den du tatsächlich bekommst",
      hint: "Z. B. 90, wenn du an einen Buyback zu 90 % von Jita Buy verkaufst. Erze mit einer Preisregel verwenden stattdessen diesen Preis.",
      save: "Speichern",
    },
    prices: {
      title: "Erzpreise",
      subtitle: "Was du pro Einheit eines bestimmten Erzes bekommst (hat Vorrang vor dem %)",
      columns: { ore: "Erz", unitPrice: "ISK / Einheit", from: "Ab", to: "Bis", actions: "Aktionen" },
      always: "immer",
      deleteHint: "Diese Regel löschen",
      empty: (days: number) => `Erze, die du in den letzten ${n(days)} Tagen abgebaut hast, kannst du hier bepreisen.`,
      ore: "Erz",
      unitPrice: "ISK / Einheit",
      unitPricePlaceholder: "z. B. 18,5",
      from: "Ab (optional)",
      to: "Bis (optional)",
      add: "Preis hinzufügen",
      hints: {
        title: (days: number) => `Aus deinen Wallet-Verkäufen · letzte ${n(days)} Tage`,
        empty:
          "Keine Marktverkäufe der von dir abgebauten Erze (roh oder komprimiert) in importierten Wallets. Verkäufe per Contract oder an einen Buyback erscheinen hier nicht; dafür ist das % oben da.",
        columns: { ore: "Erz", sold: "Verkauft (roh)", got: "Erhalten / Einh.", valuation: "Bewertung / Einh." },
        sales: (count: number) => plural(count, "Verkauf", "Verkäufe"),
        use: "Übernehmen",
        useHint: "Als Preis dieses Erzes übernehmen (ohne Datumsgrenzen)",
      },
    },
  },
};
