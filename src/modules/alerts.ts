"use client";

import type { ComponentType } from "react";
import { LiveKills } from "./killboard/components/live-kills";
import { LiveMail } from "./social/components/live-mail";

export interface AlertFeed {
  /** Polls the module's live endpoint and renders its toasts (see `useLiveFeed`); mounted while the alert is on. */
  Feed: ComponentType;
  /** localStorage key of the on/off switch, for alerts that had one before this registry (default `ks_alerts_<id>`). */
  storageKey?: string;
}

/**
 * Client side of the live alerts a module declares (`alerts` in its module.ts):
 * the feed component for each alert id. Add a module's feeds here. The top bar's
 * Alerts menu shows a switch for every declared alert the user may get. See
 * "Live alerts" in docs/modules.md.
 */
export const ALERT_FEEDS: Record<string, AlertFeed> = {
  "killboard.kills": { Feed: LiveKills, storageKey: "ks_kill_alerts" },
  "social.mail": { Feed: LiveMail },
};
