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
      reason: (t) => t.social.module.scopes.readMail,
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
  nav: [
    {
      id: "social",
      label: (t) => t.social.module.navSection,
      order: 30,
      items: [{ href: "/mail", label: (t) => t.social.module.nav.mail, icon: Mail, anyPermission: [SOCIAL_PERMISSIONS.mail] }],
    },
  ],
};
