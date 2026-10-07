/**
 * Number and date formatting used across Keystar. Isomorphic and stable for a
 * given locale (no dependency on the server's or browser's own locale).
 *
 * UI code gets a formatter for the viewer's language from `getI18n()` (server)
 * or `useI18n()` (client). The English functions exported at the bottom are for
 * output that is not tied to a viewer: logs, reports, CSV, tests.
 */
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

interface LocaleRules {
  /** Tag passed to Intl for grouping and decimals. */
  number: string;
  /** Compact suffixes from largest to smallest, including any separating space. */
  compactUnits: [number, string][];
  percentSuffix: string;
  /** Tag for "02 Oct" style day labels. */
  shortDate: string;
  /** Full dates: "02 Oct 2026" / "02.10.2026". */
  date: Intl.DateTimeFormatOptions;
  relative: string;
  never: string;
  justNow: string;
  inAFewSeconds: string;
}

const RULES: Record<Locale, LocaleRules> = {
  en: {
    number: "en-US",
    compactUnits: [
      [1e12, "T"],
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ],
    percentSuffix: "%",
    shortDate: "en-GB",
    // Spelled-out month: a numeric 02/10/2026 reads as February to US readers.
    date: { day: "2-digit", month: "short", year: "numeric" },
    relative: "en",
    never: "never",
    justNow: "just now",
    inAFewSeconds: "in a few seconds",
  },
  de: {
    number: "de-DE",
    // As in CLDR's German compact notation, thousands are written out ("12.345") rather than
    // abbreviated. Non-breaking spaces keep number and unit together (chart ticks, table cells).
    compactUnits: [
      [1e12, "\u00a0Bio."],
      [1e9, "\u00a0Mrd."],
      [1e6, "\u00a0Mio."],
    ],
    // DIN 5008: a (non-breaking) space before the percent sign.
    percentSuffix: " %",
    shortDate: "de-DE",
    date: { day: "2-digit", month: "2-digit", year: "numeric" },
    relative: "de",
    never: "nie",
    justNow: "gerade eben",
    inAFewSeconds: "in wenigen Sekunden",
  },
};

export type Metric = "value" | "volume" | "quantity";

export interface Formatter {
  locale: Locale;
  /** Fixed number of decimals in the locale's notation: 1234.5 → "1,234.50" / "1.234,50". */
  number(value: number, digits?: number): string;
  /** 1234 → "1.23K" / "1.234", 9_870_000 → "9.87M" / "9,87 Mio.". */
  compact(value: number, digits?: number): string;
  isk(value: number, opts?: { compact?: boolean }): string;
  integer(value: number): string;
  volume(value: number, opts?: { compact?: boolean }): string;
  /** 0.123 → "12.3%" / "12,3 %". */
  percent(value: number, digits?: number): string;
  unitPrice(value: number): string;
  formatMetric(metric: Metric, value: number): string;
  relativeTime(date: Date | string | null | undefined, now?: Date, style?: Intl.RelativeTimeFormatOptions["style"]): string;
  /** YYYY-MM-DD → "02 Oct" / "02. Okt.". */
  shortDate(date: string): string;
  /** YYYY-MM-DD (or a timestamp, taken in EVE time) → "02 Oct 2026" / "02.10.2026". */
  date(date: Date | string): string;
  /** YYYY-MM-DD → "Friday" / "Freitag" (the day in EVE time, UTC). */
  weekday(date: string): string;
  /** EVE time: "02 Oct 2026 18:00 ET" / "02.10.2026 18:00 ET". */
  dateTime(date: Date | string | null | undefined): string;
}

export function createFormatter(locale: Locale): Formatter {
  const rules = RULES[locale];
  const fixed = (value: number, digits: number) =>
    value.toLocaleString(rules.number, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  const grouped = (value: number) => Math.round(value).toLocaleString(rules.number);

  const compact = (value: number, digits = 2): string => {
    const abs = Math.abs(value);
    for (const [size, suffix] of rules.compactUnits) {
      if (abs >= size) {
        const v = value / size;
        const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? Math.max(0, digits - 1) : digits;
        return `${fixed(v, d)}${suffix}`;
      }
    }
    // Below the smallest unit: whole numbers (grouped, e.g. German "12.345"), one decimal under 10.
    return abs >= 1000 ? grouped(value) : fixed(value, abs > 0 && abs < 10 && !Number.isInteger(value) ? 1 : 0);
  };

  const isk = (value: number, opts: { compact?: boolean } = {}) =>
    opts.compact === false ? `${grouped(value)} ISK` : `${compact(value)} ISK`;
  const volume = (value: number, opts: { compact?: boolean } = {}) =>
    opts.compact === false ? `${grouped(value)} m³` : `${compact(value)} m³`;
  // A bare YYYY-MM-DD is the EVE (UTC) day; anything longer is a timestamp.
  const toDate = (date: Date | string) =>
    typeof date !== "string" ? date : new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  const fullDate = (date: Date | string) => toDate(date).toLocaleDateString(rules.shortDate, { ...rules.date, timeZone: "UTC" });

  return {
    locale,
    number: (value, digits = 0) =>
      value.toLocaleString(rules.number, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    compact,
    isk,
    integer: grouped,
    volume,
    percent: (value, digits = 1) => `${fixed(value * 100, digits)}${rules.percentSuffix}`,
    unitPrice: (value) => (value >= 1000 ? `${compact(value)} ISK` : `${fixed(value, 2)} ISK`),
    formatMetric: (metric, value) => (metric === "value" ? isk(value) : metric === "volume" ? volume(value) : compact(value)),
    relativeTime(date, now = new Date(), style = "long") {
      if (!date) return rules.never;
      const d = typeof date === "string" ? new Date(date) : date;
      const diff = (d.getTime() - now.getTime()) / 1000;
      const abs = Math.abs(diff);
      const rtf = new Intl.RelativeTimeFormat(rules.relative, { numeric: "auto", style });
      if (abs < 45) return diff < 0 ? rules.justNow : rules.inAFewSeconds;
      if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
      return rtf.format(Math.round(diff / 86400), "day");
    },
    shortDate(date) {
      const d = new Date(`${date}T00:00:00Z`);
      return d.toLocaleDateString(rules.shortDate, { day: "2-digit", month: "short", timeZone: "UTC" });
    },
    date: fullDate,
    weekday(date) {
      return new Date(`${date}T00:00:00Z`).toLocaleDateString(rules.shortDate, { weekday: "long", timeZone: "UTC" });
    },
    dateTime(date) {
      if (!date) return "—";
      const d = toDate(date);
      return `${fullDate(d)} ${d.toISOString().slice(11, 16)} ET`;
    },
  };
}

export const FORMATTERS: Record<Locale, Formatter> = { en: createFormatter("en"), de: createFormatter("de") };

/** Change vs. previous period, or null when there is no baseline. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

/** True if `date` is within the last `ms` milliseconds (request-time check for server components). */
export function isRecent(date: Date | string | null | undefined, ms: number): boolean {
  if (!date) return false;
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  return Date.now() - t < ms;
}

// English formatting for output that does not belong to a viewer (logs, reports, CSV).
export const { compact, isk, integer, volume, percent, unitPrice, formatMetric, relativeTime, shortDate, dateTime } =
  FORMATTERS[DEFAULT_LOCALE];
