/* eslint-disable @next/next/no-img-element */
import type { Theme } from "@/theme/config";

/**
 * CCP's official "LOG IN with EVE Online" button (https://docs.esi.evetech.net/docs/sso/): CCP asks third-party
 * applications to use these images wherever they send a pilot to the EVE SSO, so the login looks the same everywhere.
 * The black button sits on the dark theme, the white one on the light theme. A plain anchor, because the browser
 * has to follow the SSO redirect.
 */
export function EveSsoButton({ href, label, theme, className }: { href: string; label: string; theme: Theme; className?: string }) {
  const src = theme === "light" ? "/eve-sso-login-white-large.png" : "/eve-sso-login-black-large.png";
  return (
    <a
      href={href}
      className={
        "inline-block rounded-md transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]" +
        (className ? ` ${className}` : "")
      }
    >
      <img src={src} alt={label} width={270} height={45} className="block h-[45px] w-[270px] max-w-full rounded-md" />
    </a>
  );
}
