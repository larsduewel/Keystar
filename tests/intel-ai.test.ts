import { describe, expect, it, vi } from "vitest";
import { claudeBriefing, claudeDossier, sanitizeBriefing, type ClaudeClient } from "@/modules/intel/ai/claude";
import { briefingFacts, dossierFacts, factsHash, type FactsPilot } from "@/modules/intel/ai/facts";
import { MESSAGES } from "@/i18n/messages";
import { renderBriefing, renderDossier, templateBriefing, templateDossier, threatLevelOf } from "@/modules/intel/ai/template";
import type { DisplayNames } from "@/modules/intel/names";
import { scorePilot } from "@/modules/intel/score/composite";
import { DAY_MS } from "@/modules/intel/score/decay";
import { buildProfile } from "@/modules/intel/score/profile";
import { groupSummary } from "@/modules/intel/score/summary";

const now = new Date("2026-10-02T20:00:00Z");
const neutral = { cls: "neutral", value: null, source: null, via: null } as const;
const names: DisplayNames = {
  types: new Map([
    [22456, { name: "Sabre", groupId: 541 }],
    [587, { name: "Rifter", groupId: 25 }],
  ]),
  systems: new Map([[30002813, { name: "Tama", securityStatus: 0.3 }]]),
  entities: new Map(),
  tickers: new Map(),
};

function pilot(id: number, name: string, killsDaysAgo: number[]): FactsPilot {
  const digest = killsDaysAgo.map((d, i) => ({
    killmailId: id * 100 + i,
    killmailTime: new Date(now.getTime() - d * DAY_MS),
    solarSystemId: 30002813,
    locationId: 50000001,
    isLoss: false,
    shipTypeId: 22456,
    finalBlow: true,
    attackerCount: 3,
    totalValue: 80e6,
    solo: false,
    npc: false,
    otherCharacterId: 1,
    otherCorporationId: 2,
    otherAllianceId: null,
    otherShipTypeId: 587,
    allyIds: [],
    fittedTypeIds: [],
  }));
  const profile = buildProfile({
    stats: null,
    digest,
    coveredSince: new Date(now.getTime() - 60 * DAY_MS),
    typeGroups: new Map([[22456, 541]]),
    systemSecurity: new Map([[30002813, 0.3]]),
    corpHistory: null,
    birthday: new Date("2016-01-01T00:00:00Z"),
    securityStatus: -1,
    corporationId: 98000001,
    now,
  });
  const score = scorePilot(profile, { now, standing: neutral, history: null, historyAvailable: true, system: null, systemsInfo: new Map() });
  return {
    characterId: id,
    name,
    corporationTicker: "HOST",
    corporationName: "Hostile Corp",
    allianceName: null,
    standing: neutral,
    history: null,
    profile,
    score,
  };
}

const pilots = [pilot(1, "Sabre Guy", [0.2, 0.5, 1, 2, 3, 4, 5, 6]), pilot(2, "Quiet Guy", [])];
const summary = groupSummary(
  pilots.map((p) => ({ characterId: p.characterId, corporationId: 98000001, allianceId: null, standing: p.standing, score: p.score, profile: p.profile })),
  now,
);
const input = () => ({ scan: { pilotCount: 2, createdAt: now, system: "Tama" }, pilots, summary, engagements: [], names, now });
const facts = () => briefingFacts(input());

const fakeClient = (parse: (params: Record<string, unknown>) => unknown) => ({ messages: { parse: vi.fn(parse) } }) as unknown as ClaudeClient;

describe("intel facts", () => {
  it("lists each pilot's latest killmails before any aggregate", () => {
    const f = facts();
    const keys = Object.keys(f.pilots[0]);
    expect(keys.indexOf("latestKillmails")).toBeLessThan(keys.indexOf("last7Days"));
    expect(keys.indexOf("last7Days")).toBeLessThan(keys.indexOf("threat"));
    expect(keys.at(-1)).toBe("lifetime");
    expect(f.pilots[0].latestKillmails[0]).toMatchObject({ type: "kill", ship: "Sabre", victim: "Rifter", system: "Tama", ago: "5 hours" });
    // Most dangerous first.
    expect(f.pilots.map((p) => p.name)).toEqual(["Sabre Guy", "Quiet Guy"]);
  });

  it("hashes facts without relative times", () => {
    const later = briefingFacts({ scan: { pilotCount: 2, createdAt: now, system: "Tama" }, pilots, summary, engagements: [], names, now: new Date(now.getTime() + 3600_000) });
    expect(factsHash(later)).toBe(factsHash(facts()));
  });
});

