/**
 * Turns pasted EVE text into item names and quantities. Isomorphic and pure.
 *
 * Recognised, line by line:
 * - inventory / cargo / contract / survey scanner copies (tab separated:
 *   name, quantity, …) in English or German number format
 * - D-scan (type id, name, type, distance): counts each type once per line
 * - EFT fittings: the "[Ship, Fit name]" header, modules ("Module, Charge"
 *   counts the module), "Drone x5" lines; "[Empty … slot]" is skipped
 * - killmail item lines ("Tritanium, Qty: 1000 (Cargo)")
 * - free text: "Name x 10", "10 x Name", "10x Name", "10 Name", "Name 10"
 *
 * A line can be read in more than one way ("Cap Booster 800" is an item, not
 * 800 × "Cap Booster"), so each line yields candidates in order of preference;
 * name resolution picks the first one that is a real item.
 */

import { parseDscanLine } from "@/core/eve/dscan";

export interface Candidate {
  name: string;
  quantity: number;
}

export interface ParsedLine {
  /** 1-based line number in the input. */
  line: number;
  raw: string;
  candidates: Candidate[];
}

/** Most item lines one appraisal accepts; larger pastes are rejected, never truncated. */
export const MAX_LINES = 2000;

/** Non-empty lines in a paste, to check against MAX_LINES before appraising. */
export function countItemLines(text: string): number {
  return text.split(/\r\n?|\n/).filter((l) => l.trim()).length;
}

/**
 * Largest quantity one line may carry. EVE stacks stop at 2³¹ − 1; anything far
 * beyond is a typo or abuse, and MAX_LINES of these still sum to a safe integer.
 */
export const MAX_QUANTITY = 1e12;

/** Parses "1,000", "1.000" (German), "1 000", "1'000", "12" → integer; null if not a quantity or above MAX_QUANTITY. */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(/ /g, " ");
  if (!/^\d[\d.,' ]*$/.test(s)) return null;
  let n: number;
  // Thousand separators: groups of exactly three digits after the first group.
  if (/^\d{1,3}([.,' ]\d{3})+$/.test(s)) n = Number(s.replace(/[.,' ]/g, ""));
  else if (/^\d+$/.test(s)) n = Number(s);
  // A decimal value (quantities are whole numbers in EVE; round defensively).
  else n = Math.round(Number(s.replace(/\s/g, "").replace(",", ".")));
  return Number.isSafeInteger(n) && n <= MAX_QUANTITY ? n : null;
}

function cleanName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/\s*\*$/, "") // market "*" marker for items you own
    .replace(/\s*\((?:Copy|Original)\)$/i, "")
    .trim();
}

const QTY = String.raw`(\d[\d.,']*)`;

function freeText(text: string): Candidate[] {
  const t = cleanName(text);
  if (!t) return [];
  const out: Candidate[] = [];
  const push = (name: string, qty: string | null) => {
    const quantity = qty === null ? 1 : parseQuantity(qty);
    const n = cleanName(name);
    if (n && quantity && quantity > 0) out.push({ name: n, quantity });
  };

  let m: RegExpMatchArray | null;
  // Killmail: "Tritanium, Qty: 1000 (Cargo)" / "200mm AutoCannon II (Fitted)"
  if ((m = t.match(new RegExp(String.raw`^(.+?),\s*Qty:\s*${QTY}`, "i")))) push(m[1], m[2]);
  // "Name x 10" / "Name x10"
  if ((m = t.match(new RegExp(String.raw`^(.+?)\s+x\s*${QTY}$`, "i")))) push(m[1], m[2]);
  // "10 x Name" / "10x Name"
  if ((m = t.match(new RegExp(String.raw`^${QTY}\s*x\s+(.+)$`, "i")))) push(m[2], m[1]);
  // The whole line as a name ("Cap Booster 800" is an item).
  push(t.replace(/\s*\((?:Cargo|Fitted|Drone Bay|Fighter Bay|Implant|Ship Hangar|Fleet Hangar)\)$/i, ""), null);
  // "10 Name"
  if ((m = t.match(new RegExp(String.raw`^${QTY}\s+(.+)$`)))) push(m[2], m[1]);
  // "Name 10" (market multibuy)
  if ((m = t.match(new RegExp(String.raw`^(.+?)\s+${QTY}$`)))) push(m[1], m[2]);
  // EFT module with charge: "Module, Charge" → the module.
  if ((m = t.match(/^([^,]+),\s*[^,]+$/))) push(m[1], null);

  // De-duplicate while keeping order.
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.name.toLowerCase()}|${c.quantity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tabbed(cols: string[]): Candidate[] {
  const cells = cols.map((c) => c.trim());
  // D-scan: "<type id>\t<name>\t<type>\t<distance>" → one of that type.
  const dscan = parseDscanLine(cols.join("\t"));
  if (dscan) return [{ name: cleanName(dscan.typeName), quantity: 1 }];
  const name = cleanName(cells[0]);
  if (!name) return [];
  // Inventory, contract, survey scanner, multibuy: the quantity is the next
  // column; empty means a single (assembled) item.
  const qtyCell = cells[1] ?? "";
  const quantity = qtyCell === "" ? 1 : parseQuantity(qtyCell);
  const candidates: Candidate[] = [];
  if (quantity && quantity > 0) candidates.push({ name, quantity });
  candidates.push(...freeText(name).filter((c) => c.name.toLowerCase() !== name.toLowerCase()));
  return candidates;
}

export function parseAppraisalInput(text: string): ParsedLine[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ParsedLine[] = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/ /g, " ").trimEnd();
    if (!line.trim()) return;
    const trimmed = line.trim();
    // EFT: "[Empty High slot]" carries nothing; "[Rifter, My fit]" is the hull.
    if (/^\[empty .* slot\]$/i.test(trimmed)) return;
    const header = trimmed.match(/^\[([^,\]]+),[^\]]*\]$/);
    if (header) {
      out.push({ line: i + 1, raw: trimmed, candidates: [{ name: cleanName(header[1]), quantity: 1 }] });
      return;
    }
    const candidates = line.includes("\t") ? tabbed(line.split("\t")) : freeText(trimmed);
    out.push({ line: i + 1, raw: trimmed, candidates });
  });
  return out;
}

/** Every distinct candidate name, for resolving them in one batch. */
export function candidateNames(lines: ParsedLine[]): string[] {
  const names = new Map<string, string>();
  for (const l of lines) {
    for (const c of l.candidates) if (!names.has(c.name.toLowerCase())) names.set(c.name.toLowerCase(), c.name);
  }
  return [...names.values()];
}

export interface ResolvedItem {
  typeId: number;
  quantity: number;
}

/**
 * Picks the first candidate per line whose name resolved, and sums quantities
 * per type. Lines without a match are returned as unparsed.
 */
export function assignTypes(
  lines: ParsedLine[],
  resolve: (lowerName: string) => number | undefined,
): { items: ResolvedItem[]; unparsed: { line: number; raw: string }[] } {
  const totals = new Map<number, number>();
  const unparsed: { line: number; raw: string }[] = [];
  for (const l of lines) {
    const hit = l.candidates.find((c) => resolve(c.name.toLowerCase()) !== undefined);
    if (!hit) {
      unparsed.push({ line: l.line, raw: l.raw });
      continue;
    }
    const typeId = resolve(hit.name.toLowerCase())!;
    totals.set(typeId, (totals.get(typeId) ?? 0) + hit.quantity);
  }
  return { items: [...totals.entries()].map(([typeId, quantity]) => ({ typeId, quantity })), unparsed };
}
