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
    register: "New here? Register & grant ESI access",
    privacy: (site: ReactNode) => (
      <>
        Signing in only proves who you are — no ESI access is requested. Tokens are requested separately, are encrypted
        at rest, and you can revoke them any time at {site}.
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
    trademark:
      "EVE Online and the EVE logo are the registered trademarks of CCP hf. Keystar is a fan-made tool not affiliated with CCP.",
    license: "Keystar is free software under the AGPL-3.0",
    sourceCode: "Source code",
  },
  join: {
    metaTitle: "Join",
    eyebrow: "Keystar registration",
    titleWithCorp: (corp: string) => `Join ${corp} on Keystar`,
    title: "Register your characters",
    intro:
      "Log in with each character you want to register. Keystar will request read-only access to the following ESI data. Nothing can be changed in game, and you can revoke access at any time.",
    link: "Link a character with EVE Online",
    register: "Register with EVE Online",
    alts: (page: ReactNode) => <>Have alts? After registering, open {page} and link each one.</>,
    back: "Back to sign in",
  },
};
