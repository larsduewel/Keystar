import "server-only";
import { SESSION_DAYS } from "@/core/auth/cookie";
import type { CurrentUser } from "@/core/auth/dal";
import { env } from "@/core/env";
import { allPermissions, allScopeRequirements, navSections } from "@/core/modules/registry";
import type { Settings } from "@/core/settings";
import { KEYSTAR_VERSION } from "@/core/version";
import type { Messages } from "@/i18n/messages";
import { DIGEST_RETENTION_DAYS, PILOT_RETENTION_DAYS, SCAN_RETENTION_DAYS } from "@/modules/intel/constants";
import { APPRAISAL_RETENTION_DAYS } from "@/modules/trade/appraisal/appraise";
import { accessRows, dataVisibility, roleGrants, scopeGroups } from "./access";
import { latestDigest, onboarding, type Onboarding } from "./onboarding";
import type { HelpData } from "./types";

/** The help dialog's data for the signed-in viewer (rendered by the app layout). */
export function buildHelpData(user: CurrentUser, settings: Settings, t: Messages, homeCorp: string | null): HelpData {
  const grants = roleGrants(allPermissions(), settings["permissions.overrides"]);
  const sourceUrl = env().SOURCE_URL;
  return {
    version: KEYSTAR_VERSION,
    user: { name: user.main?.name ?? null, role: user.role, canManageSettings: user.can("app.settings.manage") },
    access: accessRows(navSections(), t, { grants, canAny: user.canAny }),
    visibility: dataVisibility(grants),
    scopes: scopeGroups(allScopeRequirements(), t, user.can),
    instance: {
      homeCorp,
      autoApproveCorp: settings["access.autoApproveCorpMembers"],
      autoApproveAlliance: settings["access.autoApproveAllianceMembers"],
      ai: Boolean(env().ANTHROPIC_API_KEY),
      retention: {
        appraisals: APPRAISAL_RETENTION_DAYS,
        scans: SCAN_RETENTION_DAYS,
        pilots: PILOT_RETENTION_DAYS,
        killmails: DIGEST_RETENTION_DAYS,
        sessions: SESSION_DAYS,
      },
    },
    latest: latestDigest({ current: KEYSTAR_VERSION, can: user.can, sourceUrl }),
  };
}

/** What opens by itself for the viewer: the welcome tour, What's new, or nothing. */
export function viewerOnboarding(user: CurrentUser): Onboarding {
  return onboarding({ seenVersion: user.seenVersion, current: KEYSTAR_VERSION, can: user.can, sourceUrl: env().SOURCE_URL });
}
