import type { Role } from "@/core/rbac/roles";
import type { AccessRow, DataVisibilityKey, ScopeGroups } from "./access";
import type { WhatsNewDigest } from "./onboarding";

/** Everything the help dialog needs from the server, resolved to text (serialisable props). */
export interface HelpData {
  version: string;
  user: { name: string | null; role: Role; canManageSettings: boolean };
  /** Every sidebar page, including ones the viewer can't open. */
  access: AccessRow[];
  visibility: { key: DataVisibilityKey; minRole: Role | null }[];
  scopes: ScopeGroups;
  instance: {
    homeCorp: string | null;
    autoApproveCorp: boolean;
    autoApproveAlliance: boolean;
    /** An Anthropic API key is set: Claude writes situation reports and intel briefings. */
    ai: boolean;
    /** Days kept before automatic cleanup. */
    retention: { appraisals: number; scans: number; pilots: number; killmails: number; sessions: number };
  };
  /** The newest release with highlights for the viewer, for "What's new" by hand. */
  latest: WhatsNewDigest | null;
}

export type HelpTopic = "page" | "basics" | "scopes" | "data" | "access";
