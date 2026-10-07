import type { ReactNode } from "react";
import type { trade as en } from "../en/trade";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const trade: typeof en = {
  module: {
    navSection: "Handel",
    nav: { appraisal: "Bewertung" },
    help: {
      appraisal:
        "Füge Fracht, einen Vertrag, ein Fitting, einen D-Scan oder eine Gegenstandsliste ein, um den Wert zu Kauf- und " +
        "Verkaufspreisen in Jita 4-4 aus dem ESI zu sehen, auf Wunsch zu einem Prozentsatz von Jita. Jede Bewertung bleibt ein Jahr lang erhalten, " +
        "mit einem Link, den alle mit Zugriff auf Bewertungen öffnen können; du kannst sie zu heutigen Preisen neu bewerten oder " +
        "deine eigenen löschen.",
    },
    permissionGroup: "Handel",
    permissions: {
      appraisal: {
        label: "Bewertungen nutzen",
        description: "Gegenstände zu Jita-Preisen bewerten und von anderen geteilte Bewertungen öffnen.",
      },
    },
    jobs: { housekeeping: "Bewertungen: Aufräumen" },
  },
  appraisal: {
    metaTitle: "Bewertung",
    eyebrow: "Handel",
    title: "Bewertung",
    description:
      "Bewerte Fracht, Verträge, Fittings, D-Scans oder Gegenstandslisten zu Preisen in Jita 4-4 und teile das Ergebnis per Link.",
    paste: "Gegenstände einfügen",
    recent: "Deine letzten Bewertungen",
    recentEmpty: "Noch nichts bewertet.",
    more: (count: number) => `+${n(count)}`,
  },
  delete: {
    button: "Löschen",
    hint: "Diese Bewertung löschen",
    confirm: "Diese Bewertung löschen? Ihr geteilter Link funktioniert dann nicht mehr.",
    deleted: "Bewertung gelöscht",
    failed: "Die Bewertung konnte nicht gelöscht werden",
    errors: {
      notOwned: "Nur wer eine Bewertung erstellt hat, kann sie löschen.",
      notFound: "Diese Bewertung wurde bereits gelöscht.",
      unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
    },
  },
  result: {
    description: (date: string, by: string | null) => `Preise in Jita 4-4 vom ${date}${by ? ` · von ${by}` : ""}`,
    newAppraisal: "Neue Bewertung",
    jitaSell: "Jita-Verkauf",
    jitaBuy: "Jita-Kauf",
    split: "Split",
    volume: "Volumen",
    volumeHint: (types: number, items: number) =>
      `${n(types)} ${types === 1 ? "Typ" : "Typen"} · ${n(items)} ${items === 1 ? "Gegenstand" : "Gegenstände"}`,
    ofJita: (percent: string) => `${percent} des Jita-Preises`,
    buy: "Kauf",
    sell: "Verkauf",
    share: "Teilen",
    shareSubtitle: "Alle, die in Keystar angemeldet sind und Bewertungen nutzen dürfen, können diesen Link öffnen.",
    items: "Gegenstände",
    itemsSorted: "Sortiert nach Jita-Verkaufswert",
    unpriced: (count: number) =>
      count === 1
        ? "1 Gegenstandstyp hat keinen Jita-Preis und zählt als 0."
        : `${n(count)} Gegenstandstypen haben keinen Jita-Preis und zählen als 0.`,
    item: "Gegenstand",
    columns: {
      quantity: "Menge",
      buy: "Kauf / Stück",
      sell: "Verkauf / Stück",
      totalBuy: "Kauf gesamt",
      totalSell: "Verkauf gesamt",
      volume: "Volumen",
    },
    unparsed: (count: number) => `Nicht erkannt (${n(count)})`,
    unparsedSubtitle: "Diese Zeilen passten zu keinem Gegenstandsnamen und wurden übersprungen.",
    again: "Erneut bewerten",
    againSubtitle: "Dieselbe Eingabe zu heutigen Preisen, als neue Bewertung.",
  },
  form: {
    placeholder: `Füge beliebigen Text aus EVE ein, zum Beispiel:

Tritanium\t12.000\tMineral
[Rifter, Roaming-Fit]
200mm AutoCannon II, EMP S
Warrior II x5
Nanite Repair Paste x 50
10 Cap Booster 800`,
    input: "Zu bewertende Gegenstände",
    priceAt: (input: ReactNode) => <>Preis: {input} % des Jita-Preises</>,
    submit: "Bewerten",
    submitting: "Wird bewertet …",
    note: "Preise: beste Kauf- und Verkaufsorders in Jita 4-4, per ESI aktualisiert, wenn sie älter als zwei Stunden sind. Gegenstände, die zum ersten Mal bewertet werden, brauchen einen Moment.",
  },
  errors: {
    empty: "Füge zuerst Gegenstände ein.",
    tooLong: (max: number) => `Der eingefügte Text ist zu lang (höchstens ${n(max)} Zeichen).`,
    tooManyLines: (lines: number, max: number) =>
      `Der eingefügte Text hat ${n(lines)} Zeilen; bewerte höchstens ${n(max)} auf einmal.`,
    tooManyTypes: (types: number, max: number) =>
      `Der eingefügte Text enthält ${n(types)} verschiedene Gegenstände; bewerte höchstens ${n(max)} auf einmal.`,
    esiUnavailable:
      "EVEs ESI ist gerade nicht erreichbar, daher konnten die Gegenstände nicht erkannt oder bewertet werden. Nichts wurde gespeichert; versuche es in ein paar Minuten erneut.",
    rateLimited: "Das sind viele Bewertungen in kurzer Zeit. Versuche es in ein paar Minuten erneut.",
    noItems:
      "Keine bekannten Gegenstände gefunden. Füge Gegenstandsnamen aus EVE ein (Inventar, Vertrag, Fitting, D-Scan oder Liste).",
  },
};
