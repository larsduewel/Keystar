import { LogOut, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { WhatsNewLink } from "@/components/help/whats-new-link";
import type { CurrentUser } from "@/core/auth/dal";
import { env } from "@/core/env";
import { navNews } from "@/core/help/onboarding";
import { navSections } from "@/core/modules/registry";
import { buildInfo, KEYSTAR_VERSION, versionLabel } from "@/core/version";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { Portrait } from "@/components/ui/eve-image";
import { RoleBadge } from "@/components/ui/badge";
import { ThemeSwitcher } from "./theme-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { NavSectionGroup, SidebarToggle } from "./sidebar-state";
import { NavLink } from "./nav-link";
import { RailFlyout } from "./rail-flyout";

export function visibleNav(user: CurrentUser) {
  const sections = navSections()
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.anyPermission || user.canAny(...i.anyPermission)) }))
    .filter((s) => s.items.length > 0);
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const hasNested = (href: string) => hrefs.some((h) => h !== href && h.startsWith(`${href}/`));
  return { sections, hasNested };
}

/**
 * Docked, full-height sidebar with a translucent glass surface and a hairline edge.
 * On phones it is an off-canvas drawer instead (`data-mobile-nav`, SidebarProvider).
 * From `md` up it collapses to an icon rail via `data-sidebar` on the shell root (see SectionScope);
 * hidden labels stay in the accessibility tree as `sr-only`, and hovering a section
 * or the portrait shows what the rail hides in a card beside it (RailFlyout).
 * Expanded, each section heading folds its links away (NavSectionGroup).
 */
