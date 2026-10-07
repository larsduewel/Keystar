import { Mail } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const MAIL_SCOPE = "esi-mail.read_mail.v1";
export const MAIL_JOB_KEY = "social.character-mail";

export const SOCIAL_PERMISSIONS = {
  mail: "social.mail",
} as const;

/**
 * Social: what ESI groups under `char-social` (mail today; calendar, contacts
 * and standings would share its rate budget). Mail is private, so the scope is
 * opt-in per character and mail is only ever shown to the account that owned
 * the character when it was imported. Read-only: Keystar never changes mail.
 */
export const socialModule: KeystarModule = {
  id: "social",
  name: "Social",
  description: "EVE mail of characters whose owner opts in, read-only.",
  scopes: [
    {
      scope: MAIL_SCOPE,
      level: "character",
      optional: true,
      manageHref: "/mail",
      managePermission: SOCIAL_PERMISSIONS.mail,
      reason: (t) => t.social.module.scopes.readMail,
      label: (t) => t.social.module.scopes.readMailLabel,
    },
  ],
  permissions: [
    {
      key: SOCIAL_PERMISSIONS.mail,
      label: (t) => t.social.module.permissions.mail.label,
      description: (t) => t.social.module.permissions.mail.description,
      group: (t) => t.social.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  alerts: [
    {
      id: "social.mail",
      label: (t) => t.social.module.alerts.mail.label,
      hint: (t) => t.social.module.alerts.mail.hint,
      anyPermission: [SOCIAL_PERMISSIONS.mail],
    },
  ],
  nav: [
    {
      id: "social",
      label: (t) => t.social.module.navSection,
      order: 30,
      tone: "social",
      items: [
        {
          href: "/mail",
          label: (t) => t.social.module.nav.mail,
          icon: Mail,
          help: (t) => t.social.module.help.mail,
          ownDataOnly: true,
          anyPermission: [SOCIAL_PERMISSIONS.mail],
        },
      ],
    },
  ],
};
