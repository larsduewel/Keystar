/** zKillboard deep links. Isomorphic. */
const ZKILL = "https://zkillboard.com";

export const zkillKill = (id: number) => `${ZKILL}/kill/${id}/`;
export const zkillCharacter = (id: number) => `${ZKILL}/character/${id}/`;
export const zkillCorporation = (id: number) => `${ZKILL}/corporation/${id}/`;
export const zkillAlliance = (id: number) => `${ZKILL}/alliance/${id}/`;
export const zkillShip = (id: number) => `${ZKILL}/ship/${id}/`;
export const zkillSystem = (id: number) => `${ZKILL}/system/${id}/`;

/** Battle report for a system around a time (zKillboard groups by the hour). */
export const zkillRelated = (systemId: number, time: Date | string) => {
  const d = typeof time === "string" ? new Date(time) : time;
  const stamp = d.toISOString().slice(0, 13).replace(/[-T]/g, "");
  return `${ZKILL}/related/${systemId}/${stamp}00/`;
};
