/** EVE image server helpers (https://images.evetech.net). Isomorphic. */
const BASE = "https://images.evetech.net";

type Size = 32 | 64 | 128 | 256 | 512;

export const characterPortrait = (id: number, size: Size = 64) => `${BASE}/characters/${id}/portrait?size=${size}`;
export const corporationLogo = (id: number, size: Size = 64) => `${BASE}/corporations/${id}/logo?size=${size}`;
export const allianceLogo = (id: number, size: Size = 64) => `${BASE}/alliances/${id}/logo?size=${size}`;
export const typeIcon = (id: number, size: 32 | 64 = 32) => `${BASE}/types/${id}/icon?size=${size}`;
export const typeRender = (id: number, size: Size = 128) => `${BASE}/types/${id}/render?size=${size}`;

/**
 * Security status colours: the EVE client's blue (1.0) to dark red (0.1) steps, then one clear red for all of
 * null-sec (0.0 down to -1.0) where CCP uses purple, so the scale reads blue → red.
 */
export function securityColor(sec: number): string {
  const s = Math.round(sec * 10) / 10;
  if (s >= 1.0) return "#2c75e1";
  if (s >= 0.9) return "#399aeb";
  if (s >= 0.8) return "#4ecef8";
  if (s >= 0.7) return "#60dba3";
  if (s >= 0.6) return "#71e554";
  if (s >= 0.5) return "#f3fd82";
  if (s >= 0.4) return "#dc6d07";
  if (s >= 0.3) return "#ce440f";
  if (s >= 0.2) return "#bb1116";
  if (s > 0.0) return "#731f1f";
  return "#d0342c";
}

/** EVE rounds security for display: 0.05 → 0.1, but anything in (0, 0.05) shows as 0.0. */
export function displaySecurity(sec: number): string {
  if (sec > 0 && sec < 0.05) return "0.0";
  return (Math.round(sec * 10) / 10).toFixed(1);
}
