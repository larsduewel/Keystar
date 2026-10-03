/**
 * Minimal zKillboard API client (https://github.com/zKillboard/zKillboard/wiki).
 *
 * zKillboard asks API users to send a descriptive User-Agent, accept gzip and
 * not hammer the server: requests are spaced out process-wide, and responses
 * are cached by zKillboard for an hour, so polling more often gains nothing.
 * Each entry is the full ESI killmail plus zKillboard's `zkb` block.
 */

export interface ZkillAttacker {
  character_id?: number;
  corporation_id?: number;
  alliance_id?: number;
  faction_id?: number;
  ship_type_id?: number;
  weapon_type_id?: number;
  damage_done: number;
  final_blow: boolean;
  security_status?: number;
}

/** A fitted, cargo or nested item on the victim's ship (ESI killmail format). */
export interface ZkillItem {
  item_type_id: number;
  /** Inventory flag: slot (11–34 low/mid/high, 92–99 rigs, 125–132 subsystems), cargo, drone bay, … */
  flag: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
  singleton?: number;
  items?: ZkillItem[];
}

export interface ZkillKillmail {
  killmail_id: number;
  killmail_time: string;
  solar_system_id: number;
  victim: {
    character_id?: number;
    corporation_id?: number;
    alliance_id?: number;
    faction_id?: number;
    ship_type_id: number;
    damage_taken: number;
    items?: ZkillItem[];
  };
  attackers: ZkillAttacker[];
  zkb: {
    hash: string;
    locationID?: number;
    fittedValue?: number;
    droppedValue?: number;
    destroyedValue?: number;
    totalValue?: number;
    points?: number;
    npc?: boolean;
    solo?: boolean;
    awox?: boolean;
    labels?: string[];
    attackerCount?: number;
    href?: string;
  };
}

/** Which killmails to list: the last N seconds (max 7 days) or a calendar month. */
export type ZkillWindow = { pastSeconds: number } | { year: number; month: number };

export class ZkillError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ZkillError";
  }
}

export interface ZkillClientOptions {
  userAgent: string;
  baseUrl?: string;
  /** Minimum gap between two requests from this process. */
  minIntervalMs?: number;
  maxAttempts?: number;
  /** Safety cap on pages per listing. */
  maxPages?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_PAST_SECONDS = 7 * 24 * 3600;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function windowPath(window: ZkillWindow): string {
  if ("pastSeconds" in window) {
    // zKillboard only accepts multiples of an hour, up to 7 days.
    const s = Math.min(MAX_PAST_SECONDS, Math.max(3600, Math.ceil(window.pastSeconds / 3600) * 3600));
    return `pastSeconds/${s}/`;
  }
  return `year/${window.year}/month/${window.month}/`;
}

export class ZkillClient {
  private nextSlot = 0;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ZkillClientOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://zkillboard.com").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? realSleep;
  }

  /** One page of killmails involving a corporation (kills and losses). */
  corporationPage(corporationId: number, window: ZkillWindow, page: number): Promise<ZkillKillmail[]> {
    return this.get(`/api/corporationID/${corporationId}/${windowPath(window)}page/${page}/`);
  }

  /**
   * One page (up to 200, newest first) of a character's killmails: kills and
   * losses, or only one side.
   */
  characterPage(characterId: number, page: number, opts: { side?: "kills" | "losses" } = {}): Promise<ZkillKillmail[]> {
    const side = opts.side ? `${opts.side}/` : "";
    return this.get(`/api/characterID/${characterId}/${side}page/${page}/`);
  }

