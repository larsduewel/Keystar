/** Sidebar width preference; expanded unless the viewer collapsed it to the icon rail. */
export const SIDEBAR_COOKIE = "ks_sidebar";
export const SIDEBAR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
export function isSidebarCollapsed(value: unknown): boolean {
  return value === "collapsed";
}

/** Sidebar sections the viewer folded shut, as section ids joined by dots. */
export const NAV_SECTIONS_COOKIE = "ks_nav_closed";
const SECTION_ID = /^[a-z0-9_-]+$/i;
export function closedNavSections(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(".").filter((id) => SECTION_ID.test(id)))];
}
export function serializeClosedNavSections(ids: string[]): string {
  return ids.filter((id) => SECTION_ID.test(id)).join(".");
}
