import { createLucideIcon } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";
const StarMap = createLucideIcon("StarMap", [
  ["path", { d: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z", key: "map" }],
  ["path", { d: "M9 3v4m0 10v1M15 6v2m0 10v3", key: "folds" }],
  ["path", { d: "m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2L12 8Z", key: "star" }],
  ["path", { d: "M5.5 8h.01M18.5 16h.01", key: "stars" }],
]);
export const mapModule: KeystarModule = {
  id: "map", name: "Map", description: "Three-dimensional EVE universe map.", scopes: [],
  permissions: [{ key: "map.view", label: t => t.map.title, description: t => t.map.description, group: t => t.killboard.module.permissionGroup, defaultMinRole: "member" }],
  nav: [{ id: "combat", label: t => t.killboard.module.navSection, order: 15, tone: "combat", items: [{ href: "/map", label: t => t.map.title, icon: StarMap, anyPermission: ["map.view"] }] }],
};