  /**
   * zKillboard's statistics for a character (raw JSON; the shape is only loosely
   * documented, so callers parse it leniently). zKillboard answers ids it has
   * never seen with `{"error": "Invalid type or id"}`, which means no history.
   */
  async characterStats(characterId: number): Promise<{ kind: "ok"; stats: Record<string, unknown> } | { kind: "none" }> {
    const body = await this.getJson(`/api/stats/characterID/${characterId}/kills/`);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "none" };
    if (typeof (body as { error?: unknown }).error === "string") return { kind: "none" };
    return { kind: "ok", stats: body as Record<string, unknown> };
  }

  /** Every killmail involving a corporation in the window, page by page (newest first). */
  async *corporationKillmails(corporationId: number, window: ZkillWindow): AsyncGenerator<ZkillKillmail[]> {
    const maxPages = this.opts.maxPages ?? 100;
    for (let page = 1; page <= maxPages; page++) {
      const rows = await this.corporationPage(corporationId, window, page);
      if (!rows.length) return;
      yield rows;
    }
  }

  private async throttle(): Promise<void> {
    const interval = this.opts.minIntervalMs ?? 1100;
    const now = Date.now();
    const wait = this.nextSlot - now;
    this.nextSlot = Math.max(now, this.nextSlot) + interval;
    if (wait > 0) await this.sleep(wait);
  }

  /** Killmail listing: an array of killmails (malformed entries are dropped). */
  async get(path: string): Promise<ZkillKillmail[]> {
    const { body, status } = await this.request(path);
    if (!Array.isArray(body)) {
      const message = (body as { error?: string } | null)?.error ?? "unexpected response";
      throw new ZkillError(`zKillboard: ${message}`, status);
    }
    return body.filter(isKillmail);
  }

  /** Any other JSON endpoint (statistics, …), same spacing and retries as listings. */
  async getJson(path: string): Promise<unknown> {
    return (await this.request(path)).body;
  }

  private async request(path: string): Promise<{ body: unknown; status: number }> {
    const attempts = this.opts.maxAttempts ?? 4;
    let lastError: ZkillError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.throttle();
      let res: Response;
      try {
        // Statistics URLs redirect (302) to their default sort; fetch follows that.
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: { "User-Agent": this.opts.userAgent, "Accept-Encoding": "gzip", Accept: "application/json" },
        });
      } catch (err) {
        lastError = new ZkillError(`zKillboard unreachable: ${(err as Error).message}`, null);
        await this.sleep(2000 * attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastError = new ZkillError(`zKillboard responded ${res.status}`, res.status);
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * attempt);
        continue;
      }
      if (!res.ok) {
        // 403 usually means a missing/blocked User-Agent or too many requests from this IP.
        throw new ZkillError(`zKillboard responded ${res.status} for ${path}`, res.status);
      }
      return { body: await res.json(), status: res.status };
    }
    throw lastError ?? new ZkillError("zKillboard request failed", null);
  }
}

function isKillmail(value: unknown): value is ZkillKillmail {
  const v = value as ZkillKillmail;
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isSafeInteger(v.killmail_id) &&
    typeof v.killmail_time === "string" &&
    typeof v.zkb?.hash === "string" &&
    typeof v.victim?.ship_type_id === "number" &&
    Array.isArray(v.attackers)
  );
}

/** Calendar months (UTC) overlapping [since, until], oldest first. */
export function monthsBetween(since: Date, until: Date): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = since.getUTCFullYear();
  let m = since.getUTCMonth() + 1;
  const endKey = until.getUTCFullYear() * 12 + until.getUTCMonth();
  while (y * 12 + (m - 1) <= endKey) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface KillmailRow {
  killmailId: number;
  hash: string;
  killmailTime: Date;
  solarSystemId: number;
  victimCharacterId: number | null;
  victimCorporationId: number | null;
  victimAllianceId: number | null;
  victimShipTypeId: number;
  damageTaken: number;
  attackerCount: number;
  totalValue: number;
  fittedValue: number;
  destroyedValue: number;
  droppedValue: number;
  points: number;
  npc: boolean;
  solo: boolean;
  awox: boolean;
  labels: string[];
}

export interface AttackerRow {
  killmailId: number;
  idx: number;
  characterId: number | null;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  shipTypeId: number | null;
  weaponTypeId: number | null;
  damageDone: number;
  finalBlow: boolean;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const id = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);

/** Flattens a zKillboard entry into table rows. Pure, so it is easy to test. */
export function toRows(km: ZkillKillmail): { killmail: KillmailRow; attackers: AttackerRow[] } {
  return {
    killmail: {
      killmailId: km.killmail_id,
      hash: km.zkb.hash,
      killmailTime: new Date(km.killmail_time),
      solarSystemId: km.solar_system_id,
      victimCharacterId: id(km.victim.character_id),
      victimCorporationId: id(km.victim.corporation_id),
      victimAllianceId: id(km.victim.alliance_id),
      victimShipTypeId: km.victim.ship_type_id,
      damageTaken: num(km.victim.damage_taken),
      attackerCount: km.attackers.length,
      totalValue: num(km.zkb.totalValue),
      fittedValue: num(km.zkb.fittedValue),
      destroyedValue: num(km.zkb.destroyedValue),
      droppedValue: num(km.zkb.droppedValue),
      points: Math.trunc(num(km.zkb.points)),
      npc: km.zkb.npc === true,
      solo: km.zkb.solo === true,
      awox: km.zkb.awox === true,
      labels: Array.isArray(km.zkb.labels) ? km.zkb.labels.filter((l) => typeof l === "string") : [],
    },
    attackers: km.attackers.map((a, idx) => ({
      killmailId: km.killmail_id,
      idx,
      characterId: id(a.character_id),
      corporationId: id(a.corporation_id),
      allianceId: id(a.alliance_id),
      factionId: id(a.faction_id),
      shipTypeId: id(a.ship_type_id),
      weaponTypeId: id(a.weapon_type_id),
      damageDone: Math.trunc(num(a.damage_done)),
      finalBlow: a.final_blow === true,
    })),
  };
}

