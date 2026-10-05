/**
 * Parser for EVE survey scanner results (select all → copy in the scanner
 * window). One asteroid per line, tab separated:
 *
 *   Scordite III-Grade	8.904	1.335 m3	168.000,00 ISK	25 km      (German client)
 *   Scordite III-Grade	8,904	1,335 m3	168,000.00 ISK	25 km      (English client)
 *
 * Isomorphic and dependency-free so it can run as you paste.
 */

export interface SurveyRock {
  name: string;
  quantity: number;
  volume: number | null;
  /** The scanner's own ISK estimate (EVE average price). */
  value: number | null;
  distanceKm: number | null;
}

export interface SurveyParseResult {
  rocks: SurveyRock[];
  /** Lines that could not be understood (1-based line numbers). */
  skipped: { line: number; text: string }[];
}

const SPACES = /[\s  ']/g;

/**
 * Parses a number in either German ("168.000,00") or English ("168,000.00")
 * notation, also accepting spaces or apostrophes as thousands separators.
 * A lone separator followed by exactly three digits is a thousands separator,
 * because the scanner never shows three-decimal values.
 */
export function parseLocaleNumber(raw: string): number | null {
  const s = raw.replace(SPACES, "");
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else {
    const sep = lastDot !== -1 ? "." : lastComma !== -1 ? "," : null;
    if (!sep) normalized = s;
    else {
      const parts = s.split(sep);
      const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      normalized = isThousands ? parts.join("") : `${parts[0]}.${parts[1]}`;
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseWithUnit(cell: string, units: RegExp): number | null {
  const m = cell.trim().match(units);
  return m ? parseLocaleNumber(m[1]) : null;
}

const VOLUME_RE = /^([-\d.,\s  ']+)\s*m(?:3|³)$/i;
const ISK_RE = /^([-\d.,\s  ']+)\s*ISK$/i;
const DIST_RE = /^([-\d.,\s  ']+)\s*(km|m|AU)$/i;

function distanceKm(cell: string): number | null {
  const m = cell.trim().match(DIST_RE);
  if (!m) return null;
  const n = parseLocaleNumber(m[1]);
  if (n === null) return null;
  const unit = m[2].toLowerCase();
  return unit === "km" ? n : unit === "m" ? n / 1000 : n * 149_597_870.7;
}

export function parseSurveyScan(text: string): SurveyParseResult {
  const rocks: SurveyRock[] = [];
  const skipped: SurveyParseResult["skipped"] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    // Tabs are what the client copies; fall back to runs of 2+ spaces.
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) {
      skipped.push({ line: index + 1, text: rawLine });
      return;
    }
    const [name, ...rest] = cells;
    let quantity: number | null = null;
    let volume: number | null = null;
    let value: number | null = null;
    let distance: number | null = null;
    for (const cell of rest) {
      if (volume === null && VOLUME_RE.test(cell)) volume = parseWithUnit(cell, VOLUME_RE);
      else if (value === null && ISK_RE.test(cell)) value = parseWithUnit(cell, ISK_RE);
      else if (distance === null && DIST_RE.test(cell)) distance = distanceKm(cell);
      else if (quantity === null) quantity = parseLocaleNumber(cell);
    }
    if (!name || quantity === null || /^\d/.test(name)) {
      skipped.push({ line: index + 1, text: rawLine });
      return;
    }
    rocks.push({ name, quantity, volume, value, distanceKm: distance });
  });

  return { rocks, skipped };
}

/* ---------------------------------------------------------------- Grades */

const GRADE_SUFFIX = /^(.*?)\s+(0|I|II|III|IV|V|X)-Grade$/i;
const ROMAN: Record<string, number> = { "0": 0.5, I: 1, II: 2, III: 3, IV: 4, V: 5, X: 10 };

/**
 * Variant prefixes and their rank: moon ore [better, best] per rarity
 * (e.g. Brimful / Glistening Zeolites), enriched ice (Thick Blue Ice) and
 * the anomaly ores (Abyssal / Hadal Talassonite).
 */
const VARIANT_PREFIXES: Record<string, number> = {
  brimful: 2,
  copious: 2,
  lavish: 2,
  replete: 2,
  bountiful: 2,
  glistening: 3,
  twinkling: 3,
  shimmering: 3,
  glowing: 3,
  shining: 3,
  enriched: 2,
  thick: 2,
  pristine: 2,
  smooth: 2,
  abyssal: 2,
  hadal: 3,
};

export interface GradeInfo {
  /** Ore family, e.g. "Scordite". */
  base: string;
  /** Display label for the grade, e.g. "III-Grade" or "Base". */
  grade: string;
  /** Sort key: base ore first, better grades after. */
  rank: number;
}

/** Splits a type name into its ore family and grade; a name can carry both a prefix and a suffix (Thick Blue Ice IV-Grade). */
export function oreGrade(name: string): GradeInfo {
  let base = name;
  const grades: string[] = [];
  let rank = 1;
  const suffix = name.match(GRADE_SUFFIX);
  if (suffix) {
    const roman = suffix[2].toUpperCase();
    base = suffix[1];
    grades.push(`${roman}-Grade`);
    rank = ROMAN[roman] ?? 1;
  }
  const [first, ...rest] = base.split(" ");
  const prefixRank = VARIANT_PREFIXES[first.toLowerCase()];
  if (rest.length && prefixRank) {
    base = rest.join(" ");
    grades.unshift(first);
    rank += prefixRank - 1;
  }
  return { base, grade: grades.join(" ") || "Base", rank };
}

/* ----------------------------------------------------------- Aggregation */

export interface GradeSummary {
  name: string;
  grade: string;
  rank: number;
  rocks: number;
  quantity: number;
  volume: number;
  scannerValue: number;
}

export interface OreSummary {
  base: string;
  rocks: number;
  quantity: number;
  volume: number;
  scannerValue: number;
  grades: GradeSummary[];
}

export function summariseSurvey(rocks: SurveyRock[]): OreSummary[] {
  const byBase = new Map<string, Map<string, GradeSummary>>();
  for (const r of rocks) {
    const g = oreGrade(r.name);
    const grades = byBase.get(g.base) ?? new Map<string, GradeSummary>();
    const s =
      grades.get(r.name) ??
      ({ name: r.name, grade: g.grade, rank: g.rank, rocks: 0, quantity: 0, volume: 0, scannerValue: 0 } as GradeSummary);
    s.rocks += 1;
    s.quantity += r.quantity;
    s.volume += r.volume ?? 0;
    s.scannerValue += r.value ?? 0;
    grades.set(r.name, s);
    byBase.set(g.base, grades);
  }
  return [...byBase.entries()]
    .map(([base, grades]) => {
      const list = [...grades.values()].sort((a, b) => a.rank - b.rank);
      return {
        base,
        grades: list,
        rocks: list.reduce((n, g) => n + g.rocks, 0),
        quantity: list.reduce((n, g) => n + g.quantity, 0),
        volume: list.reduce((n, g) => n + g.volume, 0),
        scannerValue: list.reduce((n, g) => n + g.scannerValue, 0),
      };
    })
    .sort((a, b) => b.scannerValue - a.scannerValue || b.volume - a.volume);
}
