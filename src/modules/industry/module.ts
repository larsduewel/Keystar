import { Factory } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const INDUSTRY_JOBS_SCOPE = "esi-industry.read_character_jobs.v1";
/** Names player structures that jobs run in (needs docking access of the character). */
export const STRUCTURES_SCOPE = "esi-universe.read_structures.v1";
/** Both scopes are turned on and off together from the industry access page. */
export const INDUSTRY_SCOPES = [INDUSTRY_JOBS_SCOPE, STRUCTURES_SCOPE] as const;
export const INDUSTRY_MANAGE_HREF = "/industry/settings";

export const INDUSTRY_PERMISSIONS = {
  viewOwn: "industry.view.own",
} as const;

/**
 * Industry: the industry jobs of the viewer's own characters (manufacturing, research, copying, invention,
 * reactions) with their progress and completion times. The scopes are optional per character, enabled on the
 * industry access page, so nobody is asked for them at sign-up. There is no corporation-wide view: a member's jobs
 * are only shown to the member.
 */
export const industryModule: KeystarModule = {
  id: "industry",
  name: "Industry",
  description: "Industry jobs of your own characters with progress and completion times.",
  scopes: [
    {
      scope: INDUSTRY_JOBS_SCOPE,
      level: "character",
      optional: true,
      manageHref: INDUSTRY_MANAGE_HREF,
      managePermission: INDUSTRY_PERMISSIONS.viewOwn,
      reason: (t) => t.industry.module.scopes.jobs,
      label: (t) => t.industry.module.scopes.jobsLabel,
    },
    {
      scope: STRUCTURES_SCOPE,
      level: "character",
      optional: true,
      manageHref: INDUSTRY_MANAGE_HREF,
      managePermission: INDUSTRY_PERMISSIONS.viewOwn,
      reason: (t) => t.industry.module.scopes.structures,
      label: (t) => t.industry.module.scopes.structuresLabel,
    },
  ],
  permissions: [
    {
      key: INDUSTRY_PERMISSIONS.viewOwn,
      label: (t) => t.industry.module.permissions.viewOwn.label,
      description: (t) => t.industry.module.permissions.viewOwn.description,
      group: (t) => t.industry.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      // Shares the mining module's section; the tone is declared there.
      id: "industry",
      label: (t) => t.mining.module.navSection,
      order: 10,
      items: [
        {
          href: "/industry",
          label: (t) => t.industry.module.nav.jobs,
          icon: Factory,
          help: (t) => t.industry.module.help.jobs,
          ownDataOnly: true,
          anyPermission: [INDUSTRY_PERMISSIONS.viewOwn],
        },
      ],
    },
  ],
};
