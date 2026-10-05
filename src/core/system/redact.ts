import { createHash, randomBytes } from "node:crypto";

/**
 * Scrubs free text (job errors) before it goes into a support package. Anything
 * that may identify a pilot, corporation or instance is replaced by a marker,
 * and the redactor counts what it removed so the package can say so.
 */
export type RedactionRule = "token" | "url" | "email" | "host" | "eveId" | "name";

const RULES: { rule: RedactionRule; pattern: RegExp; replacement: string; keep?: RegExp }[] = [
  // JWTs (ESI access tokens) and anything sent as a bearer token.
  { rule: "token", pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, replacement: "[token]" },
  { rule: "token", pattern: /\bBearer\s+[\w.~+/=-]+/gi, replacement: "Bearer [token]" },
  // URLs before IDs, so a URL counts once; ESI paths keep their shape with the IDs scrubbed below.
  { rule: "url", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, replacement: "[url]" },
  { rule: "email", pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, replacement: "[email]" },
  // Host names and IPv4 addresses (getaddrinfo ENOTFOUND db.example.com). Identifiers with `_` never match.
  { rule: "host", pattern: /\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b|\b\d{1,3}(?:\.\d{1,3}){3}\b/gi, replacement: "[host]" },
  // IPv6: anything with "::", or all eight groups ("::1", "fd00::12", "2001:0:0:0:0:0:0:1").
  {
    rule: "host",
    pattern: /(?<![\w:.])(?:[0-9a-f]{0,4}:)*:(?::?[0-9a-f]{1,4})*(?:%\w+)?(?![\w:])|(?<![\w:.])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi,
    replacement: "[host]",
    keep: /^:+$|^[^:]*:[^:]*$/,
  },
  // Bare host names after network error codes (getaddrinfo ENOTFOUND db, connect ECONNREFUSED keystar-db:5432)
  // and Postgres' "for host": Docker service names have no dots, so the rule above can't see them.
  {
    rule: "host",
    pattern: /\b((?:getaddrinfo|ENOTFOUND|EAI_AGAIN|EAI_FAIL|EHOSTUNREACH|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\s+|for host\s+["']?)(?!\[host\])(?!E[A-Z_]+\b)([a-z0-9][\w.-]*)/gi,
    replacement: "$1[host]",
  },
  // Character, corporation, alliance and structure IDs have 6+ digits; HTTP statuses and counts don't.
  { rule: "eveId", pattern: /\b\d{6,}\b/g, replacement: "[id]" },
  // Quoted text is usually a name ("Some Pilot"). Identifiers with `_`, `.` or `:` stay: EVE names
  // can't contain those, and table, column and key names (relation "sync_jobs") are needed to debug.
  // Markers from the rules above ("[host]") stay too.
  { rule: "name", pattern: /"[^"\n]{1,80}"|'[^'\n]{1,80}'/g, replacement: '"[name]"', keep: /^["'](?:[a-z0-9]+(?:[_.:][a-z0-9]+)+|\[[a-z]+\])["']$/i },
];

export interface Redactor {
  scrub(text: string): string;
  /** Hashes an identifier (worker id, …) so it stays consistent within one package but can't be linked across packages. */
  hash(value: string): string;
  counts(): Record<RedactionRule, number>;
}

export function createRedactor(salt: string = randomBytes(16).toString("hex")): Redactor {
  const counts: Record<RedactionRule, number> = { token: 0, url: 0, email: 0, host: 0, eveId: 0, name: 0 };
  return {
    scrub(text) {
      let out = text;
      for (const { rule, pattern, replacement, keep } of RULES) {
        out = out.replace(pattern, (match, ...groups: unknown[]) => {
          if (keep?.test(match)) return match;
          counts[rule]++;
          // `$1` keeps a rule's context (the error code before a bare host name).
          return replacement.replace("$1", typeof groups[0] === "string" ? groups[0] : "");
        });
      }
      return out;
    },
    hash(value) {
      return `h:${createHash("sha256").update(salt).update(value).digest("hex").slice(0, 10)}`;
    },
    counts: () => ({ ...counts }),
  };
}

/**
 * Normalises a scrubbed error so that runs differing only in numbers (durations,
 * retry counts, timestamps) group into one signature.
 */
export function errorSignature(scrubbed: string): string {
  return scrubbed
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "[time]")
    .replace(/\b\d+(?:\.\d+)?\s*(ms|s|seconds?)\b/g, "[n] $1")
    .slice(0, 300);
}