export async function Sidebar({ user, corpTicker }: { user: CurrentUser; corpTicker: string | null }) {
  const { sections, hasNested } = visibleNav(user);
  const { t } = await getI18n();
  const build = buildInfo();
  const version = versionLabel(build, env().SOURCE_URL);
  // Pages new in this release get a dot until opened.
  const news = navNews({ current: KEYSTAR_VERSION, can: user.can });
  const newKey = (href: string) => (news?.hrefs.includes(href) ? `${news.version}:${href}` : undefined);
  const pilotLinkHover = "transition-colors hover:bg-surface-contrast/[0.06] focus-visible:bg-surface-contrast/[0.06]";
  const pilotInfo = (
    <>
      <div className="truncate text-[0.82rem] font-medium">{user.main?.name ?? t.shell.unknownPilot}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <RoleBadge role={user.role} />
        {corpTicker && <span className="font-mono text-3xs text-ink-3">[{corpTicker}]</span>}
      </div>
    </>
  );

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "relative z-30 w-[232px] shrink-0 self-stretch border-r border-surface-contrast/[0.07] bg-space-900/70 backdrop-blur-xl transition-[width] duration-300 ease-out md:group-data-[sidebar=collapsed]/shell:w-14 motion-reduce:transition-none",
        // Phones: an off-canvas drawer, opened from the top bar (MobileNavButton).
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:invisible max-md:-translate-x-full max-md:bg-space-900/95 max-md:shadow-2xl max-md:duration-200 max-md:motion-safe:transition-[translate,visibility]",
        // Visible at once when opening (so focus can move in), hidden only after sliding out.
        "group-data-[mobile-nav=open]/shell:max-md:visible group-data-[mobile-nav=open]/shell:max-md:translate-x-0 group-data-[mobile-nav=open]/shell:max-md:motion-safe:transition-[translate]",
      )}
    >
      {/* Preserve heading space so collapsed icons keep their vertical positions. */}
      <div className="sticky top-0 flex h-dvh flex-col ">
        <div className="flex h-14 shrink-0 items-center border-b border-surface-contrast/[0.07] px-4">
          <SidebarToggle />
        </div>
        <nav
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 md:group-data-[sidebar=collapsed]/shell:overflow-clip"
          aria-label={t.shell.mainNav}
        >
          {sections.map((section) => (
            <RailFlyout
              key={section.id}
              className="group"
              tone={section.tone}
              card={
                <>
                  <div className="eve-label px-2.5 pt-1.5 pb-1 text-2xs text-ink-3 group-has-[[aria-current=page]]:text-[color-mix(in_srgb,var(--section)_75%,var(--color-ink-3))]">
                    {section.label(t)}
                  </div>
                  <ul className="space-y-0.5" data-flyout-anchor>
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <NavLink href={item.href} exact={hasNested(item.href)} newKey={newKey(item.href)} inFlyout>
                          <item.icon className="size-4 shrink-0 opacity-75" aria-hidden />
                          <span className="truncate">{item.label(t)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </>
              }
            >
              {/* Each section's own colour, so a hovered icon shows it (NavLink). */}
              <div data-section-tone={section.tone ?? "none"}>
                <NavSectionGroup id={section.id} label={section.label(t)}>
                  <ul className="space-y-0.5" data-flyout-anchor>
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <NavLink href={item.href} exact={hasNested(item.href)} newKey={newKey(item.href)}>
                          <item.icon className="size-4 shrink-0 opacity-75" aria-hidden />
                          <span className="truncate md:group-data-[sidebar=collapsed]/shell:sr-only">{item.label(t)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </NavSectionGroup>
              </div>
            </RailFlyout>
          ))}
        </nav>
        <div className="shrink-0 space-y-1 px-3 pb-2 md:group-data-[sidebar=collapsed]/shell:px-2">
          <div className="flex flex-wrap items-center gap-1 md:group-data-[sidebar=collapsed]/shell:flex-col">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
          <WhatsNewLink
            href={version.href}
            prerelease={version.prerelease}
            className={cn(
              "flex items-center gap-1.5 px-2 font-mono text-3xs whitespace-nowrap md:group-data-[sidebar=collapsed]/shell:hidden",
              version.prerelease
                ? "rounded-md bg-warning/12 py-1 text-warning ring-1 ring-warning/30 ring-inset hover:bg-warning/20"
                : "text-ink-3 hover:text-ink-2",
            )}
            title={version.prerelease ? t.shell.unstableBuild(build.imageTag, build.commit, build.buildDate) : t.shell.releaseNotes}
          >
            {version.prerelease && <TriangleAlert className="size-3 shrink-0" aria-hidden />}
            <span className="truncate">{version.text}</span>
          </WhatsNewLink>
        </div>
        <div className="shrink-0 border-t border-surface-contrast/[0.07] p-3 md:group-data-[sidebar=collapsed]/shell:px-0">
          <div className="flex items-center gap-2.5 md:group-data-[sidebar=collapsed]/shell:flex-col md:group-data-[sidebar=collapsed]/shell:gap-2">
            <RailFlyout
              className="min-w-0 flex-1 md:group-data-[sidebar=collapsed]/shell:flex-none"
              card={
                <Link href="/characters" tabIndex={-1} className={cn("block rounded-md px-2.5 py-1.5", pilotLinkHover)} data-flyout-anchor>
                  {pilotInfo}
                </Link>
              }
            >
              {/* One link for portrait and name: the collapsed rail keeps a single tab stop. */}
              <Link
                href="/characters"
                title={t.shell.nav.characters}
                className={cn(
                  "-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1 md:group-data-[sidebar=collapsed]/shell:mx-0 md:group-data-[sidebar=collapsed]/shell:rounded-full md:group-data-[sidebar=collapsed]/shell:p-0",
                  pilotLinkHover,
                )}
              >
                <div className="shrink-0" data-flyout-anchor>
                  {user.main ? <Portrait id={user.main.characterId} size={32} /> : <div className="size-8 rounded-full bg-space-700" />}
                </div>
                <div className="min-w-0 flex-1 md:group-data-[sidebar=collapsed]/shell:sr-only">{pilotInfo}</div>
              </Link>
            </RailFlyout>
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                title={t.shell.signOut}
                aria-label={t.shell.signOut}
                className="grid size-7 place-items-center rounded-md text-ink-3 transition hover:bg-surface-contrast/[0.06] hover:text-ink"
              >
                <LogOut className="size-3.5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
