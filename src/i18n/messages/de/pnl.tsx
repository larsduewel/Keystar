import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";
import type { pnl as en } from "../en/pnl";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export const pnl: typeof en = {
  title: "Mining-GuV",
  metaTitle: {
    overview: "Mining-GuV",
    income: "Mining-GuV · Einnahmen",
    expenses: "Mining-GuV · Ausgaben",
    settings: "Mining-GuV · Einstellungen",
  },
  tabs: {
    label: "Mining-GuV",
    overview: "Übersicht",
    income: "Einnahmen",
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
    ships: { label: "Schiffe & Fittings", hint: "Mining-Schiffe, Mining-Module, Rigs, Kompressoren, Industriekerne" },
    fees: { label: "Maklergebühren", hint: "Maklergebühren aus deinem Wallet-Journal" },
    subscription: { label: "PLEX / Omega", hint: "Spielzeit für Mining-Alts" },
    other: { label: "Sonstiges", hint: "Alles andere, was du als Mining-Kosten zählst" },
  },
  incomeCategories: {
    ore: { label: "Erz & Mineralien", hint: "Asteroiden-Erz, roh oder komprimiert, und Mineralien" },
    moon: { label: "Mond-Erz & -Materialien", hint: "Mond-Erz, roh oder komprimiert, und Mondmaterialien" },
    ice: { label: "Eis & Eisprodukte", hint: "Eis, roh oder komprimiert, und Eisprodukte" },
    gas: { label: "Gas", hint: "Gaswolken, roh oder komprimiert" },
    other: { label: "Sonstiges", hint: "Alles andere, was du als Mining-Einnahmen zählst" },
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
  saleStatuses: {
    counted: { label: "Gezählt", hint: "In deinen Einnahmen enthalten" },
    suggested: { label: "Vorgeschlagen", hint: "Als Mining-Einnahmen erkannt, wartet darauf, dass du sie übernimmst" },
    excluded: { label: "Ausgeschlossen", hint: "Von dir ausgeschlossen" },
    untagged: { label: "Andere Verkäufe", hint: "Nicht als Mining-Einnahmen erkannt; ordne eine Kategorie zu, um sie zu zählen" },
  },
  saleStatusFilters: {
    mining: "Mining-Verkäufe",
    suggested: "Vorgeschlagen",
    counted: "Gezählt",
    excluded: "Ausgeschlossen",
    untagged: "Andere Verkäufe",
  },
  spread: (days: number) => (days === 1 ? "Ein Tag" : `${n(days)} Tage`),
  hours: (value: string) => `${value} h`,
  accountWide: "Kontoweite Einträge",
  typeFallback: (id: number) => `Typ ${id}`,
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
      fromSales: (count: number, mined: string) => `${plural(count, "Wallet-Verkauf", "Wallet-Verkäufe")} · ${mined} abgebaut`,
      salesSuggested: (count: number, amount: string) => `${n(count)} Verkäufe vorgeschlagen (${amount})`,
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
      split: "Wallet · manuelle Einträge",
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
      incomeSales: (mined: string) => (
        <>
          <b className="text-ink">Einnahmen</b> sind der Erlös der Wallet-Verkäufe, die du zählst (Erz, Mineralien,
          Mondmaterialien, Eisprodukte und Gas) nach Verkaufssteuer, am Tag des Verkaufs. Das in diesem Zeitraum abgebaute Erz ist zur
          Bewertung {mined} wert; ISK pro Stunde bewertet weiterhin das abgebaute Erz.
        </>
      ),
      expenses: () => (
        <>
          <b className="text-ink">Ausgaben</b> sind Wallet-Käufe, die du gezählt hast (oder die bei Charakteren mit
          eingeschalteter automatischer Zählung automatisch zählen), plus manuelle Einträge; verteilte Einträge werden
          gleichmäßig auf ihre Tage aufgeteilt. Kommen Einnahmen aus Wallet-Verkäufen, kommen übernommene Maklergebühren
          aus dem Wallet-Journal dazu (die Verkaufssteuer wird stattdessen von den Verkäufen abgezogen). Handel zwischen
          deinen eigenen Charakteren zählt nicht.
        </>
      ),
      iskPerHour: (wallClock: string, characterHours: string, since: string | null, share: string) => (
        <>
          <b className="text-ink">ISK pro Stunde</b> ergibt sich daraus, wie stark deine Ledger zwischen den
          15-Minuten-Syncs gewachsen sind (Genauigkeit ±15 Min. pro Session). Gleichzeitig minende Charaktere zählen
          einmal ({wallClock} Echtzeit, {characterHours} Charakterstunden).{" "}
          {since
            ? `Gemessen seit ${since}; deckt ${share} des in diesem Zeitraum abgebauten Erzes ab (nach Wert).`
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

  income: {
    description: "Entscheide, welche Wallet-Verkäufe Mining-Einnahmen waren: Erz, Mineralien, Mondmaterialien, Eisprodukte und Gas.",
    minedNotice: (settings: ReactNode) => (
      <>Einnahmen sind derzeit der Wert des Erzes, das du abbaust, daher zählen diese Verkäufe noch nicht. {settings}, um stattdessen sie zu zählen.</>
    ),
    switchToSales: "Auf Wallet-Verkäufe umstellen",
    sales: {
      salesTax: {
        none: "Für diese Verkäufe wurde keine Verkaufssteuer importiert.",
        counted: (amount: string, count: number) =>
          `Verkaufssteuer: ${amount} von ${plural(count, "gezähltem Verkauf", "gezählten Verkäufen")} abgezogen.`,
        pending: (amount: string) => ` Weitere ${amount} auf noch nicht geprüfte Verkäufe, abgezogen, sobald du sie übernimmst.`,
      },
      columns: { tax: "Verkaufssteuer" },
      net: (amount: string) => `netto ${amount}`,
      title: "Wallet-Verkäufe",
      subtitle: "Automatisch nach Item-Gruppe erkannt: Erz (roh oder komprimiert), Mineralien, Mondmaterialien, Eisprodukte und Gas",
      includeAll: (count: number) => `Alle ${n(count)} Vorschläge übernehmen`,
      includeAllHint: "Jeden vorgeschlagenen Verkauf in diesem Zeitraum zählen",
      walletOff:
        "Der Wallet-Import ist für alle deine Charaktere aus. Schalte ihn pro Charakter ein, damit Erz- und Mineralienverkäufe hier vorgeschlagen werden; nichts zählt, bis du es übernimmst (oder für den Charakter das automatische Zählen einschaltest).",
      enableWallet: "Wallet-Import einschalten",
      statusNav: "Verkaufsstatus",
      empty: "Keine Verkäufe in diesem Zeitraum.",
      notMiningIncome: "Keine Mining-Einnahme",
      includeHint: "Diesen Verkauf als Mining-Einnahme zählen",
      excludeHint: "Ausschließen: keine Mining-Einnahme",
      page: (page: number, pages: number, total: number) =>
        `Seite ${n(page)} von ${n(pages)} · ${plural(total, "Verkauf", "Verkäufe")}`,
      footer: (back: ReactNode) => (
        <>
          Marktverkäufe aus deinen importierten Wallets. Handel zwischen deinen eigenen Charakteren zählt nicht. {back}
        </>
      ),
    },
    flows: {
      title: "Abgebaut vs. verkauft",
      subtitle: "Pro Erz, in Roh-Einheiten: komprimiertes Erz zählt 1:1, es braucht nur weniger Platz",
      summary: (sold: string, atValuation: string | null, left: string, volume: string) =>
        `Verkauft für ${sold}${atValuation ? ` (${atValuation} zur Bewertung)` : ""} · ${left} noch unverkauft zur heutigen Bewertung (${volume} unkomprimiert)`,
      columns: {
        ore: "Erz",
        mined: "Abgebaut",
        sold: "Verkauft",
        left: "Übrig",
        got: "Erlös / Einheit",
        valuation: "Bewertung / Einheit",
        isk: "Verkauft für",
      },
      compressed: (share: string) => `${share} komprimiert`,
      notes:
        "Übrig unter null heißt, du hast Erz verkauft, das vor diesem Zeitraum abgebaut wurde. Ausgeschlossene Verkäufe und Handel zwischen deinen eigenen Charakteren zählen nicht; zugeordnet werden nur Marktverkäufe. Gas wird nicht seiner komprimierten Variante zugeordnet.",
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
    fees: {
      title: "Maklergebühren",
      subtitle: "Fallen beim Erstellen oder Ändern einer Marktorder an, aus deinem Wallet-Journal",
      columns: { description: "Gebühr" },
      kinds: { transaction_tax: "Verkaufssteuer", brokers_fee: "Maklergebühr" },
      time: (time: string) => `${time} EVE`,
      empty: "Keine Maklergebühren in diesem Zeitraum.",
      includeAll: (count: number) => `Alle ${n(count)} Maklergebühren übernehmen`,
      includeAllHint: "Jede vorgeschlagene Maklergebühr in diesem Zeitraum zählen",
      includeHint: "Diese Maklergebühr als Mining-Kosten zählen",
      excludeHint: "Ausschließen: keine Mining-Order",
      page: (page: number, pages: number, total: number) =>
        `Seite ${n(page)} von ${n(pages)} · ${plural(total, "Maklergebühr", "Maklergebühren")}`,
      notes:
        "ESI sagt nicht, für welche Order eine Maklergebühr anfiel; die Beschreibung aus dem Journal ist alles, was es gibt. Sie zählen erst, wenn du sie übernimmst. Die Verkaufssteuer steht nicht hier: Sie wird vom Verkauf abgezogen, auf den sie gezahlt wurde (Tab „Einnahmen“).",
      minedNote:
        "Einnahmen sind derzeit der Wert des abgebauten Erzes, daher zählen Maklergebühren nicht; dein Einnahmen-Anteil deckt sie ab. Sie zählen, sobald Einnahmen aus Wallet-Verkäufen kommen (Einstellungen → Einnahmen).",
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
    description: "Wallet-Import pro Charakter, wie Einnahmen gezählt werden und was du tatsächlich beim Verkauf bekommst.",
    wallet: {
      title: "Wallet-Import",
      subtitle:
        "Optional und pro Charakter. Keystar liest dann die Marktkäufe und -verkäufe dieses Charakters und die darauf gezahlten Steuern und Gebühren; sehen kannst sie nur du.",
      revoked: "Token widerrufen",
      on: "Wallet-Import an",
      off: "Wallet-Import aus",
      imported: (count: number, since: string, synced: string) =>
        `${plural(count, "Transaktion", "Transaktionen")} seit ${since} · synchronisiert ${synced}`,
      noTransactions: (synced: string) => `Keine Markttransaktionen in den letzten 30 Tagen · synchronisiert ${synced}`,
      firstImport: "Erster Import in wenigen Minuten",
      kept: (count: number) => `${plural(count, "importierter Wallet-Eintrag bleibt", "importierte Wallet-Einträge bleiben")} erhalten`,
      nothing: "Nichts importiert",
      activitySince: (date: string) => `Mining-Aktivität gemessen seit ${date}`,
      activityNext: "Die Mining-Aktivität wird ab dem nächsten Ledger-Sync gemessen",
      activityNone: "Kein Zugriff aufs Mining-Ledger: Aktivität kann nicht gemessen werden",
      autoCount: "Erkannte Käufe automatisch zählen",
      autoCountSales: "Erkannte Verkäufe automatisch zählen",
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
        autoCountSales:
          "„Erkannte Verkäufe automatisch zählen“ funktioniert genauso für Verkäufe von Erz, Mineralien, Mondmaterialien, Eisprodukten und Gas. Es spielt nur eine Rolle, wenn Einnahmen aus Wallet-Verkäufen kommen.",
        stop: "Beenden schaltet den Wallet-Import in Keystar sofort ab; autorisiere den Charakter unter „Meine Charaktere“ neu, um den Scope auch aus seinem EVE-Token zu entfernen. Der importierte Verlauf bleibt, bis du ihn löschst.",
      },
    },
    income: {
      title: "Einnahmen",
      source: {
        label: "Einnahmen zählen aus",
        options: {
          mined: "Wert des abgebauten Erzes",
          sales: "Deinen Wallet-Verkäufen",
        },
        hints: {
          mined: "Beim Abbau, zur Bewertung unten. Funktioniert ohne Wallet-Import.",
          sales: "Beim Verkauf, zum erzielten Preis. Prüfe die Verkäufe im Tab „Einnahmen“.",
        },
      },
      valuation: "Bewertung des abgebauten Erzes",
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
