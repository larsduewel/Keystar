import type { ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** First-start walkthrough for the first admin (outside the app frame). */
export const setup = {
  metaTitle: "Set up Keystar",
  steps: {
    corporation: "Corporation",
    access: "Access",
    corporationData: "Corporation data",
    invite: "Invite",
  },
  progress: (step: number, total: number) => `Step ${n(step)} of ${n(total)}`,
  back: "Back",
  continue: "Continue",
  corporation: {
    title: "Your home corporation",
    intro: "Keystar tracks the members, roster and refineries of one corporation. We picked the one your character is in.",
    members: (count: number | null) => (count === null ? "? members" : `${n(count)} member${count === 1 ? "" : "s"}`),
    otherId: "Use a different corporation ID",
    otherIdPlaceholder: "e.g. 98765432",
    otherIdHint: "A value here overrides the selection above.",
  },
  access: {
    title: "Who gets in",
    intro:
      "Everyone signs in with EVE SSO. Choose who is approved automatically; everyone else waits as a guest until a director approves them.",
    autoApproveCorp: (corp: string | null) => `Auto-approve members of ${corp ?? "the home corporation"}`,
    autoApproveCorpHint: (role: string) => `They start with the ${role} role and see their own data.`,
    autoApproveAlliance: "Also auto-approve alliance members",
    autoApproveAllianceHint: "Useful when mains live in another alliance corporation.",
    valuation: "Price ore at",
  },
  corporationData: {
    title: "Corporation data",
    /** `role` renders an in-game role name, `page` is the My Characters page name. */
    intro: (role: (name: string) => ReactNode, page: string) => (
      <>
        Moon-drill ledgers and the corporation roster are read through one character with the in-game{" "}
        {role("Accountant")} or {role("Director")} role. You can also do this later from {page}.
      </>
    ),
    accessGranted: "corporation access granted",
    link: "Link a character with corporation access",
    skip: "Skip for now",
  },
  invite: {
    title: "Invite your members",
    intro: "Share this link in corp chat or MOTD. It explains exactly what Keystar reads and walks pilots through EVE SSO.",
    worker: "The sync worker picks up new characters within a minute; first ledgers appear shortly after.",
    history: "ESI only keeps 30 days of mining — Keystar keeps everything from today on.",
    /** `path` is the settings page's place in the navigation, e.g. "Administration → Settings". */
    settings: (path: string) => `Everything here can be changed later under ${path}.`,
    finish: "Finish setup",
  },
};
