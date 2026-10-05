import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";
import type { wallet as en } from "../en/wallet";

const n = FORMATTERS.de.integer;

export const wallet: typeof en = {
  module: {
    scopes: {
      characterWallet:
        "Liest Marktkäufe und -verkäufe, damit die Mining-GuV Mining-Kosten und Verkaufspreise berücksichtigen kann (optional).",
      characterWalletLabel: "Wallet-Import",
      corporationWallets:
        "Liest Kontostände, Journal und Markttransaktionen der Corporation-Wallets für die Finanzseiten (braucht Accountant oder Junior Accountant).",
      divisions: "Liest die Namen der Wallet-Divisionen der Corporation (braucht Director).",
    },
    jobs: {
      transactions: "Wallet-Transaktionen",
      fees: "Wallet-Steuern und -Gebühren",
      corporationWallets: "Corporation-Wallets",
      corporationDivisions: "Namen der Wallet-Divisionen",
    },
    permissionGroup: "Finanzen",
    permissions: {
      corpView: {
        label: "Corporation-Wallets ansehen",
        description: "Kontostände, Einnahmen, Ausgaben und das Wallet-Journal der Heimat-Corporation.",
      },
    },
    navSection: "Finanzen",
    nav: {
      corporationWallet: "Corporation-Wallet",
      journal: "Corp-Wallet-Journal",
    },
  },

  corp: {
    defaultDivisionName: (division: number) => (division === 1 ? "Hauptkonto" : `${division}. Wallet-Division`),
    metaTitle: {
      overview: "Corporation-Wallet",
      journal: "Corp-Wallet-Journal",
    },
    categories: {
      bounties: "Kopfgelder & ESS",
      corpTax: "Corporation-Steuer",
      market: "Markt",
      industry: "Industrie",
      planetary: "Planetar",
      contracts: "Verträge",
      missions: "Missionen & LP",
      rewards: "Belohnungen & Events",
      transfers: "Zahlungen & Spenden",
      structures: "Büros & Strukturen",
      character: "Versicherung & Klone",
      corpAdmin: "Corporation & Kriege",
      fines: "Strafen & Wetten",
      store: "Store & HyperNet",
      other: "Sonstiges",
    },
    flows: {
      all: "Alle",
      income: "Einnahmen",
      expense: "Ausgaben",
      transfer: "Umbuchungen",
    },
    buckets: {
      day: "Tag",
      week: "Woche",
      month: "Monat",
    },
    filters: {
      divisions: "Divisionen",
      categories: "Kategorien",
      flow: "Anzeigen",
      groupBy: "Gruppieren nach",
      reset: "Zurücksetzen",
    },
    noHomeCorp: {
      title: "Keine Heimat-Corporation festgelegt",
      body: "Corporation-Wallets werden für die Heimat-Corporation gelesen. Ein Admin kann sie unter Einstellungen festlegen.",
    },
    empty: {
      title: "Noch keine Wallet-Daten",
      body: (strong: (text: string) => ReactNode) => (
        <>
          Verknüpfe einen Charakter der Corporation mit Corporation-Zugriff (Meine Charaktere → „Mit Corporation-Zugriff
          verknüpfen“). Der Charakter braucht die Ingame-Rolle {strong("Accountant")} oder {strong("Junior Accountant")},
          um die Wallets zu lesen; ein {strong("Director")} liefert zusätzlich die Namen der Divisionen. Der erste Import
          läuft innerhalb weniger Minuten.
        </>
      ),
      action: "Meine Charaktere",
    },
    historySince: (date: string) => `Archiv seit ${date}`,
    lastSync: (when: string) => `letzter Import ${when}`,
    gaps: {
      title: "Das Archiv hat Lücken",
      body: "ESI hält nur etwa 30 Tage Wallet-Verlauf vor. Aus diesen Zeiträumen fehlen Einträge, weil länger niemand mit der Rolle Accountant ein gültiges Token hatte oder dazwischen mehr als 10.000 Einträge anfielen:",
      range: (division: string, from: string, to: string) => `${division}: ${from} – ${to}`,
    },

    overview: {
      description:
        "Kontostände, Einnahmen und Ausgaben aller Wallet-Divisionen. Keystar bewahrt das Journal dauerhaft auf; ESI liefert nur die letzten 30 Tage.",
      journalLink: "Corp-Wallet-Journal",
      tiles: {
        balance: "Kontostand",
        balanceHint: (when: string) => `Stand ${when}`,
        income: "Einnahmen",
        expenses: "Ausgaben",
        net: "Saldo",
        netHint: (income: string, expenses: string) => `${income} rein, ${expenses} raus`,
        transfers: "Zwischen Divisionen umgebucht",
        transfersHint: "Zählt weder als Einnahme noch als Ausgabe",
      },
      chartTitle: {
        day: "Einnahmen und Ausgaben pro Tag",
        week: "Einnahmen und Ausgaben pro Woche",
        month: "Einnahmen und Ausgaben pro Monat",
      },
      chartSubtitle: "Alle ausgewählten Divisionen; Umbuchungen zwischen Divisionen ausgenommen",
      divisions: {
        title: "Divisionen",
        subtitle: "Aktueller Kontostand und der gewählte Zeitraum",
      },
      columns: {
        division: "Division",
        balance: "Kontostand",
        income: "Einnahmen",
        expenses: "Ausgaben",
        transfers: "Umbuchungen",
        net: "Saldo",
      },
      how: {
        title: "So wird gerechnet",
        transfers:
          "ISK, die zwischen den eigenen Divisionen der Corporation verschoben werden, stehen in beiden Journalen. Sie gelten als Umbuchung und nie als Einnahme oder Ausgabe.",
        archive:
          "Der Worker importiert stündlich neue Journal-Einträge und Markttransaktionen und löscht sie nie, so wächst der Verlauf über das hinaus, was ESI vorhält.",
        times: "Tage sind EVE-Tage (UTC). Kontostände werden stündlich gelesen.",
      },
    },

    chart: {
      legend: "Legende",
      view: "Diagramm oder Tabelle",
      chart: "Diagramm",
      table: "Tabelle",
      income: "Einnahmen",
      expenses: "Ausgaben",
      net: "Saldo",
      partial: "unvollständig",
    },

    journal: {
      description: "Alle Einträge der Corporation-Wallets, neueste zuerst.",
      overview: "Übersicht",
      entries: (count: number, value: ReactNode) => (
        <>
          {value} {count === 1 ? "Eintrag" : "Einträge"}
        </>
      ),
      pageOf: (page: number, pages: number) => `Seite ${n(page)} von ${n(pages)}`,
      empty: "Keine Journal-Einträge passen zu diesen Filtern.",
      transfer: "Umbuchung",
      unknownParty: "—",
      columns: {
        date: "Datum",
        division: "Division",
        type: "Art",
        from: "Von",
        to: "An",
        amount: "Betrag",
        balance: "Kontostand",
        details: "Details",
      },
      pagination: "Seitennavigation",
      previous: "Zurück",
      next: "Weiter",
    },
  },
};
