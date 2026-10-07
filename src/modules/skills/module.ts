import { Brain, GraduationCap } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const SKILLQUEUE_SCOPE = "esi-skills.read_skillqueue.v1";
export const SKILLS_SCOPE = "esi-skills.read_skills.v1";
/** Implants, for the remap optimiser: ESI's attributes include implant bonuses, so the base attributes need them. */
export const IMPLANTS_SCOPE = "esi-clones.read_implants.v1";
/** What a character shares: queue and skills. Characters that shared before implants were added stay shared. */
export const SKILLS_CORE_SCOPES = [SKILLQUEUE_SCOPE, SKILLS_SCOPE] as const;
/** Requested, switched on and off, and deleted together from the skills settings page. */
export const SKILLS_SCOPES = [...SKILLS_CORE_SCOPES, IMPLANTS_SCOPE] as const;
export const SKILLS_MANAGE_HREF = "/skills/settings";
export const SKILLS_REMAP_HREF = "/skills/remap";

export const SKILLS_PERMISSIONS = {
  viewOwn: "skills.view.own",
  viewCorp: "skills.view.corp",
} as const;

/**
 * Skills: skill queues, trained skills and attributes of characters whose owner opts in. The scopes are optional per
 * character; members who turn them on share their queue with whoever holds `skills.view.corp`. Attributes, implants
 * and per-skill dogma feed the remap optimiser; trained skills are kept for corporation skill plans.
 */
export const skillsModule: KeystarModule = {
  id: "skills",
  name: "Skills",
  description: "Skill queues, trained skills and attributes of characters whose owner opts in.",
  scopes: [
    {
      scope: SKILLQUEUE_SCOPE,
      level: "character",
      optional: true,
      manageHref: SKILLS_MANAGE_HREF,
      managePermission: SKILLS_PERMISSIONS.viewOwn,
      reason: (t) => t.skills.module.scopes.queue,
      label: (t) => t.skills.module.scopes.queueLabel,
    },
    {
      scope: SKILLS_SCOPE,
      level: "character",
      optional: true,
      manageHref: SKILLS_MANAGE_HREF,
      managePermission: SKILLS_PERMISSIONS.viewOwn,
      reason: (t) => t.skills.module.scopes.skills,
      label: (t) => t.skills.module.scopes.skillsLabel,
    },
    {
      scope: IMPLANTS_SCOPE,
      level: "character",
      optional: true,
      manageHref: SKILLS_MANAGE_HREF,
      managePermission: SKILLS_PERMISSIONS.viewOwn,
      reason: (t) => t.skills.module.scopes.implants,
      label: (t) => t.skills.module.scopes.implantsLabel,
    },
  ],
  permissions: [
    {
      key: SKILLS_PERMISSIONS.viewOwn,
      label: (t) => t.skills.module.permissions.viewOwn.label,
      description: (t) => t.skills.module.permissions.viewOwn.description,
      group: (t) => t.skills.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: SKILLS_PERMISSIONS.viewCorp,
      label: (t) => t.skills.module.permissions.viewCorp.label,
      description: (t) => t.skills.module.permissions.viewCorp.description,
      group: (t) => t.skills.module.permissionGroup,
      defaultMinRole: "director",
    },
  ],
  nav: [
    {
      id: "pilots",
      label: (t) => t.skills.module.navSection,
      order: 5,
      tone: "pilots",
      items: [
        {
          href: "/skills",
          label: (t) => t.skills.module.nav.queues,
          icon: GraduationCap,
          help: (t) => t.skills.module.help.queues,
          anyPermission: [SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp],
        },
        {
          href: SKILLS_REMAP_HREF,
          label: (t) => t.skills.module.nav.remap,
          icon: Brain,
          help: (t) => t.skills.module.help.remap,
          anyPermission: [SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp],
        },
      ],
    },
  ],
};
