import { describe, expect, it } from "vitest";
import { mapLimit } from "@/lib/concurrency";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("mapLimit", () => {
  it("runs every item with at most `limit` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      done.push(n);
      inFlight--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it("starts no more items after a rejection and settles the ones in flight first", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const run = mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 2, async (n) => {
      started.push(n);
      if (n === 1) throw new Error("boom");
      await tick();
      finished.push(n);
    });
    await expect(run).rejects.toThrow("boom");
    // Item 2 was already running when item 1 failed; nothing after it was handed out.
    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([2]);
  });

  it("rejects with the first error", async () => {
    const run = mapLimit([1, 2], 2, async (n) => {
      await tick();
      throw new Error(`fail ${n}`);
    });
    await expect(run).rejects.toThrow("fail 1");
  });
});
