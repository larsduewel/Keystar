import type { Column, EntityRow } from "@/components/ui/sortable-table";
import type { Messages } from "@/i18n/messages";
import { zkillCharacter, zkillShip } from "./links";
import { efficiency, type PilotRow, type ShipRow } from "./queries";

/** Sortable-table columns and rows of the killboard's ship and pilot tables. */

/** Columns labelled in the viewer's language; `effective` ranks hulls by net ISK, `used` and `lost` by one side. */
export function tableColumns(t: Messages) {
  const { terms, columns: c } = t.killboard;
  const effective: Column[] = [
    { key: "kills", label: c.kd, format: "ratio", ratioKey: "losses", title: c.kdTitle },
    { key: "destroyed", label: terms.destroyed, format: "isk" },
    { key: "lost", label: terms.lost, format: "isk" },
    { key: "efficiency", label: c.eff, format: "pct", title: terms.iskEfficiency },
    { key: "net", label: terms.netIsk, format: "signedIsk" },
    { key: "killsDelta", label: c.delta7d, format: "delta", title: c.killsDeltaTitle },
  ];
  const used: Column[] = [
    { key: "kills", label: terms.kills, format: "int" },
    { key: "destroyed", label: terms.destroyed, format: "isk" },
    { key: "killsDelta", label: c.delta7d, format: "delta", title: c.killsDeltaTitle },
  ];
  const lost: Column[] = [
    { key: "losses", label: terms.losses, format: "int" },
    { key: "lost", label: c.iskLost, format: "isk" },
    { key: "lossesDelta", label: c.delta7d, format: "deltaInverse", title: c.lossesDeltaTitle },
  ];
  const pilots: Column[] = [
    { key: "kills", label: terms.kills, format: "int" },
    { key: "losses", label: terms.losses, format: "int" },
    { key: "finalBlows", label: terms.finalBlows, format: "int" },
    { key: "solo", label: terms.solo, format: "int" },
    { key: "destroyed", label: terms.destroyed, format: "isk" },
    { key: "lost", label: terms.lost, format: "isk" },
    { key: "efficiency", label: c.eff, format: "pct", title: terms.iskEfficiency },
    { key: "net", label: terms.netIsk, format: "signedIsk" },
    { key: "killsDelta", label: c.killsDelta, format: "delta" },
    { key: "lossesDelta", label: c.lossesDelta, format: "deltaInverse" },
  ];
  return { effective, used, lost, pilots };
}

export function shipEntityRow(s: ShipRow, t: Messages): EntityRow {
  return {
    id: s.typeId,
    name: s.name ?? t.killboard.fallback.type(s.typeId),
    image: "type",
    href: zkillShip(s.typeId),
    values: {
      kills: s.kills,
      losses: s.losses,
      destroyed: s.destroyed,
      lost: s.lost,
      efficiency: efficiency(s.destroyed, s.lost),
      net: s.destroyed - s.lost,
      killsDelta: s.killsDelta,
      lossesDelta: s.lossesDelta,
    },
  };
}

export function pilotEntityRow(p: PilotRow, t: Messages): EntityRow {
  return {
    id: p.characterId,
    name: p.name ?? t.killboard.fallback.character(p.characterId),
    image: "portrait",
    href: zkillCharacter(p.characterId),
    values: {
      kills: p.kills,
      losses: p.losses,
      finalBlows: p.finalBlows,
      solo: p.solo,
      destroyed: p.destroyed,
      lost: p.lost,
      efficiency: efficiency(p.destroyed, p.lost),
      net: p.destroyed - p.lost,
      killsDelta: p.killsDelta,
      lossesDelta: p.lossesDelta,
    },
  };
}
