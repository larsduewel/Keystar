import { describe, expect, it } from "vitest";
import { MODULES } from "@/core/modules/registry";
import { DEFAULT_LOCALE, LOCALES, negotiateLocale, resolveLocale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { FORMATTERS } from "@/lib/format";
import { parseSurveyScan } from "@/modules/mining/estimator/parse";
import { JOBS, jobLabel } from "@/modules/jobs";

describe("locale detection", () => {
  it("defaults to English without a usable preference", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(negotiateLocale(undefined)).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
    expect(negotiateLocale("*")).toBe("en");
    expect(negotiateLocale("fr-FR,fr;q=0.9,es;q=0.8")).toBe("en");
    expect(negotiateLocale(";;,q=,")).toBe("en");
  });

  it("picks German for German browsers, including regional variants", () => {
    expect(negotiateLocale("de")).toBe("de");
    expect(negotiateLocale("de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("de");
    expect(negotiateLocale("DE-at")).toBe("de");
    expect(negotiateLocale("de-CH;q=0.8, fr;q=0.9")).toBe("de");
  });

  it("respects quality values and order", () => {
    expect(negotiateLocale("en-US,en;q=0.9,de;q=0.8")).toBe("en");
    expect(negotiateLocale("fr;q=1, en;q=0.4, de;q=0.5")).toBe("de");
    expect(negotiateLocale("de;q=0, en")).toBe("en");
    expect(negotiateLocale("de;q=0.5, en;q=0.5")).toBe("de");
  });

  it("prefers an explicit choice over the browser and ignores unknown cookie values", () => {
    expect(resolveLocale("de", "en-US,en")).toBe("de");
    expect(resolveLocale("en", "de-DE,de")).toBe("en");
    expect(resolveLocale("xx", "de-DE")).toBe("de");
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });
});

type Tree = { [key: string]: unknown };

function shape(value: unknown, path: string, out: Map<string, string>) {
  if (typeof value === "function") out.set(path, `function/${value.length}`);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value as Tree)) shape(v, `${path}.${k}`, out);
  else out.set(path, typeof value === "string" && value.trim() === "" ? "empty string" : typeof value);
}

describe("dictionaries", () => {
  const shapes = Object.fromEntries(
    LOCALES.map((l) => {
      const out = new Map<string, string>();
      shape(MESSAGES[l], l, out);
      return [l, new Map([...out].map(([k, v]) => [k.slice(l.length), v]))];
    }),
  );

  it("have the same keys, and the same kind and arity of entry, in every language", () => {
    for (const l of LOCALES) expect(Object.fromEntries(shapes[l])).toEqual(Object.fromEntries(shapes.en));
  });

  it("have no empty strings", () => {
    for (const l of LOCALES) expect([...shapes[l]].filter(([, kind]) => kind === "empty string")).toEqual([]);
  });

  it("resolve every module and job text in every language", () => {
    for (const l of LOCALES) {
      const t = MESSAGES[l];
      const texts = MODULES.flatMap((m) => [
        ...m.nav.flatMap((s) => [s.label(t), ...s.items.flatMap((i) => [i.label(t), i.help(t)])]),
        ...m.permissions.flatMap((p) => [p.label(t), p.description(t), p.group(t)]),
        ...m.scopes.map((s) => s.reason(t)),
      ]);
      texts.push(...JOBS.map((j) => jobLabel(j.key, t)));
      for (const text of texts) expect(typeof text === "string" && text.trim().length > 0).toBe(true);
    }
    expect(jobLabel("removed.job", MESSAGES.de)).toBe("removed.job");
  });

  it("show a survey scan placeholder the parser accepts, in each client's number format", () => {
    for (const l of LOCALES) {
      const { rocks, skipped } = parseSurveyScan(MESSAGES[l].mining.estimator.scan.placeholder.replace("…", ""));
      expect(skipped).toEqual([]);
      expect(rocks).toEqual([{ name: "Scordite III-Grade", quantity: 8904, volume: 1335, value: 168_000, distanceKm: 25 }]);
    }
  });
});

