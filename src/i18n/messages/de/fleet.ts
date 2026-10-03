import type { fleet as en } from "../en/fleet";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;
const count = (value: number, one: string, many: string) => `${n(value)} ${value === 1 ? one : many}`;

export const fleet: typeof en = {
  module: {
    nav: { fleet: "Live-Flotte" },
    permissionGroup: "Flotte",
    permissions: {
      view: { label: "Flotten ansehen", description: "Von Flottenbossen geteilte Live-Flotten und vergangene Flotten sehen." },
      track: { label: "Eigene Flotte teilen", description: "Den Worker die Flotte lesen lassen, in der einer deiner Charaktere Boss ist." },
    },
    scopes: {
      readFleet: "Liest die Flotte, in der du bist; als Flottenboss auch Mitglieder, Schiffe und Wings.",
    },
    jobs: { live: "Live-Flotte" },
  },
  roles: {
    fleet_commander: "Fleet Commander",
    wing_commander: "Wing Commander",
    squad_commander: "Squad Commander",
    squad_member: "Squad-Mitglied",
  },
  fallback: {
    character: (id: number) => `Charakter ${id}`,
    type: (id: number) => `Typ ${id}`,
    group: "Sonstige",
    system: "Unbekanntes System",
    wing: (id: number) => `Wing ${id}`,
    squad: (id: number) => `Squad ${id}`,
  },
  duration: (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h ? `${h} Std. ${m} Min.` : `${m} Min.`;
  },
  page: {
    metaTitle: "Live-Flotte",
    eyebrow: "Kampf",
    description: "Flottenzusammensetzung direkt aus dem ESI, geteilt vom Flottenboss.",
    autoRefresh: (seconds: number) => `Aktualisiert alle ${seconds} Sekunden`,
  },
  tracking: {
    title: "Flotte teilen",
    subtitle: "Das ESI zeigt Mitglieder und Wings nur dem Flottenboss. Starte das Tracking mit dem Charakter, der Boss hat.",
    start: "Flotte tracken",
    stop: "Stoppen",
    status: {
      idle: "Kein Tracking",
      tracking: "Tracking läuft",
      waiting: "Wartet auf den Worker",
      not_boss: "In einer Flotte, aber nicht Boss",
      no_fleet: "In keiner Flotte",
      stopped: "Kein Tracking",
    },
    checked: (when: string) => `geprüft ${when}`,
    enable: "Flottenzugriff aktivieren",
    enableHint: "Öffnet den EVE-Login, um diesem Charakter Flottenzugriff zu geben. Nur der Charakter, der Flottenboss ist, braucht ihn.",
    revoke: "Zugriff entziehen",
    revokeHint: "Öffnet den EVE-Login, um diesem Charakter den Flottenzugriff zu entziehen.",
    demo: "In der Demo nicht verfügbar",
    noCharacters: "Verknüpfe einen Charakter, um Flotten zu teilen.",
  },
  live: {
    empty: {
      title: "Keine Live-Flotte",
      body: "Sobald ein Flottenboss oben das Tracking startet, erscheint die Flotte hier innerhalb weniger Sekunden.",
    },
    title: (boss: string) => `Flotte von ${boss}`,
    freeMove: "Free Move",
    motd: "MOTD",
    stats: {
      members: "Mitglieder",
      ships: "Schiffstypen",
      systems: "Systeme",
      duration: "Läuft seit",
    },
    composition: { title: "Zusammensetzung", subtitle: "Mitglieder pro Schiffsklasse", ships: "Schiffe" },
    structure: { title: "Flottenstruktur", command: "Flottenkommando", commander: "Commander" },
    columns: { pilot: "Pilot", ship: "Schiff", system: "System", role: "Rolle", joined: "Beigetreten" },
    activity: {
      title: "Beitritte & Abgänge",
      joined: "beigetreten",
      left: "ausgetreten",
      none: "Bisher ist niemand beigetreten oder ausgetreten.",
    },
  },
  history: {
    title: "Vergangene Flotten",
    subtitle: "Über ein Tracking gelesene Flotten, neueste zuerst",
    empty: "Noch keine vergangenen Flotten.",
    columns: { started: "Beginn", boss: "Boss", duration: "Dauer", pilots: "Piloten" },
    participants: (value: number) => count(value, "Pilot", "Piloten"),
  },
};
