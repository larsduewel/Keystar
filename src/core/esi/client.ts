/**
 * ESI HTTP client.
 *
 * - Sends X-Compatibility-Date (versionless routes) and a descriptive User-Agent.
 * - Caches GET responses (ETag + body) and honours the Expires header, so jobs
 *   can run on a timer without wasting rate-limit tokens.
 * - Follows X-Pages pagination.
 * - Backs off globally when the legacy error limit runs low and per rate-limit
 *   group on 429 (floating-window token buckets introduced in 2025).
 * - Refreshes the access token once on 401.
 */

export type Query = Record<string, string | number | boolean | undefined>;

export interface EsiRequestOptions {
  method?: "GET" | "POST";
  query?: Query;
  body?: unknown;
  /** Character whose access token authenticates the request. */
  characterId?: number;
  page?: number;
  /** Bypass the response cache entirely. */
  noCache?: boolean;
}

export interface EsiResponse<T> {
  data: T;
  status: number;
  expiresAt: Date | null;
  pages: number;
  /** Served from the local cache without contacting ESI. */
  fromCache: boolean;
  /** ESI answered 304 Not Modified. */
  notModified: boolean;
  /** When ESI generated the response (Last-Modified); null for local cache hits or without the header. */
  lastModified: Date | null;
}

export interface CachedEntry {
  etag: string | null;
  body: unknown;
  pages: number | null;
  expiresAt: Date | null;
}

export interface EsiCacheStore {
  get(key: string): Promise<CachedEntry | null>;
  set(key: string, entry: CachedEntry): Promise<void>;
}

export type AccessTokenProvider = (characterId: number, opts?: { forceRefresh?: boolean }) => Promise<string>;

export class EsiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "EsiError";
  }
}

/** 403: missing scope or in-game role. */
export class EsiForbiddenError extends EsiError {
  constructor(path: string, body?: unknown) {
    super(`ESI forbidden (missing scope or in-game role): ${path}`, 403, path, body);
    this.name = "EsiForbiddenError";
  }
}

/** 420/429: back off until `retryAt`. */
export class EsiRateLimitedError extends EsiError {
  constructor(
    path: string,
    status: number,
    readonly retryAt: Date,
  ) {
    super(`ESI rate limited (${status}) until ${retryAt.toISOString()}: ${path}`, status, path);
    this.name = "EsiRateLimitedError";
  }
}

/** Request counters since the client was created, for System Info and the support package. */
export interface EsiClientStats {
  since: string;
  requests: { ok: number; notModified: number; clientError: number; serverError: number; network: number };
  /** GETs answered from the local cache without contacting ESI. */
  cacheHits: number;
  retries: number;
  tokenRefreshes: number;
  rateLimited: { errorLimit: number; group: number };
  /** Last X-ESI-Error-Limit-Remain seen; null before the first response that reports it. */
  errorLimitRemain: number | null;
  /** Set while requests wait for the error limit to reset. */
  errorLimitPausedUntil: string | null;
  /** Rate-limit groups currently paused, with when they resume. */
  pausedGroups: { group: string; until: string }[];
  /** Last X-Ratelimit-Remaining seen per rate-limit group. */
  groupRemaining: Record<string, number>;
  /** ESI's clock (Date header) minus ours, from the last response; positive when ours is behind. */
  clockOffsetMs: number | null;
}

