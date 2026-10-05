import { env } from "@/core/env";

/**
 * How each environment variable may appear in System Info and the support package:
 * - `secret` / `private`: only whether it is set (private values like ESI_CONTACT aren't secret, but personal);
 * - `value`: the effective value;
 * - `endpoint`: the value only when it is the default, else "custom" (a fork's URL can name its owner);
 * - `url`: APP_URL, reduced to its scheme;
 * - `ids`: ADMIN_CHARACTER_IDS, reduced to a count.
 */
type ConfigKind = "secret" | "private" | "value" | "endpoint" | "url" | "ids";

const CONFIG: { name: string; kind: ConfigKind; optional?: boolean }[] = [
  { name: "NODE_ENV", kind: "value" },
  { name: "APP_URL", kind: "url" },
  { name: "APP_SECRET", kind: "secret" },
  { name: "DATABASE_URL", kind: "secret" },
  { name: "EVE_CLIENT_ID", kind: "private" },
  { name: "EVE_CLIENT_SECRET", kind: "secret" },
  { name: "ESI_CONTACT", kind: "private" },
  { name: "ESI_COMPATIBILITY_DATE", kind: "value" },
  { name: "ESI_BASE_URL", kind: "endpoint" },
  { name: "SSO_BASE_URL", kind: "endpoint" },
  { name: "SOURCE_URL", kind: "endpoint" },
  { name: "ADMIN_CHARACTER_IDS", kind: "ids", optional: true },
  { name: "ANTHROPIC_API_KEY", kind: "secret", optional: true },
  { name: "KILLBOARD_REPORT_MODEL", kind: "value" },
  { name: "INTEL_MODEL", kind: "value" },
  { name: "KEYSTAR_DEMO_MODE", kind: "value" },
  { name: "WORKER_CONCURRENCY", kind: "value" },
  { name: "LOG_LEVEL", kind: "value" },
  { name: "DB_POOL_SIZE", kind: "value", optional: true },
  { name: "SKIP_MIGRATIONS", kind: "value", optional: true },
  // Proxy URLs can hold credentials and an internal host: only whether they are set.
  { name: "HTTPS_PROXY", kind: "private", optional: true },
  { name: "HTTP_PROXY", kind: "private", optional: true },
  { name: "NO_PROXY", kind: "private", optional: true },
];

const DEFAULT_ENDPOINTS: Record<string, string> = {
  ESI_BASE_URL: "https://esi.evetech.net",
  SSO_BASE_URL: "https://login.eveonline.com",
  SOURCE_URL: "https://github.com/theragus/keystar",
};

export interface ConfigEntry {
  name: string;
  kind: ConfigKind;
  /** `set`: in the environment; `default`: unset, a default applies; `unset`: unset and nothing applies. */
  state: "set" | "default" | "unset";
  /** Only for `value` and `endpoint` kinds. */
  value?: string;
  /** `ids`: how many IDs are listed. */
  count?: number;
  /** `url`: whether APP_URL uses https. */
  https?: boolean;
}

export function collectConfig(): ConfigEntry[] {
  const effective = env() as unknown as Record<string, unknown>;
  return CONFIG.map(({ name, kind, optional }) => {
    const raw = process.env[name];
    const isSet = raw !== undefined && raw !== "";
    const value = effective[name] ?? (isSet ? raw : undefined);
    const hasValue = value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
    const state = isSet ? "set" : hasValue && !optional ? "default" : "unset";
    const entry: ConfigEntry = { name, kind, state };
    if (kind === "value" && value !== undefined) entry.value = String(value);
    if (kind === "endpoint") entry.value = String(value).replace(/\/+$/, "") === DEFAULT_ENDPOINTS[name] ? String(value) : "custom";
    if (kind === "ids") entry.count = Array.isArray(value) ? value.length : 0;
    if (kind === "url") entry.https = String(value).startsWith("https://");
    return entry;
  });
}

/** Whether APP_URL is the address the browser used; a mismatch breaks the SSO callback and cookies. */
export function appUrlMatches(origin: string | null): boolean | null {
  if (!origin) return null;
  try {
    return new URL(env().APP_URL).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** The address the browser used, as far as a reverse proxy passes it on (X-Forwarded-*, else Host). */
export function originFromHeaders(h: Headers): string | null {
  const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0].trim();
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(env().APP_URL).protocol.replace(":", "");
  return `${proto}://${host}`;
}
