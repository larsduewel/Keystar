import type { ReactNode } from "react";

/** Sign-in and registration pages (outside the app frame). */
export const auth = {
  login: {
    metaTitle: "Sign in",
    tagline: "Corporation command for capsuleers.",
    errors: {
      sso_not_configured: "EVE SSO is not configured on this server yet (EVE_CLIENT_ID / EVE_CLIENT_SECRET).",
      invalid_state: "Your sign-in attempt expired or was tampered with. Please try again.",
      sso_denied: "The EVE SSO login was cancelled.",
      sso_failed: "Signing in with EVE Online failed.",
      provision: "We couldn't complete your sign-in.",
      not_member: "Only members of the corporation can sign up here.",
      demo_disabled: "Demo mode is disabled on this server.",
    },
    genericError: "Something went wrong.",
    signIn: "Log in with EVE Online",
    register: "New here? Register",
    /** `link` renders the link to EVE's authorised apps page. */
    privacy: (link: (text: string) => ReactNode) => (
      <>
        Signing in and registering only prove who you are — no ESI access is requested. Optional access is switched on
        per character later, its tokens are encrypted at rest, and you can revoke them any time in{" "}
        {link("Authorized Apps")} on the EVE developers site.
      </>
    ),
    setupTitle: "Server setup needed",
    setupApp: (site: ReactNode) => <>Create an application at {site} with this callback URL:</>,
    setupScopes: "Enable these scopes on the application:",
    setupEnv: (id: ReactNode, secret: ReactNode, file: ReactNode, command: ReactNode) => (
      <>
        Put the client ID and secret into {id} / {secret} in {file} and run {command}.
      </>
    ),
    setupFirstPilot: "Sign in — the first pilot becomes admin and is guided through the remaining setup.",
    demoTitle: "Demo mode — sign in as",
    license: "Keystar is free software under the AGPL-3.0",
    sourceCode: "Source code",
  },
  join: {
    metaTitle: "Join",
    eyebrow: "Keystar registration",
    titleWithCorp: (corp: string) => `Join ${corp} on Keystar`,
    title: "Register your characters",
    intro:
      "Registering only confirms who you are: Keystar asks EVE for no access to your data. Afterwards you choose for each character what Keystar may read. Access is read-only, nothing can be changed in game, and you can switch it off at any time.",
    optional: "Optional, per character, after you register",
    link: "Link a character with EVE Online",
    register: "Register with EVE Online",
    alts: (page: ReactNode) => <>Have alts? After registering, open {page} and link each one.</>,
    back: "Back to sign in",
  },
};
