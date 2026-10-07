import type { common as en } from "../en/common";
import type { WormholeClass } from "@/core/eve/systems";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const common: typeof en = {
  appTagline: "Selbst gehostetes Dashboard für EVE-Online-Corporations",
  unknown: "unbekannt",
  never: "nie",
  opensInNewTab: "(öffnet in neuem Tab)",
  ccpNotice:
    '© 2014 CCP hf. Alle Rechte vorbehalten. „EVE“, „EVE Online“, „CCP“ und alle zugehörigen Logos und Bilder sind Marken oder eingetragene Marken von CCP hf. Keystar ist ein Fan-Projekt und steht in keiner Verbindung zu CCP hf.',
  status: {
    ok: "OK",
    error: "Fehler",
    warning: "Warnung",
    running: "Läuft",
    pending: "Ausstehend",
  },
  roles: {
    guest: { label: "Gast", description: "Angemeldet, aber noch nicht freigeschaltet. Kann nur die eigenen Charaktere verwalten." },
    member: { label: "Mitglied", description: "Sieht nur Daten der eigenen Charaktere und ESI-Tokens." },
    viewer: { label: "Betrachter", description: "Lesezugriff auf alle Corporation-Daten." },
    contributor: { label: "Mitwirkender", description: "Wie Betrachter, plus geteilte Inhalte und manuelle Syncs." },
    director: { label: "Direktor", description: "Verwaltet Mitglieder, Freischaltungen und Rollen unterhalb von Direktor." },
    admin: { label: "Admin", description: "Volle Kontrolle, einschließlich App-Einstellungen und Admin-Vergabe." },
  },
  datePresets: {
    today: "Heute",
    yesterday: "Gestern",
    "7d": "7 Tage",
    "30d": "30 Tage",
    "90d": "90 Tage",
    mtd: "Dieser Monat",
    lm: "Letzter Monat",
    ytd: "Seit Jahresbeginn",
  },
  dateRange: {
    custom: "Eigener Zeitraum (EVE-Zeit)",
    from: "Von",
    to: "Bis",
    apply: "Zeitraum übernehmen",
  },
  systemPicker: {
    loading: "Systeme werden geladen …",
    noMatches: "Kein System mit diesem Namen bekannt – es wird beim Scan nachgeschlagen",
    empty: "Die Systemliste lädt noch im Hintergrund; gib den Namen ein",
    failed: "Die Systemliste konnte nicht geladen werden; gib den Namen ein",
    wormhole: "W-Space",
    /** Short tag for a wormhole system's class, read from its region. */
    wormholeClass: {
      c1: "C1",
      c2: "C2",
      c3: "C3",
      c4: "C4",
      c5: "C5",
      c6: "C6",
      thera: "Thera",
      c13: "C13",
      drifter: "Drifter",
    } satisfies Record<WormholeClass, string>,
  },
  multiSelect: {
    all: "Alle",
    search: (label: string) => `${label} durchsuchen …`,
    selectAll: "Alle auswählen",
    selectMatches: "Treffer auswählen",
    clear: "Leeren",
    noMatches: "Keine Treffer",
    selected: (count: number) => `${n(count)} ausgewählt`,
    apply: (count: number) => (count ? `Übernehmen (${n(count)})` : "Übernehmen"),
  },
  toast: {
    region: "Benachrichtigungen",
    close: "Benachrichtigung schließen",
    undo: "Rückgängig",
  },
  delta: {
    vs: (period: string) => `ggü. ${period}`,
    noData: (period: string) => `Keine Daten für ${period}`,
  },
  table: {
    empty: "Nichts in diesem Zeitraum.",
    showFewer: "Weniger anzeigen",
    showAll: (count: number) => `Alle ${n(count)} anzeigen`,
  },
  copy: {
    copy: "Kopieren",
    copied: "Kopiert",
    failed: "Kopieren fehlgeschlagen",
    failedHint: "Kopieren fehlgeschlagen – markiere den Text und kopiere ihn von Hand",
  },
  error: {
    title: "Etwas ist schiefgelaufen",
    unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
    retry: "Erneut versuchen",
    reference: (digest: string) => `Referenz: ${digest}`,
  },
  forbidden: {
    metaTitle: "Zugriff verweigert",
    title: "Du hast keinen Zugriff auf diese Seite",
    body: "Deine Keystar-Rolle enthält nicht die Berechtigung, die diese Seite braucht. Wende dich an einen Direktor oder Admin, wenn du das für einen Fehler hältst.",
    back: "Zurück zum Dashboard",
  },
};