export interface EsiClientOptions {
  baseUrl: string;
  userAgent: string;
  compatibilityDate: string;
  cache?: EsiCacheStore;
  tokenProvider?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  /** Pause requests when the legacy error budget drops below this. */
  errorLimitFloor?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Turns /characters/123/mining into /characters/{id}/mining to key rate-limit groups. */
export function routePattern(path: string): string {
  return path.replace(/\/\d+(?=\/|$)/g, "/{id}");
}

function buildQueryString(query: Query | undefined, page?: number): string {
  const params = new URLSearchParams();
  const entries = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of entries) params.set(k, String(v));
  if (page && page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export class EsiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private errorLimitPauseUntil = 0;
  private readonly groupPauseUntil = new Map<string, number>();
  private readonly patternGroup = new Map<string, string>();
  private readonly counters = {
    since: new Date().toISOString(),
    requests: { ok: 0, notModified: 0, clientError: 0, serverError: 0, network: 0 },
    cacheHits: 0,
    retries: 0,
    tokenRefreshes: 0,
    rateLimited: { errorLimit: 0, group: 0 },
    errorLimitRemain: null as number | null,
    groupRemaining: {} as Record<string, number>,
    clockOffsetMs: null as number | null,
  };

  constructor(private readonly opts: EsiClientOptions) {
    // Look the global up per call, so a stubbed fetch applies to an already-created shared client.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
  }

  async request<T>(path: string, options: EsiRequestOptions = {}): Promise<EsiResponse<T>> {
    const method = options.method ?? "GET";
    const qs = buildQueryString(options.query, options.page);
    const url = `${this.opts.baseUrl}${path}${qs}`;
    const cacheKey = `${options.characterId ?? 0}:${method} ${path}${qs}`;
    const useCache = method === "GET" && !options.noCache && this.opts.cache;

    const cached = useCache ? await this.opts.cache!.get(cacheKey) : null;
    if (cached && cached.expiresAt && cached.expiresAt.getTime() > this.now()) {
      this.counters.cacheHits++;
      return {
        data: cached.body as T,
        status: 200,
        expiresAt: cached.expiresAt,
        pages: cached.pages ?? 1,
        fromCache: true,
        notModified: true,
        lastModified: null,
      };
    }

    const pattern = routePattern(path);
    let attempt = 0;
    let refreshedToken = false;

    for (;;) {
      await this.waitForBudget(pattern);

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": this.opts.userAgent,
        "X-Compatibility-Date": this.opts.compatibilityDate,
      };
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      if (options.characterId !== undefined) {
        if (!this.opts.tokenProvider) throw new Error("ESI client has no token provider");
        const token = await this.opts.tokenProvider(options.characterId, { forceRefresh: refreshedToken });
        headers.Authorization = `Bearer ${token}`;
      }
      let body: string | undefined;
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
      }

      let res: Response;
      const sentAt = this.now();
      try {
        res = await this.fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        this.counters.requests.network++;
        if (attempt < (this.opts.maxRetries ?? 2)) {
          attempt++;
          this.counters.retries++;
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new EsiError(`ESI request failed: ${(err as Error).message}`, 0, path);
      }

      this.trackLimits(pattern, res);
      this.count(res, sentAt);
      const expiresAt = parseExpires(res.headers.get("expires"));
      const pages = Number(res.headers.get("x-pages") ?? "1") || 1;
      const lastModified = parseExpires(res.headers.get("last-modified"));

      if (res.status === 304 && cached) {
        if (useCache) await this.opts.cache!.set(cacheKey, { ...cached, expiresAt, pages });
        return { data: cached.body as T, status: 304, expiresAt, pages, fromCache: false, notModified: true, lastModified };
      }

      if (res.ok) {
        const data = (res.status === 204 ? null : await res.json()) as T;
        if (useCache) {
          await this.opts.cache!.set(cacheKey, { etag: res.headers.get("etag"), body: data, pages, expiresAt });
        }
        return { data, status: res.status, expiresAt, pages, fromCache: false, notModified: false, lastModified };
      }

      const errBody = await res.json().catch(() => undefined);

      if (res.status === 401 && options.characterId !== undefined && !refreshedToken) {
        refreshedToken = true;
        this.counters.tokenRefreshes++;
        continue;
      }
      if (res.status === 403) throw new EsiForbiddenError(path, errBody);
      if (res.status === 420 || res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? res.headers.get("x-esi-error-limit-reset") ?? 60);
        const retryAt = new Date(this.now() + Math.max(1, retryAfter) * 1000);
        if (res.status === 420) this.counters.rateLimited.errorLimit++;
        else this.counters.rateLimited.group++;
        if (res.status === 420) this.errorLimitPauseUntil = retryAt.getTime();
        else this.groupPauseUntil.set(this.patternGroup.get(pattern) ?? pattern, retryAt.getTime());
        throw new EsiRateLimitedError(path, res.status, retryAt);
      }
      if (res.status >= 500 && attempt < (this.opts.maxRetries ?? 2)) {
        attempt++;
        this.counters.retries++;
        await this.sleep(1000 * 2 ** attempt);
        continue;
      }
      const message =
        (errBody as { error?: string } | undefined)?.error ?? `HTTP ${res.status} ${res.statusText}`.trim();
      throw new EsiError(`ESI ${method} ${path} failed: ${message}`, res.status, path, errBody);
    }
  }

  get<T>(path: string, options: Omit<EsiRequestOptions, "method" | "body"> = {}): Promise<EsiResponse<T>> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body: unknown, options: Omit<EsiRequestOptions, "method" | "body"> = {}): Promise<EsiResponse<T>> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  /** Fetches every page of a paginated GET route and concatenates the arrays. */
  async getAllPages<T>(
    path: string,
    options: Omit<EsiRequestOptions, "method" | "body" | "page"> = {},
  ): Promise<{ data: T[]; expiresAt: Date | null; notModified: boolean; fromCache: boolean; lastModified: Date | null }> {
    const first = await this.get<T[]>(path, options);
    const data = [...(first.data ?? [])];
    let expiresAt = first.expiresAt;
    let notModified = first.notModified;
    let fromCache = first.fromCache;
    for (let page = 2; page <= first.pages; page++) {
      const res = await this.get<T[]>(path, { ...options, page });
      data.push(...(res.data ?? []));
      notModified = notModified && res.notModified;
      fromCache = fromCache && res.fromCache;
      if (res.expiresAt && (!expiresAt || res.expiresAt < expiresAt)) expiresAt = res.expiresAt;
    }
    return { data, expiresAt, notModified, fromCache, lastModified: first.lastModified };
  }

  /**
   * One uncached GET without retries or rate-limit waits, for reachability checks
   * (System Info). Any HTTP answer resolves with its status; network errors throw.
   */
  async ping(path = "/status", signal: AbortSignal = AbortSignal.timeout(10_000)): Promise<{ status: number }> {
    const sentAt = this.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": this.opts.userAgent,
          "X-Compatibility-Date": this.opts.compatibilityDate,
        },
        signal,
      });
    } catch (err) {
      this.counters.requests.network++;
      throw err;
    }
    this.trackLimits(routePattern(path), res);
    this.count(res, sentAt);
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status };
  }

  /** A snapshot of the request counters and current back-off state. */
  stats(): EsiClientStats {
    const now = this.now();
    const c = this.counters;
    return {
      since: c.since,
      requests: { ...c.requests },
      cacheHits: c.cacheHits,
      retries: c.retries,
      tokenRefreshes: c.tokenRefreshes,
      rateLimited: { ...c.rateLimited },
      errorLimitRemain: c.errorLimitRemain,
      errorLimitPausedUntil: this.errorLimitPauseUntil > now ? new Date(this.errorLimitPauseUntil).toISOString() : null,
      pausedGroups: [...this.groupPauseUntil]
        .filter(([, until]) => until > now)
        .map(([group, until]) => ({ group, until: new Date(until).toISOString() })),
      groupRemaining: { ...c.groupRemaining },
      clockOffsetMs: c.clockOffsetMs,
    };
  }

  private count(res: Response, sentAt: number): void {
    const r = this.counters.requests;
    if (res.status === 304) r.notModified++;
    else if (res.status >= 500) r.serverError++;
    else if (res.status >= 400) r.clientError++;
    else r.ok++;
    // The Date header has one-second resolution; the request's midpoint is our best local estimate.
    const date = Date.parse(res.headers.get("date") ?? "");
    if (Number.isFinite(date)) this.counters.clockOffsetMs = Math.round(date - (sentAt + this.now()) / 2);
  }

  private async waitForBudget(pattern: string): Promise<void> {
    const group = this.patternGroup.get(pattern) ?? pattern;
    const until = Math.max(this.errorLimitPauseUntil, this.groupPauseUntil.get(group) ?? 0);
    const wait = until - this.now();
    if (wait > 0) {
      if (wait > 60_000) {
        // Don't block a worker slot for long; let the scheduler retry later.
        throw new EsiRateLimitedError(pattern, 429, new Date(until));
      }
      await this.sleep(wait);
    }
  }

  private trackLimits(pattern: string, res: Response): void {
    const group = res.headers.get("x-ratelimit-group");
    if (group) this.patternGroup.set(pattern, group);

    // Only a response that actually reports the error limit may pause the client.
    const remain = numericHeader(res, "x-esi-error-limit-remain");
    const reset = numericHeader(res, "x-esi-error-limit-reset");
    if (Number.isFinite(remain)) this.counters.errorLimitRemain = remain;
    if (Number.isFinite(remain) && Number.isFinite(reset) && remain < (this.opts.errorLimitFloor ?? 20)) {
      this.errorLimitPauseUntil = this.now() + (reset + 1) * 1000;
    }

    const rlRemaining = numericHeader(res, "x-ratelimit-remaining");
    if (group && Number.isFinite(rlRemaining)) this.counters.groupRemaining[group] = rlRemaining;
    if (group && Number.isFinite(rlRemaining) && rlRemaining <= 5) {
      // Nearly drained: give the floating window a moment to return tokens.
      this.groupPauseUntil.set(group, this.now() + 15_000);
    }
  }
}

/** Reads a numeric header; NaN when it is absent or blank (Number(null) and Number("") would be 0). */
function numericHeader(res: Response, name: string): number {
  const value = res.headers.get(name)?.trim();
  return value ? Number(value) : NaN;
}

/** Parses an HTTP date header (Expires, Last-Modified). */
function parseExpires(value: string | null): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}
