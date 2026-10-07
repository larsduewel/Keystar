import { FORMATTERS } from "@/lib/format";
import type { market as en } from "../en/market";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export const market: typeof en = {
  module: {
    scopes: {
      orders: "Liest die offenen und kürzlich geschlossenen Kauf- und Verkaufsaufträge deiner Charaktere (optional).",
      structures: "Benennt die Spielerstrukturen, in denen deine Marktaufträge stehen (optional; gemeinsam mit dem Industrie-Zugriff).",
      ordersLabel: "Zugriff auf Marktaufträge",
    },
    jobs: {
      characterOrders: "Marktaufträge",
    },
    permissionGroup: "Markt",
    permissions: {
      viewOwn: {
        label: "Eigene Marktaufträge ansehen",
        description: "Kauf- und Verkaufsaufträge deiner eigenen Charaktere mit Preis, Menge, Ort und Ablauf.",
      },
    },
    nav: {
      orders: "Marktaufträge",
    },
    help: {
      orders: "Die Kauf- und Verkaufsaufträge deiner eigenen Charaktere: Gegenstand, Preis, verbleibende Menge, Station oder Struktur, wann jeder Auftrag erstellt wurde und wann er abläuft. Auf der Zugriffsseite wählst du, welche Charaktere ihre Aufträge teilen; Keystar liest sie alle 20 Minuten, und nur du siehst sie.",
    },
  },

  metaTitle: "Marktaufträge",
  page: {
    description: "Was deine Charaktere verkaufen und kaufen – zu welchem Preis, wo und bis wann.",
    synced: (when: string) => `Aktualisiert ${when}`,
    settings: "Zugriff",
  },

  views: {
    open: { label: "Offen", hint: "Gerade auf dem Markt" },
    closed: { label: "Geschlossen", hint: "Erfüllt, abgebrochen oder abgelaufen (ESI behält 90 Tage)" },
    all: { label: "Alle", hint: "Jeder Auftrag, den Keystar gesehen hat" },
  },
  sides: {
    all: "Kauf & Verkauf",
    sell: "Verkauf",
    buy: "Kauf",
  },
  outcomes: {
    open: "Offen",
    filled: "Erfüllt",
    closed: "Geschlossen",
    cancelled: "Abgebrochen",
    expired: "Abgelaufen",
  },
  closedHint: "Nicht mehr auf dem Markt: erfüllt oder im Spiel geschlossen, seit der Auftragsverlauf zuletzt gelesen wurde.",
  ranges: {
    station: "Station",
    solarsystem: "Sonnensystem",
    region: "Region",
    jumps: (jumps: number) => plural(jumps, "Sprung", "Sprünge"),
  },

  filters: {
    view: "Aufträge",
    side: "Seite",
    characters: "Charaktere",
    location: "Ort",
    reset: "Filter zurücksetzen",
    unknownLocation: (id: number) => `Struktur ${n(id)}`,
  },

  stats: {
    selling: "Verkauf",
    sellOrders: (count: number) => plural(count, "Verkaufsauftrag", "Verkaufsaufträge"),
    buying: "Kauf",
    buyOrders: (count: number) => plural(count, "Kaufauftrag", "Kaufaufträge"),
    escrow: "Hinterlegt",
    escrowHint: "ISK, die für deine Kaufaufträge hinterlegt sind",
    expiringSoon: "Laufen in 3 Tagen ab",
    nextExpiry: (when: string) => `Der nächste läuft ${when} ab`,
    byLocation: "Wo deine Aufträge stehen",
    byLocationHint: "Offene Aufträge nach Station oder Struktur, die meisten ISK zuerst",
    locationOrders: (count: number) => plural(count, "Auftrag", "Aufträge"),
  },

  table: {
    character: "Charakter",
    item: "Gegenstand",
    price: "Preis",
    quantity: "Menge",
    location: "Ort",
    expires: "Läuft ab",
    status: "Status",
    sell: "Verkauf",
    buy: "Kauf",
    corporation: "Corp",
    corporationHint: "Im Namen der Corporation erstellt",
    perUnit: "Pro Stück",
    total: (isk: string) => `${isk} gesamt`,
    escrow: (isk: string) => `${isk} hinterlegt`,
    of: (total: string) => `von ${total}`,
    minVolume: (min: string) => `mind. ${min}`,
    range: (range: string) => `Reichweite: ${range}`,
    expiresIn: (when: string) => `läuft ${when} ab`,
    issued: (when: string) => `erstellt ${when}`,
    issuedHint: "Wann der Auftrag erstellt oder zuletzt geändert wurde; eine Änderung im Spiel startet seine Laufzeit neu.",
    closed: (when: string) => `bemerkt ${when}`,
    pageOf: (page: number, pages: number) => `Seite ${n(page)} von ${n(pages)}`,
    previous: "Zurück",
    next: "Weiter",
    noLocation: "Unbekannte Struktur",
    noLocationHint: "Diese Struktur konnte nicht benannt werden: Der Charakter hat dort keine Andockrechte, oder sie existiert nicht mehr.",
  },

  coverage: {
    title: "Abdeckung",
    subtitle: "Welche deiner Charaktere ihre Aufträge melden",
    tracked: "Erfasste Charaktere",
    notEnabled: "Markt-Zugriff aus",
    notEnabledHint: "Schalte den Markt-Zugriff für diese Charaktere auf der Zugriffsseite ein, um ihre Aufträge zu sehen.",
    invalidTokens: "Widerrufene ESI-Token",
    lastSync: "Letzte Aktualisierung",
    note: "ESI aktualisiert offene Aufträge alle 20 Minuten und behält abgebrochene und abgelaufene Aufträge 90 Tage. Ein Auftrag, der zwischen zwei Aktualisierungen vom Markt verschwunden ist, erscheint als geschlossen.",
  },

  empty: {
    noCharacters: {
      title: "Keine Charaktere verknüpft",
      body: "Verknüpfe einen Charakter unter Meine Charaktere; seine Marktaufträge erscheinen hier nach der ersten Aktualisierung.",
      action: "Meine Charaktere",
    },
    notEnabled: {
      title: "Markt-Zugriff ist aus",
      body: "Wähle auf der Zugriffsseite, welche deiner Charaktere ihre Marktaufträge mit Keystar teilen. Aufträge erscheinen wenige Minuten nach dem Einschalten.",
      action: "Markt-Zugriff einschalten",
    },
    noOrders: {
      title: "Noch keine Marktaufträge",
      body: "Keiner deiner Charaktere hat einen Marktauftrag im Datenbestand. Aufträge erscheinen innerhalb von 20 Minuten, nachdem sie im Spiel erstellt wurden.",
    },
    filtered: "Kein Auftrag passt zu den Filtern.",
    noOpenOrders: "Keine offenen Aufträge.",
  },

  settings: {
    metaTitle: "Markt-Zugriff",
    description: "Lege für jeden Charakter fest, ob Keystar seine Marktaufträge lesen und die Strukturen benennen darf, in denen sie stehen.",
    title: "Markt-Zugriff pro Charakter",
    subtitle: "Das Einschalten autorisiert den Charakter bei EVE neu und fügt die beiden Markt-Scopes hinzu.",
    on: "Eingeschaltet",
    off: "Aus",
    revoked: "Token widerrufen",
    partial: "Teilweise eingeschaltet",
    enable: "Markt-Zugriff einschalten",
    stop: "Ausschalten",
    reauthorize: "Neu autorisieren",
    demo: "Im Demo-Modus nicht verfügbar",
    lastSync: (when: string) => `Letzte Aktualisierung ${when}`,
    firstSync: "Die erste Aktualisierung läuft in wenigen Minuten.",
    nothing: "Nichts gespeichert.",
    kept: "Marktaufträge von früher sind noch gespeichert.",
    deleteData: "Marktdaten löschen",
    deleteDataHint: "Entfernt die gespeicherten Marktaufträge dieses Charakters aus Keystar.",
    accessLabel: "Markt-Zugriff",
    toast: {
      deleted: (name: string) => `Gespeicherte Marktaufträge von ${name} gelöscht`,
      failed: (name: string) => `Die Marktaufträge von ${name} konnten nicht gelöscht werden`,
      errors: {
        forbidden: "Du hast keinen Zugriff mehr auf Marktaufträge in Keystar.",
        notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
        stillEnabled: "Schalte zuerst den Markt-Zugriff für diesen Charakter aus.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    notes: {
      scopes: "Keystar liest die offenen Aufträge des Charakters alle 20 Minuten sowie seine abgebrochenen und abgelaufenen Aufträge der letzten 90 Tage und benennt die Stationen und Strukturen, in denen sie stehen; Strukturen nur dort, wo der Charakter andocken darf. Nur du siehst die Aufträge deiner Charaktere.",
      stop: "Das Ausschalten beendet das Lesen in Keystar sofort; gespeicherte Aufträge bleiben, bis du sie löschst. Autorisiere den Charakter unter Meine Charaktere neu, um die Scopes auch aus seinem EVE-Token zu entfernen.",
      shared: "Der Industrie-Zugriff benennt Strukturen mit demselben Scope: Schaltest du einen der beiden aus, bleibt der Scope eingeschaltet, solange der andere an ist.",
    },
  },
};