describe("Claude briefing and dossier", () => {
  const output = {
    headline: "  **Sabre** gang in Tama ",
    threatLevel: "high" as const,
    recent: "{@Sabre Guy} killed a **Rifter** 5 hours ago.",
    paragraphs: ["Watch the gate.", "  "],
    keyPilots: [
      { id: 1, note: "Tackle in a Sabre" },
      { id: 999, note: "invented" },
      { id: 1, note: "duplicate" },
    ],
    advice: "Avoid the Tama gate.",
  };

  it("asks for structured output at medium effort and keeps only known pilots", async () => {
    const client = fakeClient((params) => {
      expect(params.model).toBe("claude-sonnet-5-5");
      expect(params.output_config).toMatchObject({ effort: "medium" });
      expect((params.output_config as { format?: unknown }).format).toBeDefined();
      const content = String((params.messages as { content: string }[])[0].content);
      expect(content).toContain('"latestKillmails"');
      expect(content.indexOf('"latestKillmails"')).toBeLessThan(content.indexOf('"lifetime"'));
      return { stop_reason: "end_turn", parsed_output: output, model: "claude-sonnet-5-5", usage: { input_tokens: 1000, output_tokens: 200 } };
    });
    const out = await claudeBriefing(facts(), { apiKey: "k", model: "claude-sonnet-5-5", locale: "en", client });
    expect(out.content.headline).toBe("Sabre gang in Tama");
    expect(out.content.paragraphs).toEqual(["Watch the gate."]);
    expect(out.content.keyPilots).toEqual([{ characterId: 1, note: "Tackle in a Sabre" }]);
    expect(out.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
  });

  it("writes dossiers at low effort and rejects refusals and cut-off answers", async () => {
    const dossier = {
      summary: "Active Sabre pilot.",
      recentActivity: "8 kills this week.",
      playstyle: "Small gang tackle.",
      watchFor: ["Bubbles on gates"],
      historyWithUs: null,
      confidence: "high" as const,
    };
    const ok = fakeClient((params) => {
      expect(params.output_config).toMatchObject({ effort: "low" });
      return { stop_reason: "end_turn", parsed_output: dossier, model: "m", usage: { input_tokens: 1, output_tokens: 1 } };
    });
    const f = dossierFacts(pilots[0], [], names, now);
    expect((await claudeDossier(f, { apiKey: "k", model: "m", locale: "en", client: ok })).content.watchFor).toEqual(["Bubbles on gates"]);
    const refused = fakeClient(() => ({ stop_reason: "refusal" }));
    await expect(claudeDossier(f, { apiKey: "k", model: "m", locale: "en", client: refused })).rejects.toThrow("declined");
    const cut = fakeClient(() => ({ stop_reason: "max_tokens" }));
    await expect(claudeBriefing(facts(), { apiKey: "k", model: "m", locale: "en", client: cut })).rejects.toThrow("cut off");
    expect(() => sanitizeBriefing({ ...output, headline: " ", recent: "" }, new Set())).toThrow("empty");
  });
});

describe("intel templates", () => {
  it("uses the current high tier for high and critical briefings", () => {
    const base = input();
    const summary = { ...base.summary, tiers: { low: 0, moderate: 0, high: 1, extreme: 0, unknown: 0 }, roles: { ...base.summary.roles, cyno: 0, capital: 0 } };
    expect(threatLevelOf({ ...base, summary })).toBe("high");
    expect(threatLevelOf({ ...base, summary: { ...summary, tiers: { ...summary.tiers, high: 2 } } })).toBe("critical");
    expect(threatLevelOf({ ...base, summary: { ...summary, roles: { ...summary.roles, cyno: 1 } } })).toBe("critical");
    expect(threatLevelOf({ ...base, summary: { ...summary, tiers: { ...summary.tiers, high: 0, moderate: 2 } } })).toBe("elevated");
  });
  it("briefs from the computed data, recent activity first", () => {
    const draft = templateBriefing(input());
    const b = renderBriefing(draft, MESSAGES.en, now);
    expect(b.threatLevel).toBe(threatLevelOf(input()));
    expect(b.recent).toContain("{@Sabre Guy}");
    expect(b.recent).toContain("**Sabre**");
    expect(b.recent).toContain("5 hours ago");
    expect(b.headline).toContain("Tama");
    expect(b.advice).toBe(MESSAGES.en.intel.template.advice[b.threatLevel]);
  });

  it("writes the same draft in each reader's language", () => {
    const draft = JSON.parse(JSON.stringify(templateBriefing(input())));
    const de = renderBriefing(draft, MESSAGES.de, now);
    expect(de.headline).toContain("nicht befreundete Piloten in Tama");
    expect(de.recent).toContain("vor 5 Stunden");
    expect(de.advice).toBe(MESSAGES.de.intel.template.advice[de.threatLevel]);
  });

  it("writes a dossier without Claude", () => {
    const d = renderDossier(templateDossier(pilots[0], names), MESSAGES.en, now);
    expect(d.summary).toContain("{@Sabre Guy}");
    expect(d.recentActivity).toContain("Sabre");
    expect(renderDossier(templateDossier(pilots[0], names), MESSAGES.de, now).recentActivity).toContain("Kills in den letzten 7 Tagen");
    expect(templateDossier(pilots[1], names).confidence).toBe("low");
  });
});

describe("note language", () => {
  it("asks Claude to write in the asker's language from English facts", async () => {
    const client = fakeClient((params) => {
      const content = String((params.messages as { content: string }[])[0].content);
      expect(content).toContain("Write every text field in German");
      expect(content).toContain('"Recent activity"');
      return {
        stop_reason: "end_turn",
        parsed_output: { summary: "Aktiver Sabre-Pilot.", recentActivity: "", playstyle: "", watchFor: [], historyWithUs: null, confidence: "medium" },
        model: "m",
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    });
    const out = await claudeDossier(dossierFacts(pilots[0], [], names, now), { apiKey: "k", model: "m", locale: "de", client });
    expect(out.content.summary).toBe("Aktiver Sabre-Pilot.");
  });
});