/**
 * zKillboard's live feed (R2Z2, https://github.com/zKillboard/zKillboard/wiki/API-(R2Z2)):
 * every killmail zKillboard parses gets the next number of a global sequence
 * and is published as `{sequence}.json` (kept for at least 24 hours). Readers
 * start at `sequence.json` and count upwards until a 404, then wait at least 6
 * seconds. The feed is unfiltered (all of New Eden), so callers pick their own.
 * Limits: 15 requests a second per IP, or the IP is refused for up to an hour.
 */
export type R2z2Result = { kind: "pending" } | { kind: "entry"; killmail: ZkillKillmail | null };

export interface R2z2ClientOptions {
  userAgent: string;
  baseUrl?: string;
  /** Minimum gap between two requests from this process (zKillboard suggests 100 ms). */
  minIntervalMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class R2z2Client {
  private nextSlot = 0;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: R2z2ClientOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://r2z2.zkillboard.com/ephemeral").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? realSleep;
  }

  /** A recent sequence number to start reading from (updated in batches, so it may trail a little). */
  async sequence(): Promise<number> {
    const body = await this.request("/sequence.json");
    const seq = (body as { sequence?: unknown } | null)?.sequence;
    if (!Number.isSafeInteger(seq)) throw new ZkillError("R2Z2: unexpected sequence response", 200);
    return seq as number;
  }

  /**
   * The killmail published under a sequence number: `pending` while it doesn't
   * exist yet (404); `killmail` is null when the file isn't a usable killmail.
   */
  async entry(sequence: number): Promise<R2z2Result> {
    const body = await this.request(`/${sequence}.json`);
    if (body === undefined) return { kind: "pending" };
    return { kind: "entry", killmail: fromR2z2(body) };
  }

  private async throttle(): Promise<void> {
    const interval = this.opts.minIntervalMs ?? 100;
    const now = Date.now();
    const wait = this.nextSlot - now;
    this.nextSlot = Math.max(now, this.nextSlot) + interval;
    if (wait > 0) await this.sleep(wait);
  }

  /** JSON body, or undefined on 404. Errors are not retried here: the live job simply tries again on its next run. */
  private async request(path: string): Promise<unknown> {
    await this.throttle();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { "User-Agent": this.opts.userAgent, "Accept-Encoding": "gzip", Accept: "application/json" },
      });
    } catch (err) {
      throw new ZkillError(`R2Z2 unreachable: ${(err as Error).message}`, null);
    }
    if (res.status === 404) return undefined;
    if (!res.ok) throw new ZkillError(`R2Z2 responded ${res.status} for ${path}`, res.status);
    return res.json();
  }
}

/** An R2Z2 file is `{killmail_id, hash, esi: <ESI killmail>, zkb, …}`; flatten it to the API listing shape. */
export function fromR2z2(body: unknown): ZkillKillmail | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { killmail_id?: unknown; hash?: unknown; esi?: Record<string, unknown>; zkb?: Record<string, unknown> };
  if (!b.esi || typeof b.esi !== "object") return null;
  const km = {
    ...b.esi,
    killmail_id: b.esi.killmail_id ?? b.killmail_id,
    zkb: { ...(b.zkb ?? {}), hash: b.zkb?.hash ?? b.hash },
  };
  return isKillmail(km) ? km : null;
}

/** Whether a corporation is on the killmail, as victim or attacker. */
export function involvesCorporation(km: ZkillKillmail, corporationId: number): boolean {
  return km.victim.corporation_id === corporationId || km.attackers.some((a) => a.corporation_id === corporationId);
}
