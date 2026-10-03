import { describe, expect, it, vi } from "vitest";
import { ZkillClient, ZkillError } from "@/modules/killboard/zkill";
import activeStats from "./fixtures/zkill-stats-active.json";
import losses from "./fixtures/zkill-character-losses.json";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function client(fetchImpl: (url: string) => Promise<Response>) {
  return new ZkillClient({ userAgent: "test-agent", fetch: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
}

describe("zKillboard character endpoints", () => {
  it("reads character statistics", async () => {
    const urls: string[] = [];
    const zkill = client(async (url) => {
      urls.push(url);
      return json(activeStats);
    });
    const res = await zkill.characterStats(90000001);
    expect(urls).toEqual(["https://zkillboard.com/api/stats/characterID/90000001/kills/"]);
    expect(res.kind).toBe("ok");
    expect(res.kind === "ok" && res.stats.dangerRatio).toBe(activeStats.dangerRatio);
  });

  it("treats an unknown id as no history", async () => {
    const zkill = client(async () => json({ error: "Invalid type or id" }));
    expect(await zkill.characterStats(1)).toEqual({ kind: "none" });
    const empty = client(async () => json([]));
    expect(await empty.characterStats(1)).toEqual({ kind: "none" });
  });

  it("lists a character's killmails page by page, optionally one side only", async () => {
    const urls: string[] = [];
    const zkill = client(async (url) => {
      urls.push(url);
      return json(losses);
    });
    const page = await zkill.characterPage(42, 1);
    await zkill.characterPage(42, 2, { side: "losses" });
    expect(urls).toEqual([
      "https://zkillboard.com/api/characterID/42/page/1/",
      "https://zkillboard.com/api/characterID/42/losses/page/2/",
    ]);
    expect(page).toHaveLength(3);
    expect(page[0].victim.items?.length).toBeGreaterThan(0);
  });

  it("throws on a blocked user agent and keeps retrying server errors", async () => {
    const forbidden = client(async () => new Response("", { status: 403 }));
    await expect(forbidden.characterStats(1)).rejects.toBeInstanceOf(ZkillError);

    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("", { status: 502 })).mockResolvedValueOnce(json(activeStats));
    const flaky = client(fetchImpl);
    expect((await flaky.characterStats(1)).kind).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shares the request spacing between listings and statistics", async () => {
    let now = 0;
    const waits: number[] = [];
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const zkill = new ZkillClient({
      userAgent: "ua",
      minIntervalMs: 1000,
      fetch: (async () => json([])) as unknown as typeof fetch,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await zkill.characterStats(1);
    await zkill.characterPage(1, 1);
    await zkill.characterStats(2);
    expect(waits).toEqual([1000, 1000]);
    vi.restoreAllMocks();
  });
});
