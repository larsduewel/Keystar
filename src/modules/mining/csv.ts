const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * One CSV cell. Quotes where needed and neutralises spreadsheet formula
 * injection in text (names), but leaves plain numbers such as a negative
 * security status (`-0.45`) untouched so they stay numeric in spreadsheets.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  const safe = /^[=+\-@]/.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}
