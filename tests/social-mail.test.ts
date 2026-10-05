import { describe, expect, it, vi } from "vitest";
import { EsiClient, type CachedEntry, type EsiCacheStore } from "@/core/esi/client";
import { deletedInGame, fetchMailBody, fetchMailHeaders, type EsiMailHeader } from "@/modules/social/esi";
import { mailHref, parseMailParams } from "@/modules/social/filters";

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", expires: new Date(Date.now() + 30_000).toUTCString(), ...init.headers },
  });
}

function memoryCache(): EsiCacheStore & { map: Map<string, CachedEntry> } {
  const map = new Map<string, CachedEntry>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}

function header(id: number): EsiMailHeader {
  return {
    mail_id: id,
    from: 90000001,
    subject: `Mail ${id}`,
    timestamp: "2026-10-01T12:00:00Z",
    is_read: id % 2 === 0,
    labels: [1],
    recipients: [{ recipient_id: 90000002, recipient_type: "character" }],
  };
}

/** Fake mailbox with the given mail ids, newest first, 50 per page like ESI. */
function mailbox(ids: number[]) {
  const cache = memoryCache();
  const sorted = [...ids].sort((a, b) => b - a);
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const u = new URL(String(url));
    const body = /\/mail\/(\d+)$/.exec(u.pathname);
    if (body) {
      const id = Number(body[1]);
      if (!ids.includes(id)) return json({ error: "Mail not found" }, { status: 404 });
      return json({ ...header(id), body: `<b>Body ${id}</b>`, read: true, labels: [1, 256] });
    }
    const last = u.searchParams.get("last_mail_id");
    const below = last ? Number(last) : Infinity;
    return json(sorted.filter((id) => id < below).slice(0, 50).map(header));
  });
  const esi = new EsiClient({
    baseUrl: "https://esi.test",
    userAgent: "Keystar/test (tests)",
    compatibilityDate: "2026-08-18",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    tokenProvider: async () => "token",
    cache,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { esi, fetchImpl, cache };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("mail header import", () => {
  it("reads one page once it overlaps stored mail", async () => {
    const { esi, fetchImpl } = mailbox(range(1, 120));
    const res = await fetchMailHeaders(esi, 7, 100);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.rows.map((h) => h.mailId)).toEqual(range(71, 120).reverse());
    expect(res.windowMin).toBe(71);
    expect(res.truncated).toBe(false);
  });

  it("pages backwards with last_mail_id until the mailbox ends", async () => {
    const { esi, fetchImpl } = mailbox(range(1, 120));
    const res = await fetchMailHeaders(esi, 7, null);
    expect(res.rows).toHaveLength(120);
    const cursors = fetchImpl.mock.calls.map((c) => new URL(String(c[0])).searchParams.get("last_mail_id"));
    expect(cursors).toEqual([null, "71", "21", "1"]);
    // The whole mailbox was listed: anything stored and not listed is gone.
    expect(res.windowMin).toBe(0);
  });

  it("does not delete history when ESI ignores the mail cursor", async () => {
    const { esi, fetchImpl } = mailbox(range(1, 100));
    fetchImpl.mockImplementation(async () => json(range(51, 100).reverse().map(header)));

    const fetched = await fetchMailHeaders(esi, 7, null);

    expect(fetched.windowMin).toBe(51);
    expect(deletedInGame(range(1, 100), fetched)).toEqual([]);
  });

  it("does not delete history after an empty page following a full page", async () => {
    const { esi, fetchImpl } = mailbox(range(1, 100));
    fetchImpl.mockImplementationOnce(async () => json(range(51, 100).reverse().map(header))).mockImplementationOnce(async () => json([]));

    const fetched = await fetchMailHeaders(esi, 7, null);

    expect(fetched.windowMin).toBe(51);
    expect(deletedInGame(range(1, 100), fetched)).toEqual([]);
  });

  it("stops at the page cap on a first import", async () => {
    const { esi, fetchImpl } = mailbox(range(1, 500));
    const res = await fetchMailHeaders(esi, 7, null, 3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.rows).toHaveLength(150);
    expect(res.truncated).toBe(true);
    expect(res.windowMin).toBe(351);
  });

  it("fills in ESI's optional fields and drops duplicate recipients", async () => {
    const { esi } = mailbox([]);
    vi.spyOn(esi, "get").mockResolvedValueOnce({
      data: [
        { mail_id: 5 },
        { mail_id: 6, recipients: [{ recipient_id: 1, recipient_type: "corporation" }, { recipient_id: 1, recipient_type: "corporation" }] },
        { subject: "no id" },
      ],
      status: 200,
      expiresAt: null,
      pages: 1,
      fromCache: false,
      notModified: false,
      lastModified: null,
    });
    const res = await fetchMailHeaders(esi, 7, 6);
    expect(res.rows).toEqual([
      { mailId: 5, fromId: 0, subject: "", sentAt: new Date(0), isRead: false, labels: [], recipients: [] },
      { mailId: 6, fromId: 0, subject: "", sentAt: new Date(0), isRead: false, labels: [], recipients: [{ id: 1, type: "corporation" }] },
    ]);
  });

  it("keeps mail out of the ESI response cache", async () => {
    const { esi, cache } = mailbox(range(1, 10));
    await fetchMailHeaders(esi, 7, null);
    await fetchMailBody(esi, 7, 3);
    expect(cache.map.size).toBe(0);
  });

  it("finds mail deleted in game, only inside the window ESI listed", async () => {
    const { esi } = mailbox([...range(60, 120)].filter((id) => id !== 90));
    const fetched = await fetchMailHeaders(esi, 7, 110);
    // Window is 71..120: 90 was deleted; 10 is older than the window and may still exist.
    expect(deletedInGame([10, 72, 90, 110], fetched)).toEqual([90]);
    expect(deletedInGame([10, 90], { ...fetched, windowMin: null })).toEqual([]);
  });
});

describe("mail bodies", () => {
  it("returns the body with read state and labels", async () => {
    const { esi } = mailbox([3]);
    expect(await fetchMailBody(esi, 7, 3)).toEqual({ body: "<b>Body 3</b>", isRead: true, labels: [1, 256] });
  });

  it("returns null for a mail that no longer exists", async () => {
    const { esi } = mailbox([3]);
    expect(await fetchMailBody(esi, 7, 4)).toBeNull();
  });
});

describe("mail page state", () => {
  const own = [101, 102];

  it("ignores characters and mail of other accounts", () => {
    const p = parseMailParams({ character: "999", mail: "999-5", folder: "inbox" }, own);
    expect(p.characterId).toBeNull();
    expect(p.open).toBeNull();
    expect(p.folder).toEqual({ kind: "inbox" });
  });

  it("round-trips through links and resets paging when the view changes", () => {
    const p = parseMailParams({ character: "101", folder: "list:145156", q: "op", page: "3", mail: "101-77" }, own);
    expect(p).toEqual({ characterId: 101, folder: { kind: "list", id: 145156 }, q: "op", page: 3, open: { characterId: 101, mailId: 77 } });
    expect(mailHref(p)).toBe("/mail?character=101&folder=list%3A145156&q=op&page=3&mail=101-77");
    expect(mailHref(p, { folder: { kind: "sent" } })).toBe("/mail?character=101&folder=sent&q=op");
    expect(mailHref(p, { open: null })).toBe("/mail?character=101&folder=list%3A145156&q=op&page=3");
    expect(parseMailParams({ folder: "label:Ops & Fleets" }, own).folder).toEqual({ kind: "label", name: "Ops & Fleets" });
    expect(parseMailParams({ folder: "bogus", page: "-2" }, own)).toMatchObject({ folder: { kind: "all" }, page: 1 });
  });
});
