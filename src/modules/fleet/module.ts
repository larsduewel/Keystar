import { Radar } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";
import { FLEET_SCOPE } from "./logic";

export const FLEET_PERMISSIONS = {
  view: "fleet.view",
  track: "fleet.track",
} as const;

export const fleetModule: KeystarModule = {
  id: "fleet",
  name: "Fleet",
  description: "Live fleet composition shared by fleet bosses through ESI, and a history of past fleets.",
  // Only the fleet boss's token can read members and wings, so the scope is
  // opt-in per character (enabled on the fleet page) rather than asked of everyone.
  scopes: [
    {
      scope: FLEET_SCOPE,
      level: "character",
      optional: true,
      manageHref: "/fleet",
      managePermission: FLEET_PERMISSIONS.track,
      label: (t) => t.fleet.module.scopes.readFleetLabel,
      reason: (t) => t.fleet.module.scopes.readFleet,
    },
  ],
  permissions: [
    {
      key: FLEET_PERMISSIONS.view,
      label: (t) => t.fleet.module.permissions.view.label,
      description: (t) => t.fleet.module.permissions.view.description,
      group: (t) => t.fleet.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: FLEET_PERMISSIONS.track,
      label: (t) => t.fleet.module.permissions.track.label,
      description: (t) => t.fleet.module.permissions.track.description,
      group: (t) => t.fleet.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      id: "combat",
      label: (t) => t.killboard.module.navSection,
      order: 15,
      items: [{ href: "/fleet", label: (t) => t.fleet.module.nav.fleet, icon: Radar, anyPermission: [FLEET_PERMISSIONS.view] }],
    },
  ],
};
