import type { KeystarModule } from "@/core/modules/types";
import { StarMap } from "./icon";
export const mapModule: KeystarModule = {
  id: "map", name: "Map", description: "Three-dimensional EVE universe map.", scopes: [],
  permissions: [{ key: "map.view", label: t => t.map.title, description: t => t.map.description, group: t => t.killboard.module.permissionGroup, defaultMinRole: "member" }],
  nav: [{ id: "combat", label: t => t.killboard.module.navSection, order: 15, tone: "combat", items: [{ href: "/map", label: t => t.map.title, icon: StarMap, help: t => t.map.help, anyPermission: ["map.view"] }] }],
};