describe("formatting", () => {
  const en = FORMATTERS.en;
  const de = FORMATTERS.de;

  it("keeps the established English output", () => {
    expect(en.compact(1234)).toBe("1.23K");
    expect(en.compact(12_345)).toBe("12.3K");
    expect(en.compact(-2500)).toBe("-2.50K");
    expect(en.compact(0.5)).toBe("0.5");
    expect(en.isk(9_870_000)).toBe("9.87M ISK");
    expect(en.isk(1_234_567, { compact: false })).toBe("1,234,567 ISK");
    expect(en.volume(2.5e12)).toBe("2.50T m³");
    expect(en.integer(1_234_567.4)).toBe("1,234,567");
    expect(en.percent(0.1234)).toBe("12.3%");
    expect(en.unitPrice(12.5)).toBe("12.50 ISK");
    expect(en.shortDate("2026-10-02")).toBe("02 Oct");
    expect(en.date("2026-10-02")).toBe("02 Oct 2026");
    expect(en.dateTime("2026-10-02T18:05:00Z")).toBe("02 Oct 2026 18:05 ET");
    expect(en.relativeTime(null)).toBe("never");
  });

  it("uses German separators, units and words", () => {
    const nb = "\u00a0";
    expect(de.compact(1234)).toBe("1.234");
    expect(de.compact(-2500)).toBe("-2.500");
    expect(de.compact(999_999)).toBe("999.999");
    expect(de.compact(0.5)).toBe("0,5");
    expect(de.compact(320e6, 1)).toBe(`320${nb}Mio.`);
    expect(de.isk(9_870_000)).toBe(`9,87${nb}Mio. ISK`);
    expect(de.isk(1.5e9)).toBe(`1,50${nb}Mrd. ISK`);
    expect(de.isk(1_234_567, { compact: false })).toBe("1.234.567 ISK");
    expect(de.unitPrice(4630)).toBe("4.630 ISK");
    expect(de.volume(2.5e12)).toBe(`2,50${nb}Bio. m³`);
    expect(de.integer(1_234_567)).toBe("1.234.567");
    expect(de.number(1234.5, 2)).toBe("1.234,50");
    expect(de.percent(0.1234)).toBe("12,3 %");
    expect(de.unitPrice(12.5)).toBe("12,50 ISK");
    expect(de.shortDate("2026-10-02")).toBe("02. Okt.");
    expect(de.date("2026-10-02")).toBe("02.10.2026");
    expect(de.dateTime("2026-10-02T18:05:00Z")).toBe("02.10.2026 18:05 ET");
  });

  it("names the weekday of the EVE (UTC) date in the viewer's language", () => {
    expect(en.weekday("2026-10-02")).toBe("Friday");
    expect(de.weekday("2026-10-02")).toBe("Freitag");
    expect(en.weekday("2027-01-01")).toBe("Friday");
    expect(de.weekday("2026-10-04")).toBe("Sonntag");
    // West of UTC, midnight of the 2nd is still the 1st locally; the ledger's day is the UTC one.
    const tz = process.env.TZ;
    process.env.TZ = "Pacific/Honolulu";
    try {
      expect(new Date("2026-10-02T00:00:00Z").getDay()).toBe(4);
      expect(en.weekday("2026-10-02")).toBe("Friday");
      expect(de.weekday("2026-10-02")).toBe("Freitag");
      expect(de.date("2026-10-02")).toBe("02.10.2026");
      // A timestamp late on the 2nd in EVE time is the 2nd, wherever the server runs.
      expect(en.date(new Date("2026-10-02T23:30:00Z"))).toBe("02 Oct 2026");
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("formats relative times in the viewer's language", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(de.relativeTime(null)).toBe("nie");
    expect(de.relativeTime(new Date("2026-10-02T11:59:50Z"), now)).toBe("gerade eben");
    expect(de.relativeTime(new Date("2026-10-02T11:55:00Z"), now)).toBe("vor 5 Minuten");
    expect(de.relativeTime(new Date("2026-10-01T12:00:00Z"), now)).toBe("gestern");
    expect(en.relativeTime(new Date("2026-10-02T11:55:00Z"), now)).toBe("5 minutes ago");
  });
});
