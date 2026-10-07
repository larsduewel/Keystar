import { createLucideIcon } from "lucide-react";

/** The map's sidebar icon: a folded map with a star. */
export const StarMap = createLucideIcon("StarMap", [
  ["path", { d: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z", key: "map" }],
  ["path", { d: "M9 3v4m0 10v1M15 6v2m0 10v3", key: "folds" }],
  ["path", { d: "m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2L12 8Z", key: "star" }],
  ["path", { d: "M5.5 8h.01M18.5 16h.01", key: "stars" }],
]);
