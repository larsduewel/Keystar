import type { ReactNode } from "react";
import type { setup as en } from "../en/setup";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const setup: typeof en = {
  metaTitle: "Keystar einrichten",
  steps: {
    corporation: "Corporation",
    access: "Zugang",
    corporationData: "Corporation-Daten",
    invite: "Einladen",
  },
  progress: (step: number, total: number) => `Schritt ${n(step)} von ${n(total)}`,
  back: "Zurück",
  continue: "Weiter",
  corporation: {
    title: "Deine Heimat-Corporation",
    intro:
      "Keystar verfolgt die Mitglieder, die Mitgliederliste und die Raffinerien einer Corporation. Vorausgewählt ist die Corporation deines Charakters.",
    members: (count: number | null) =>
      count === null ? "? Mitglieder" : `${n(count)} ${count === 1 ? "Mitglied" : "Mitglieder"}`,
    otherId: "Andere Corporation-ID verwenden",
    otherIdPlaceholder: "z. B. 98765432",
    otherIdHint: "Ein Wert hier hat Vorrang vor der Auswahl oben.",
  },
  access: {
    title: "Wer Zugang bekommt",
    intro:
      "Alle melden sich mit EVE SSO an. Lege fest, wer automatisch freigeschaltet wird; alle anderen warten als Gast, bis ein Direktor sie freischaltet.",
    autoApproveCorp: (corp: string | null) =>
      corp ? `Mitglieder von ${corp} automatisch freischalten` : "Mitglieder der Heimat-Corporation automatisch freischalten",
    autoApproveCorpHint: (role: string) => `Sie starten mit der Rolle „${role}“ und sehen ihre eigenen Daten.`,
    autoApproveAlliance: "Auch Allianzmitglieder automatisch freischalten",
    autoApproveAllianceHint: "Praktisch, wenn Hauptcharaktere in einer anderen Corporation der Allianz sind.",
    valuation: "Erz bewerten nach",
  },
  corporationData: {
    title: "Corporation-Daten",
    intro: (role: (name: string) => ReactNode, page: string) => (
      <>
        Mondbohrer-Ledger und die Mitgliederliste der Corporation werden über einen Charakter mit der Rolle{" "}
        {role("Accountant")} oder {role("Director")} im Spiel gelesen. Das kannst du auch später unter {page} erledigen.
      </>
    ),
    accessGranted: "Corporation-Zugriff erteilt",
    link: "Charakter mit Corporation-Zugriff verknüpfen",
    skip: "Vorerst überspringen",
  },
  invite: {
    title: "Lade deine Mitglieder ein",
    intro:
      "Teile diesen Link im Corp-Chat oder in der MOTD. Er erklärt genau, was Keystar liest, und führt Piloten durch EVE SSO.",
    worker: "Der Sync-Worker übernimmt neue Charaktere innerhalb einer Minute; erste Mining-Ledger erscheinen kurz danach.",
    history: "ESI speichert Mining-Daten nur 30 Tage – Keystar behält alles ab heute.",
    settings: (path: string) => `Alles hier lässt sich später unter ${path} ändern.`,
    finish: "Einrichtung abschließen",
  },
};
