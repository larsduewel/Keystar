import type { whatsNew as en } from "../en/whats-new";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const whatsNew: typeof en = {
  updatedTitle: (version: string) => `Keystar auf v${version} aktualisiert`,
  latestTitle: (version: string) => `Neu in v${version}`,
  intro: "Die wichtigsten Änderungen dieser Version.",
  since: (from: string) => `Die wichtigsten Änderungen seit v${from}, der Version, die du zuletzt gesehen hast.`,
  kind: { new: "Neu", improved: "Verbessert" },
  open: "Öffnen",
  version: (version: string) => `v${version}`,
  more: (count: number) => `und ${n(count)} weitere${count === 1 ? "s Highlight" : " Highlights"}`,
  read: "Versionshinweise lesen",
  close: "Schließen",
  actionNeeded: {
    title: "Aktion nötig",
    intro: "Damit alles in diesem Update funktioniert, muss, wer diesen Keystar-Server betreibt:",
    link: (version: string) => `Upgrade-Hinweise zu v${version}`,
  },
  releases: {
    "0.15.0": {
      upgrade:
        "Die Scopes esi-clones.read_implants.v1 und esi-markets.read_character_orders.v1 (und esi-universe.read_structures.v1, falls er fehlt) zur EVE-Anwendung auf developers.eveonline.com hinzufügen. Bis dahin schlagen das Teilen der Skills und das Einschalten des Marktzugriffs mit invalid_scope fehl.",
      items: {
        gateCheck: {
          title: "Gate-Check",
          body: "Plane unter Kampf eine Route und sieh die letzten Kills an jedem Gate auf dem Weg, aktive Camps und wie wahrscheinlich ein Camp ist, wenn du ankommst.",
        },
        marketOrders: {
          title: "Marktaufträge",
          body: "Verfolge die Kauf- und Verkaufsaufträge deiner Charaktere mit Preis, Restmenge, Ort und Ablauf, dazu das ISK im Escrow. Schalte es pro Charakter auf der Zugriffsseite ein.",
        },
        remapOptimiser: {
          title: "Remap-Optimierer",
          body: "Sieh unter Piloten, mit welchem Neural Remap jeder Charakter seine Skill-Queue am schnellsten abschließt und wie viel Zeit das spart.",
        },
        miningAccess: {
          title: "Mining-Ledger nach Wahl",
          body: "Die Anmeldung fragt EVE nach keinem Zugriff mehr. Teile das Mining-Ledger pro Charakter auf der Seite Mining-Zugriff und schalte es dort auch wieder aus.",
        },
      },
    },
    "0.14.0": {
      upgrade:
        "Die Scopes esi-industry.read_character_jobs.v1 und esi-universe.read_structures.v1 zur EVE-Anwendung auf developers.eveonline.com hinzufügen. Bis dahin schlägt das Einschalten des Industrie-Zugriffs mit invalid_scope fehl.",
      items: {
        industryJobs: {
          title: "Industriejobs",
          body: "Verfolge Fertigung, Forschung, Invention und Reaktionen deiner Charaktere mit Fortschritt und Restzeit. Schalte es pro Charakter auf der Zugriffsseite ein.",
        },
        universeMap: {
          title: "3D-Universumskarte und Routenplanung",
          body: "Durchsuche die Sternkarte unter Kampf, plane die kürzeste Gate-Route mit den Gate-Kills der letzten zwei Stunden und prüfe Sprungreichweiten für Capitals und Black Ops.",
        },
        skillTimeline: {
          title: "Zeitleiste der Skill-Queue",
          body: "Die Queue jedes Charakters erscheint jetzt als ein Streifen wie die Trainingsleiste im Spiel, jeder Skill so breit wie die Zeit, die er noch braucht.",
        },
        miningOreTypes: {
          title: "Erzsorten im täglichen Mining-Diagramm",
          body: "Klicke im Diagramm „ISK pro Tag nach Ressource“ auf eine Ressource, um die Tage nach ihren Erzsorten wie Spodumain, Kernite und Scordite aufzuteilen.",
        },
      },
    },
  },
};
