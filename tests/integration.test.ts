/**
 * Database-backed tests. They run only when TEST_DATABASE_URL points at a
 * disposable Postgres database (it is truncated!), e.g.
 *   TEST_DATABASE_URL=postgres://keystar:keystar@localhost:5432/keystar_test pnpm test
 */
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("integration", async () => {
  const { closeDb, getDb, schema } = await import("@/core/db");
  const { runMigrations } = await import("@/scripts/migrate");
  const q = await import("@/modules/mining/queries");
  const { parseMiningFilters } = await import("@/modules/mining/filters");
  const scheduler = await import("@/core/sync/scheduler");
  const { EsiClient, EsiError } = await import("@/core/esi/client");

  const db = () => getDb();
  const filters = (extra: Record<string, string> = {}) =>
    parseMiningFilters({ from: "2026-09-01", to: "2026-09-30", ...extra }, "2026-10-02");
  const { parseIndustryFilters } = await import("@/modules/industry/filters");
  const industry_filters = () => parseIndustryFilters({ state: "all" });
  const corp = { corp: true, ownCharacterIds: [] as number[], homeCorporationId: 100 };
  const own = (ids: number[]) => ({ corp: false, ownCharacterIds: ids, homeCorporationId: 100 });
  const val = { source: "jita_buy" as const, mode: "current" as const };
  let userA = "";
  let userB = "";

  beforeAll(async () => {
    await runMigrations(process.env.TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE users, characters, esi_tokens, sessions, eve_types, eve_groups, eve_systems,
      eve_entities, type_values, type_value_history, market_prices, price_interest, mining_character_ledger,
      mining_observer_ledger, mining_observers, sync_jobs, app_settings, killmails, killmail_attackers, killboard_reports, appraisals, appraisal_attempts, esi_cache,
      fleets, fleet_members, fleet_trackers, eve_constellations, intel_scans, intel_scan_pilots, intel_pilots,
      intel_pilot_killmails, intel_queue, intel_contacts, intel_ai_notes, wallet_transactions, wallet_fees, mining_activity,
      mining_activity_coverage, mining_pnl_settings, mining_pnl_characters, mining_pnl_price_rules,
      mining_pnl_tx_overrides, mining_pnl_fee_overrides, mining_pnl_entries, corp_wallet_divisions, corp_wallet_balance_history,
      corp_wallet_journal, corp_wallet_transactions, corp_wallet_sync_state, mail_messages, mail_labels, mail_lists,
      corporation_members, skills_queue, skills_character_skills, skills_character, skills_type_attributes,
      industry_jobs, industry_locations, market_orders
      RESTART IDENTITY CASCADE`);
    const [a] = await db().insert(schema.users).values({ role: "member", mainCharacterId: 1 }).returning();
    const [b] = await db().insert(schema.users).values({ role: "member", mainCharacterId: 2 }).returning();
    userA = a.id;
    userB = b.id;
    await db().insert(schema.characters).values([
      { characterId: 1, userId: userA, name: "Alpha", corporationId: 100, ownerHash: "h1" },
      { characterId: 2, userId: userB, name: "Bravo", corporationId: 100, ownerHash: "h2" },
      { characterId: 3, userId: userB, name: "Bravo Alt", corporationId: 100, ownerHash: "h3" },
    ]);
    await db().insert(schema.eveEntities).values({ id: 9, name: "Outsider", category: "character" });
    await db().insert(schema.eveGroups).values([
      { groupId: 462, name: "Veldspar", categoryId: 25 },
      { groupId: 1884, name: "Ubiquitous Moon Asteroids", categoryId: 25 },
    ]);
    await db().insert(schema.eveTypes).values([
      { typeId: 1230, name: "Veldspar", groupId: 462, volume: 0.1, portionSize: 100 },
      { typeId: 45490, name: "Zeolites", groupId: 1884, volume: 10, portionSize: 100 },
    ]);
    await db().insert(schema.eveSystems).values({ systemId: 30000180, name: "Osmon", securityStatus: 0.68 });
    await db().insert(schema.typeValues).values([
      { typeId: 1230, source: "jita_buy", unitPrice: 10, basis: "direct" },
      { typeId: 45490, source: "jita_buy", unitPrice: 600, basis: "direct" },
    ]);
    await db().insert(schema.typeValueHistory).values([
      { typeId: 45490, source: "jita_buy", date: "2026-09-01", unitPrice: 500 },
    ]);
    await db().insert(schema.miningCharacterLedger).values([
      { characterId: 1, date: "2026-09-10", solarSystemId: 30000180, typeId: 1230, quantity: 1000 },
      { characterId: 2, date: "2026-09-10", solarSystemId: 30000180, typeId: 45490, quantity: 100 },
      { characterId: 3, date: "2026-09-11", solarSystemId: 30000180, typeId: 1230, quantity: 500 },
    ]);
    await db().insert(schema.miningObservers).values({
      observerId: 77,
      corporationId: 100,
      observerType: "structure",
      name: "Osmon Athanor",
      solarSystemId: 30000180,
    });
    await db().insert(schema.miningObserverLedger).values([
      // Same mining as Bravo's personal ledger: must not be double counted.
      { observerId: 77, corporationId: 100, characterId: 2, recordedCorporationId: 100, date: "2026-09-10", typeId: 45490, quantity: 100 },
      // An unregistered pilot from another corp.
      { observerId: 77, corporationId: 100, characterId: 9, recordedCorporationId: 555, date: "2026-09-10", typeId: 45490, quantity: 50 },
    ]);
  });

  describe("mining queries", () => {
    it("de-duplicates personal and observer ledgers in the combined view", async () => {
      const all = await q.getMiningSummary(filters(), corp, val);
      expect(all.current.value).toBe(1000 * 10 + 100 * 600 + 500 * 10 + 50 * 600);
      expect(all.current.characters).toBe(4);
      expect(all.current.miners).toBe(3); // Alpha, Bravo (+alt), Outsider

      const personal = await q.getMiningSummary(filters({ source: "personal" }), corp, val);
      expect(personal.current.value).toBe(75_000);
      const observer = await q.getMiningSummary(filters({ source: "observer" }), corp, val);
      expect(observer.current.value).toBe(90_000);
    });

    it("restricts members to their own characters", async () => {
      const mine = await q.getMiningSummary(filters(), own([2, 3]), val);
      expect(mine.current.value).toBe(100 * 600 + 500 * 10);
      // Asking for someone else's character as a member yields nothing.
      const other = await q.getMiningSummary(filters({ chars: "1" }), own([2, 3]), val);
      expect(other.current.quantity).toBe(0);
      const none = await q.getMiningSummary(filters(), own([]), val);
      expect(none.current.quantity).toBe(0);
    });

    it("limits corporation views to the home corporation", async () => {
      // A guest from another corporation and a refinery of a previous home corporation.
      await db().insert(schema.characters).values({ characterId: 4, userId: userA, name: "Alpha Elsewhere", corporationId: 200, ownerHash: "h4" });
      await db().insert(schema.miningCharacterLedger).values({ characterId: 4, date: "2026-09-12", solarSystemId: 30000180, typeId: 1230, quantity: 7000 });
      await db().insert(schema.miningObservers).values({ observerId: 88, corporationId: 200, observerType: "structure", name: "Old Athanor" });
      await db().insert(schema.miningObserverLedger).values({ observerId: 88, corporationId: 200, characterId: 9, recordedCorporationId: 555, date: "2026-09-12", typeId: 45490, quantity: 999 });

      const corpView = await q.getMiningSummary(filters(), corp, val);
      expect(corpView.current.value).toBe(105_000); // unchanged by the foreign rows
      const observers = await q.getObserverSummaries(filters(), val, 100);
      expect(observers.map((o) => o.name)).toEqual(["Osmon Athanor"]);
      const options = await q.getFilterOptions(corp);
      expect(options.characters.map((c) => c.id)).not.toContain(4);

      // The owner still sees their own character, whatever its corporation.
      const mine = await q.getMiningSummary(filters({ source: "personal" }), own([1, 4]), val);
      expect(mine.current.value).toBe(1000 * 10 + 7000 * 10);

      // A viewer with corporation access finds that alt in the "My characters" view only.
      const viewer = { can: (perm: string) => perm === "mining.view.corp", characterIds: [1, 4] };
      const corpScope = q.miningScope(viewer, 100);
      expect(corpScope.corp).toBe(true);
      const ownScope = q.miningScope(viewer, 100, "own");
      expect(ownScope.corp).toBe(false);
      const ownView = await q.getMiningSummary(filters({ source: "personal", view: "own" }), ownScope, val);
      expect(ownView.current.value).toBe(1000 * 10 + 7000 * 10);
      const ownOptions = await q.getFilterOptions(ownScope);
      expect(ownOptions.characters.map((c) => c.id)).toContain(4);

      // Refinery systems are offered in the own view only where the viewer's characters mined.
      await db().insert(schema.eveSystems).values({ systemId: 30000181, name: "Tama", securityStatus: 0.28 });
      await db().update(schema.miningObservers).set({ solarSystemId: 30000181 }).where(sql`observer_id = 88`);
      await db().insert(schema.miningObserverLedger).values({ observerId: 88, corporationId: 200, characterId: 4, recordedCorporationId: 200, date: "2026-09-13", typeId: 45490, quantity: 1 });
      expect(ownOptions.systems.map((s) => s.id)).not.toContain(30000181);
      expect((await q.getFilterOptions(ownScope)).systems.map((s) => s.id)).toContain(30000181);
      expect((await q.getFilterOptions(own([2]))).systems.map((s) => s.id)).not.toContain(30000181);
    });

    it("shows no corporation-wide data until a home corporation is set", async () => {
      const viewer = { can: (perm: string) => perm === "mining.view.corp", characterIds: [1] };
      const scope = q.miningScope(viewer, null);
      expect(scope.corp).toBe(false);
      const mine = await q.getMiningSummary(filters({ source: "personal" }), scope, val);
      expect(mine.current.value).toBe(1000 * 10);

      // A hand-built corporation scope without a home corporation fails closed.
      const unscoped = await q.getMiningSummary(filters(), { ...corp, homeCorporationId: null }, val);
      expect(unscoped.current.quantity).toBe(0);
      expect(await q.getObserverSummaries(filters(), val, null)).toEqual([]);
    });

    it("filters by ore class and system", async () => {
      const moon = await q.getMiningSummary(filters({ classes: "moon_r4" }), corp, val);
      expect(moon.current.value).toBe(90_000);
      const nowhere = await q.getMiningSummary(filters({ systems: "30000142" }), corp, val);
      expect(nowhere.current.quantity).toBe(0);
    });

    it("groups alts under their main", async () => {
      const rows = await q.getMemberBreakdown(filters(), corp, val);
      const bravo = rows.find((r) => r.userId === userB)!;
      expect(bravo.name).toBe("Bravo");
      expect(bravo.characters).toBe(2);
      expect(bravo.value).toBe(65_000);
      const outsider = rows.find((r) => r.key === "char:9")!;
      expect(outsider.name).toBe("Outsider");
      expect(outsider.userId).toBeNull();

      const byChar = await q.getMemberBreakdown(filters({ by: "character" }), corp, val);
      expect(byChar.find((r) => r.key === "3")?.ownerName).toBe("Bravo");
    });

    it("values at the historical price when configured", async () => {
      const hist = await q.getMiningSummary(filters({ classes: "moon_r4" }), corp, { ...val, mode: "historical" });
      expect(hist.current.value).toBe(150 * 500);
    });

    it("pages the ledger and flags foreign refinery miners", async () => {
      const page = await q.getLedgerRows(filters(), corp, val, { limit: 2, offset: 0 });
      expect(page.total).toBe(4);
      expect(page.rows).toHaveLength(2);
      // Paging one row at a time (as the streamed CSV export does) returns every row exactly once.
      const keys: string[] = [];
      for (let offset = 0; offset < 10; offset++) {
        const { rows } = await q.getLedgerRows(filters(), corp, val, { limit: 1, offset, count: false });
        if (!rows.length) break;
        keys.push(`${rows[0].source}:${rows[0].characterId}:${rows[0].date}:${rows[0].typeId}`);
      }
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(4);
      // The ledger's day groups: entry counts add up to the row count, values to the summary.
      const days = await q.getLedgerDayTotals(filters(), corp, val);
      expect(days.reduce((s, d) => s + d.entries, 0)).toBe(4);
      expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort().reverse());
      const summary = await q.getMiningSummary(filters(), corp, val);
      expect(days.reduce((s, d) => s + d.value, 0)).toBeCloseTo(summary.current.value);
      const observers = await q.getObserverSummaries(filters(), val, 100);
      expect(observers[0].name).toBe("Osmon Athanor");
      expect(observers[0].foreignMiners).toBe(1);
    });
  });

  describe("sessions and tokens", () => {
    it("slides the session expiry with activity", async () => {
      const { createSession, validateSessionToken } = await import("@/core/auth/session");
      const token = await createSession(userA);
      await db().execute(sql`UPDATE sessions SET last_seen_at = now() - interval '10 minutes', expires_at = now() + interval '1 day'`);
      expect(await validateSessionToken(token)).not.toBeNull();
      const [row] = await db().select().from(schema.sessions);
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    });

    it("retires an account whose last character was transferred", async () => {
      const { createSession } = await import("@/core/auth/session");
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      await createSession(userA);
      await createSession(userB);
      // Industry jobs are the installer's own data: they go with the character, like wallet history and mail.
      const job = (jobId: number, characterId: number) => ({
        jobId,
        characterId,
        installerId: characterId,
        locationId: 60003760,
        facilityId: 60003760,
        activityId: 1,
        activity: "manufacturing" as const,
        blueprintId: 1,
        blueprintTypeId: 787,
        blueprintLocationId: 60003760,
        outputLocationId: 60003760,
        runs: 1,
        duration: 3600,
        status: "active" as const,
        startDate: new Date(),
        endDate: new Date(Date.now() + 3600_000),
      });
      await db().insert(schema.industryJobs).values([job(1, 1), job(2, 3)]);
      // Market orders too.
      const order = (orderId: number, characterId: number) => ({
        orderId,
        characterId,
        typeId: 34,
        regionId: 10000002,
        locationId: 60003760,
        isBuyOrder: false,
        isCorporation: false,
        price: 5,
        volumeTotal: 100,
        volumeRemain: 40,
        range: "region" as const,
        duration: 90,
        issued: new Date(),
        state: "open" as const,
      });
      await db().insert(schema.marketOrders).values([order(1, 1), order(2, 2), order(3, 3)]);

      // Bravo keeps an alt: the account stays active and the alt becomes main.
      const bravo = await db().transaction((tx) => detachTransferredCharacter(tx, 2, userB));
      expect(bravo.retired).toBe(false);
      // Alpha loses their only character: disabled and signed out.
      const alpha = await db().transaction((tx) => detachTransferredCharacter(tx, 1, userA));
      expect(alpha.retired).toBe(true);

      const users = await db().select().from(schema.users);
      const a = users.find((u) => u.id === userA)!;
      const b = users.find((u) => u.id === userB)!;
      expect(a).toMatchObject({ isDisabled: true, mainCharacterId: null, role: "member" });
      expect(b).toMatchObject({ isDisabled: false, mainCharacterId: 3 });
      const remaining = await db().select().from(schema.sessions);
      expect(remaining.map((r) => r.userId)).toEqual([userB]);
      expect((await db().select().from(schema.characters)).map((c) => c.characterId)).toEqual([3]);
      expect((await db().select().from(schema.industryJobs)).map((j) => j.jobId)).toEqual([2]);
      expect((await db().select().from(schema.marketOrders)).map((o) => o.orderId)).toEqual([3]);
    });

    it("only invalidates a token on invalid_grant", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { getAccessToken } = await import("@/core/esi/tokens");
      await db().insert(schema.esiTokens).values({ characterId: 1, refreshTokenEnc: encryptToken("refresh"), scopes: [] });
      const respond = (error: string) =>
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
          new Response(JSON.stringify({ error, error_description: error }), { status: error === "invalid_grant" ? 400 : 401 }),
        );

      const misconfigured = respond("invalid_client");
      await expect(getAccessToken(1)).rejects.toThrow();
      misconfigured.mockRestore();
      let [row] = await db().select().from(schema.esiTokens);
      expect(row.status).toBe("active");

      const revoked = respond("invalid_grant");
      await expect(getAccessToken(1)).rejects.toThrow();
      revoked.mockRestore();
      [row] = await db().select().from(schema.esiTokens);
      expect(row.status).toBe("invalid");
    });

    it("stores a rotated refresh token even when verifying the new access token fails", async () => {
      const { decryptToken, encryptToken } = await import("@/core/crypto");
      const { getAccessToken } = await import("@/core/esi/tokens");
      const { exportJWK, generateKeyPair, SignJWT } = await import("jose");
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
      const accessToken = (scopes: string[]) =>
        new SignJWT({ name: "Alpha", owner: "h1", scp: scopes })
          .setProtectedHeader({ alg: "RS256", kid: "k1" })
          .setSubject("CHARACTER:EVE:1")
          .setIssuer("https://login.eveonline.com")
          .setAudience(["test-client-id", "EVE Online"])
          .setExpirationTime("20m")
          .sign(privateKey);
      let jwksUp = false;
      const sso = (token: Record<string, unknown>) =>
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
          const url = String(input instanceof Request ? input.url : input);
          if (url.endsWith("/oauth/jwks")) {
            return jwksUp ? Response.json({ keys: [jwk] }) : new Response("unavailable", { status: 503 });
          }
          return Response.json(token);
        });
      const stored = async () => (await db().select().from(schema.esiTokens))[0];
      await db().insert(schema.esiTokens).values({
        characterId: 1,
        refreshTokenEnc: encryptToken("refresh-1"),
        scopes: ["a", "b"],
        disabledScopes: ["b"],
      });

      // SSO rotates the refresh token, then CCP's JWKS is unreachable: the new refresh token is kept anyway.
      let mock = sso({ access_token: await accessToken(["a", "b"]), refresh_token: "refresh-2", expires_in: 1200, token_type: "Bearer" });
      await expect(getAccessToken(1)).rejects.toThrow();
      mock.mockRestore();
      let row = await stored();
      expect(decryptToken(row.refreshTokenEnc)).toBe("refresh-2");
      expect(row).toMatchObject({ status: "active", accessTokenEnc: null });

      // No refresh token in the response: the stored one stays usable.
      mock = sso({ access_token: await accessToken(["a", "b"]), expires_in: 1200, token_type: "Bearer" });
      await expect(getAccessToken(1)).rejects.toThrow();
      mock.mockRestore();
      expect(decryptToken((await stored()).refreshTokenEnc)).toBe("refresh-2");

      // A malformed response changes nothing.
      mock = sso({ refresh_token: "refresh-x", expires_in: 1200 });
      await expect(getAccessToken(1)).rejects.toThrow(/no access token/);
      mock.mockRestore();
      expect(decryptToken((await stored()).refreshTokenEnc)).toBe("refresh-2");

      // Once verification works, the access token and its scopes are stored; switched-off scopes stay off.
      jwksUp = true;
      const fresh = await accessToken(["a", "b"]);
      mock = sso({ access_token: fresh, refresh_token: "refresh-3", expires_in: 1200, token_type: "Bearer" });
      expect(await getAccessToken(1)).toBe(fresh);
      mock.mockRestore();
      row = await stored();
      expect(decryptToken(row.refreshTokenEnc)).toBe("refresh-3");
      expect(decryptToken(row.accessTokenEnc!)).toBe(fresh);
      expect(row).toMatchObject({ status: "active", scopes: ["a"], disabledScopes: ["b"], lastError: null });
      expect(await getAccessToken(1)).toBe(fresh);
    });

    it("hands out the current token when the row changes while a refreshed token is verified", async () => {
      const { decryptToken, encryptToken } = await import("@/core/crypto");
      const { getAccessToken, TokenInvalidError } = await import("@/core/esi/tokens");
      const sso = await import("@/core/auth/sso");
      const refresh = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () =>
          Response.json({ access_token: "refreshed", refresh_token: "rotated", expires_in: 1200, token_type: "Bearer" }),
        );
      // While the refreshed access token is being verified, `meanwhile` changes the row.
      const verifying = (meanwhile: () => Promise<unknown>) =>
        vi.spyOn(sso, "verifyAccessToken").mockImplementation(async () => {
          await meanwhile();
          return { characterId: 1, name: "Alpha", ownerHash: "h1", scopes: ["a"], expiresAt: new Date(Date.now() + 1_200_000) };
        });
      await db().insert(schema.esiTokens).values({ characterId: 1, refreshTokenEnc: encryptToken("old"), scopes: ["a"] });

      // A new login: its token is handed out and kept, not the one refreshed from the grant it replaced.
      let verify = verifying(() =>
        getDb()
          .update(schema.esiTokens)
          .set({
            refreshTokenEnc: encryptToken("from-login"),
            accessTokenEnc: encryptToken("login-access"),
            accessTokenExpiresAt: new Date(Date.now() + 1_200_000),
          }),
      );
      expect(await getAccessToken(1, { forceRefresh: true })).toBe("login-access");
      verify.mockRestore();
      const [row] = await db().select().from(schema.esiTokens);
      expect(decryptToken(row.refreshTokenEnc)).toBe("from-login");
      expect(decryptToken(row.accessTokenEnc!)).toBe("login-access");

      // The character is removed: no token at all.
      verify = verifying(() => getDb().delete(schema.esiTokens));
      await expect(getAccessToken(1, { forceRefresh: true })).rejects.toBeInstanceOf(TokenInvalidError);
      verify.mockRestore();
      refresh.mockRestore();
    });

    it("does not overwrite a token a login stored during the refresh", async () => {
      const { decryptToken, encryptToken } = await import("@/core/crypto");
      const { getAccessToken } = await import("@/core/esi/tokens");
      await db().insert(schema.esiTokens).values({ characterId: 1, refreshTokenEnc: encryptToken("old"), scopes: [] });
      // While SSO answers the refresh, a new EVE login replaces the token with a fresh one.
      const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        await getDb()
          .update(schema.esiTokens)
          .set({
            refreshTokenEnc: encryptToken("from-login"),
            accessTokenEnc: encryptToken("login-access"),
            accessTokenExpiresAt: new Date(Date.now() + 1_200_000),
          });
        return Response.json({ access_token: "unused", refresh_token: "rotated-old", expires_in: 1200, token_type: "Bearer" });
      });
      expect(await getAccessToken(1)).toBe("login-access");
      mock.mockRestore();
      const [row] = await db().select().from(schema.esiTokens);
      expect(decryptToken(row.refreshTokenEnc)).toBe("from-login");
    });
  });

  describe("user management", () => {
    const roles = async () =>
      Object.fromEntries((await db().select().from(schema.users)).map((u) => [u.id, u.role]));
    const makeAdmins = () => db().update(schema.users).set({ role: "admin" });

    it("never lets two admins demote each other at the same time", async () => {
      const { changeUserAccess } = await import("@/core/auth/manage-users");
      await makeAdmins();
      const results = await Promise.allSettled([
        changeUserAccess(userA, userB, { role: "director" }),
        changeUserAccess(userB, userA, { role: "director" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(Object.values(await roles()).sort()).toEqual(["admin", "director"]);
    });

    it("judges the actor by their role and status at the time of the change", async () => {
      const { changeUserAccess } = await import("@/core/auth/manage-users");
      await makeAdmins();
      await changeUserAccess(userA, userB, { role: "director" });
      // Bravo's request was authorised while still an admin; by now Bravo is a director.
      await expect(changeUserAccess(userB, userA, { role: "member" })).rejects.toThrow(/below your own role/);
      expect(await roles()).toEqual({ [userA]: "admin", [userB]: "director" });

      await db().update(schema.users).set({ role: "admin" });
      await changeUserAccess(userA, userB, { isDisabled: true });
      await expect(changeUserAccess(userB, userA, { isDisabled: true })).rejects.toThrow(/permission/);
      const [a] = await db().select().from(schema.users).where(sql`id = ${userA}`);
      expect(a.isDisabled).toBe(false);
    });

    it("re-checks users.manage, so a manager demoted mid-request can't approve a guest", async () => {
      const { changeUserAccess } = await import("@/core/auth/manage-users");
      await db().update(schema.users).set({ role: "member" }).where(sql`id = ${userA}`);
      await db().update(schema.users).set({ role: "guest" }).where(sql`id = ${userB}`);
      // Alpha was a director when the request was authorised; a member still outranks a guest.
      await expect(changeUserAccess(userA, userB, { role: "member" }, { onlyFromRole: "guest" })).rejects.toThrow(/permission/);
      expect((await roles())[userB]).toBe("guest");

      // An override that hands users.manage to members is honoured: a member may disable a guest.
      const { setSetting } = await import("@/core/settings");
      await setSetting("permissions.overrides", { "users.manage": "member" });
      await changeUserAccess(userA, userB, { isDisabled: true });
      const [b] = await db().select().from(schema.users).where(sql`id = ${userB}`);
      expect(b.isDisabled).toBe(true);
    });

    it("signs a user out everywhere when disabling them", async () => {
      const { changeUserAccess } = await import("@/core/auth/manage-users");
      const { createSession } = await import("@/core/auth/session");
      await db().update(schema.users).set({ role: "admin" }).where(sql`id = ${userA}`);
      await createSession(userA);
      await createSession(userB);
      await changeUserAccess(userA, userB, { isDisabled: true });
      expect((await db().select().from(schema.sessions)).map((r) => r.userId)).toEqual([userA]);
    });

    it("writes the audit entry with the change, and keeps neither when the entry can't be written", async () => {
      const { changeUserAccess } = await import("@/core/auth/manage-users");
      await db().update(schema.users).set({ role: "admin" }).where(sql`id = ${userA}`);
      await db().update(schema.users).set({ role: "member" }).where(sql`id = ${userB}`);
      const entry = (from: string) => ({ action: "user.role.changed", targetType: "user", targetId: userB, details: { from } });
      await changeUserAccess(userA, userB, { role: "director" }, { audit: entry });
      const logged = await db().select().from(schema.auditLog).where(sql`target_id = ${userB}`);
      expect(logged.map((r) => [r.action, r.details])).toEqual([["user.role.changed", { from: "member" }]]);

      // An actor id that isn't a user fails the audit insert's foreign key, so the role change rolls back.
      await expect(
        changeUserAccess(userA, userB, { role: "member" }, { audit: () => ({ actorUserId: crypto.randomUUID(), action: "user.role.changed" }) }),
      ).rejects.toThrow();
      expect((await roles())[userB]).toBe("director");
    });

    it("only approves users who are still guests", async () => {
      const { changeUserAccess } = await import("@/core/auth/manage-users");
      await db().update(schema.users).set({ role: "admin" }).where(sql`id = ${userA}`);
      await db().update(schema.users).set({ role: "director" }).where(sql`id = ${userB}`);
      const result = await changeUserAccess(userA, userB, { role: "member" }, { onlyFromRole: "guest" });
      expect(result).toEqual({ from: "director", changed: false });
      expect((await roles())[userB]).toBe("director");
    });

    it("makes only the very first account admin, not the next sign-in after the last admin is gone", async () => {
      const { provisionFromSso } = await import("@/core/auth/provision");
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) =>
          reply(path.startsWith("/corporations/") ? { name: "Elsewhere", ticker: "ELSE", member_count: 3 } : { corporation_id: 200 }),
        ) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      const signIn = (characterId: number) =>
        provisionFromSso({
          verified: { characterId, name: `Pilot ${characterId}`, ownerHash: `h${characterId}`, scopes: [], expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" },
          intent: "login",
          currentUserId: null,
        });
      try {
        // Alpha and Bravo exist, but neither is an admin.
        expect((await signIn(50)).role).toBe("guest");
        await db().execute(sql`TRUNCATE users, characters RESTART IDENTITY CASCADE`);
        expect((await signIn(51)).role).toBe("admin");
        // The first admin's corporation became the home corporation, so a corp mate is auto-approved.
        expect((await signIn(52)).role).toBe("member");
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
    });

    it("gives outsiders no account while sign-ups are restricted to members", async () => {
      const { provisionFromSso, ProvisionError } = await import("@/core/auth/provision");
      const { setSetting } = await import("@/core/settings");
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const corpOf: Record<number, number> = { 1: 100, 60: 200, 61: 200 };
      const getSpy = vi.spyOn(getEsi(), "get").mockImplementation(async (path: string) => {
        if (path.startsWith("/corporations/")) return reply({ name: "Corp", ticker: "CORP", member_count: 3 });
        return reply({ corporation_id: corpOf[Number(path.split("/")[2])] });
      }) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      const signIn = (characterId: number, intent: "login" | "link" = "login", currentUserId: string | null = null) =>
        provisionFromSso({
          verified: { characterId, name: `Pilot ${characterId}`, ownerHash: `h${characterId}`, scopes: [], expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" },
          intent,
          currentUserId,
        });
      try {
        await setSetting("corp.homeCorporationId", 100);
        // An outsider who registered before the switch keeps signing in as a guest.
        expect((await signIn(60)).role).toBe("guest");
        await setSetting("access.restrictToMembers", true);
        expect((await signIn(60)).role).toBe("guest");

        const refused = await signIn(61).catch((err: unknown) => err);
        expect(refused).toBeInstanceOf(ProvisionError);
        expect((refused as InstanceType<typeof ProvisionError>).code).toBe("notMember");
        expect(await db().select().from(schema.characters).where(sql`character_id = 61`)).toEqual([]);
        // audit_log isn't truncated between tests, so look for this attempt specifically.
        const blocked = await db()
          .select()
          .from(schema.auditLog)
          .where(sql`action = 'user.registration.blocked' AND target_id = '61'`);
        expect(blocked.length).toBeGreaterThan(0);

        // Members still sign in, and alts outside the corporation can still be linked to an account.
        expect((await signIn(1)).userId).toBe(userA);
        expect((await signIn(61, "link", userA)).userId).toBe(userA);
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
    });

    it("finds enabled guests with no character in the home corporation or its alliance", async () => {
      const { outsideGuestIds } = await import("@/core/auth/manage-users");
      const { setSetting } = await import("@/core/settings");
      const guest = async (characterId: number, corporationId: number, allianceId: number | null = null) => {
        const [u] = await db().insert(schema.users).values({ role: "guest", mainCharacterId: characterId }).returning();
        await db()
          .insert(schema.characters)
          .values({ characterId, userId: u.id, name: `Pilot ${characterId}`, corporationId, allianceId, ownerHash: `h${characterId}` });
        return u.id;
      };
      const outsider = await guest(70, 200);
      const allied = await guest(71, 300, 500);
      const withCorpAlt = await guest(72, 200);
      await db()
        .insert(schema.characters)
        .values({ characterId: 73, userId: withCorpAlt, name: "Corp Alt", corporationId: 100, ownerHash: "h73" });
      const disabled = await guest(74, 200);
      await db().update(schema.users).set({ isDisabled: true }).where(sql`id = ${disabled}`);
      // Bravo is an approved member, now outside: approved accounts are left alone.
      await db().update(schema.characters).set({ corporationId: 200 }).where(sql`user_id = ${userB}`);
      // eve_corporations isn't truncated between tests.
      await db()
        .insert(schema.eveCorporations)
        .values({ corporationId: 100, name: "Home", ticker: "HOME", allianceId: 500 })
        .onConflictDoUpdate({ target: schema.eveCorporations.corporationId, set: { allianceId: 500 } });

      expect(await outsideGuestIds()).toEqual([]);
      await setSetting("corp.homeCorporationId", 100);
      expect((await outsideGuestIds()).sort()).toEqual([outsider, allied].sort());
      await setSetting("access.autoApproveAllianceMembers", true);
      expect(await outsideGuestIds()).toEqual([outsider]);
    });
  });

  describe("killboard", () => {
    const kb = () => import("@/modules/killboard/queries");
    const HOME = 100;
    const at = (iso: string) => `${iso}Z`;
    // A kill, a solo kill (previous week), a loss, an awox (loss only), someone else's fight and an old kill.
    const fixture = [
      { killmail_id: 1, killmail_time: at("2026-09-28T20:00:00"), solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 900 },
        attackers: [
          { character_id: 1, corporation_id: HOME, ship_type_id: 17843, damage_done: 600, final_blow: true },
          { character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_done: 300, final_blow: false },
        ],
        zkb: { hash: "h1", totalValue: 100e6, solo: false } },
      { killmail_id: 2, killmail_time: at("2026-09-20T20:00:00"), solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 587, damage_taken: 300 },
        attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 11186, damage_done: 300, final_blow: true }],
        zkb: { hash: "h2", totalValue: 10e6, solo: true } },
      { killmail_id: 3, killmail_time: at("2026-09-29T10:00:00"), solar_system_id: 30000181,
        victim: { character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_taken: 5000 },
        attackers: [{ character_id: 9, corporation_id: 555, ship_type_id: 622, damage_done: 5000, final_blow: true }],
        zkb: { hash: "h3", totalValue: 50e6 } },
      { killmail_id: 4, killmail_time: at("2026-09-29T11:00:00"), solar_system_id: 30000181,
        victim: { character_id: 1, corporation_id: HOME, ship_type_id: 670, damage_taken: 100 },
        attackers: [{ character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_done: 100, final_blow: true }],
        zkb: { hash: "h4", totalValue: 10_000, awox: true } },
      { killmail_id: 5, killmail_time: at("2026-09-29T12:00:00"), solar_system_id: 30000180,
        victim: { character_id: 7, corporation_id: 777, ship_type_id: 622, damage_taken: 100 },
        attackers: [{ character_id: 8, corporation_id: 888, ship_type_id: 622, damage_done: 100, final_blow: true }],
        zkb: { hash: "h5", totalValue: 1e9 } },
      { killmail_id: 6, killmail_time: at("2026-06-01T12:00:00"), solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 100 },
        attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 622, damage_done: 100, final_blow: true }],
        zkb: { hash: "h6", totalValue: 5e9 } },
    ];
    const windows = {
      period: { from: "2026-07-05", to: "2026-10-02" },
      week: { from: "2026-09-25", to: "2026-10-01" },
      prevWeek: { from: "2026-09-18", to: "2026-09-24" },
    };

    beforeEach(async () => {
      const { storeKillmails } = await import("@/modules/killboard/sync");
      await db().insert(schema.eveEntities).values([
        { id: 1, name: "Alpha", category: "character" },
        { id: 2, name: "Bravo", category: "character" },
      ]);
      await db().insert(schema.eveSystems).values({ systemId: 30000181, name: "Tama", securityStatus: 0.28 });
      expect(await storeKillmails(db(), fixture as never)).toBe(6);
    });

    it("stores killmails idempotently and refreshes zKillboard values", async () => {
      const { storeKillmails } = await import("@/modules/killboard/sync");
      expect(await storeKillmails(db(), fixture as never)).toBe(0);
      const revalued = { ...fixture[0], zkb: { ...fixture[0].zkb, totalValue: 120e6 } };
      expect(await storeKillmails(db(), [revalued] as never)).toBe(0);
      // A change in any refreshed field alone is persisted too.
      const refitted = { ...revalued, zkb: { ...revalued.zkb, fittedValue: 7e6, labels: ["pvp", "loc:lowsec"] } };
      expect(await storeKillmails(db(), [refitted] as never)).toBe(0);
      const rows = await db().execute<{ v: number; f: number; l: string[]; n: number }>(
        sql`SELECT k.total_value::float8 AS v, k.fitted_value::float8 AS f, k.labels AS l,
                   (SELECT COUNT(*) FROM killmail_attackers)::int AS n
            FROM killmails k WHERE k.killmail_id = 1`,
      );
      expect(rows[0]).toEqual({ v: 120e6, f: 7e6, l: ["pvp", "loc:lowsec"], n: 7 });
    });

    it("reports the sync time only for the corporation that was synced", async () => {
      const q2 = await kb();
      const syncedAt = "2026-10-02T02:00:00.000Z";
      await db().insert(schema.syncJobs).values({
        jobKey: "killboard.zkill-sync",
        ownerType: "global",
        ownerId: 0,
        meta: { corporationId: 999, lastSyncAt: syncedAt },
      });
      // The home corporation changed to 100, but the last sync was for 999.
      expect((await q2.getKillboardStatus(HOME)).lastSyncAt).toBeNull();
      await db().execute(sql`UPDATE sync_jobs SET meta = ${JSON.stringify({ corporationId: HOME, lastSyncAt: syncedAt })}::jsonb`);
      expect((await q2.getKillboardStatus(HOME)).lastSyncAt?.toISOString()).toBe(syncedAt);
    });

    it("counts kills and losses like zKillboard (awox is a loss only)", async () => {
      const q2 = await kb();
      expect(await q2.getTotals(HOME, windows.period)).toEqual({
        kills: 2,
        losses: 2,
        iskDestroyed: 110e6,
        iskLost: 50e6 + 10_000,
        soloKills: 1,
      });
      expect(await q2.getTotals(HOME, windows.week)).toMatchObject({ kills: 1, losses: 2 });
      expect(await q2.getTotals(HOME, windows.prevWeek)).toMatchObject({ kills: 1, losses: 0 });

      const killSystems = await q2.getTopSystems(HOME, windows, "kills");
      expect(killSystems).toEqual([
        { systemId: 30000180, name: "Osmon", security: 0.68, count: 2, value: 110e6, week: 1, prevWeek: 1 },
      ]);
      const lossSystems = await q2.getTopSystems(HOME, windows, "losses");
      expect(lossSystems.map((r) => [r.name, r.count, r.week, r.prevWeek])).toEqual([["Tama", 2, 2, 0]]);

      const recent = await q2.getRecentActivity(HOME, windows.period);
      expect(recent.map((r) => [r.killmailId, r.kind])).toEqual([
        [4, "loss"],
        [3, "loss"],
        [1, "kill"],
        [2, "kill"],
      ]);
    });

    it("aggregates ships and pilots with week-over-week deltas", async () => {
      const q2 = await kb();
      const ships = await q2.getShips(HOME, windows);
      expect(ships.map((s) => [s.typeId, s.kills, s.destroyed, s.losses, s.lost, s.killsDelta, s.lossesDelta])).toEqual([
        [17843, 1, 100e6, 1, 50e6, 1, 1],
        [11186, 1, 10e6, 0, 0, -1, 0],
        [670, 0, 0, 1, 10_000, 0, 1],
      ]);
      const pilots = await q2.getPilots(HOME, windows);
      expect(pilots).toEqual([
        { characterId: 1, name: "Alpha", kills: 2, losses: 1, finalBlows: 2, solo: 1, destroyed: 110e6, lost: 10_000, killsDelta: 0, lossesDelta: 1 },
        { characterId: 2, name: "Bravo", kills: 1, losses: 1, finalBlows: 0, solo: 0, destroyed: 100e6, lost: 50e6, killsDelta: 1, lossesDelta: 1 },
      ]);
      const notable = await q2.getNotable(HOME, windows.week, "kills");
      expect(notable).toMatchObject({ killmailId: 1, finalBlowName: "Alpha", value: 100e6 });
    });

    it("hands out live kills and losses stored after the cursor, with what the notification shows", async () => {
      const q2 = await kb();
      const { storeKillmails } = await import("@/modules/killboard/sync");
      // eve_corporations isn't truncated here (other suites leave rows behind): set the two this test reads.
      await db().execute(sql`DELETE FROM eve_corporations WHERE corporation_id IN (${HOME}, 555)`);
      await db().insert(schema.eveCorporations).values({ corporationId: 555, name: "Enemy Corp", ticker: "ENMY" });
      const cursor = q2.parseLiveCursor(await q2.liveCursorNow())!;
      expect(cursor.id).toBe(0);
      // The fixture above is older than the live window and was stored before the cursor anyway.
      expect((await q2.getLiveEvents(HOME, cursor)).events).toEqual([]);

      const recent = new Date(Date.now() - 10 * 60_000).toISOString();
      await storeKillmails(db(), [
        // Kill: an outsider landed the final blow, Bravo did the most corp damage.
        { killmail_id: 11, killmail_time: recent, solar_system_id: 30000180,
          victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 900 },
          attackers: [
            { character_id: 1, corporation_id: HOME, ship_type_id: 11186, damage_done: 100, final_blow: false },
            { character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_done: 500, final_blow: false },
            { character_id: 8, corporation_id: 888, ship_type_id: 622, damage_done: 300, final_blow: true },
          ],
          zkb: { hash: "l11", totalValue: 75e6 } },
        // Loss: Bravo's ship, killed by the outsider.
        { killmail_id: 12, killmail_time: recent, solar_system_id: 30000181,
          victim: { character_id: 2, corporation_id: HOME, ship_type_id: 17843, damage_taken: 5000 },
          attackers: [{ character_id: 9, corporation_id: 555, ship_type_id: 622, damage_done: 5000, final_blow: true }],
          zkb: { hash: "l12", totalValue: 40e6, solo: true } },
        // Someone else's fight, and a corp kill too old to announce.
        { killmail_id: 13, killmail_time: recent, solar_system_id: 30000180,
          victim: { character_id: 7, corporation_id: 777, ship_type_id: 622, damage_taken: 1 },
          attackers: [{ character_id: 8, corporation_id: 888, ship_type_id: 622, damage_done: 1, final_blow: true }],
          zkb: { hash: "l13", totalValue: 1e9 } },
        { killmail_id: 14, killmail_time: at("2026-09-01T12:00:00"), solar_system_id: 30000180,
          victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 1 },
          attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 622, damage_done: 1, final_blow: true }],
          zkb: { hash: "l14", totalValue: 1e9 } },
      ] as never);

      const live = await q2.getLiveEvents(HOME, cursor);
      expect(live.events).toEqual([
        expect.objectContaining({
          killmailId: 11, kind: "kill", shipTypeId: 622, victimId: 9, victimName: "Outsider", victimTicker: "ENMY",
          attacker: { characterId: 2, name: "Bravo", ticker: null, shipTypeId: 17843, shipName: null, finalBlow: false },
          attackerCount: 3, systemName: "Osmon", security: 0.68, value: 75e6,
        }),
        expect.objectContaining({
          killmailId: 12, kind: "loss", shipTypeId: 17843, victimId: 2, victimName: "Bravo",
          attacker: { characterId: 9, name: "Outsider", ticker: "ENMY", shipTypeId: 622, shipName: null, finalBlow: true },
          systemName: "Tama", value: 40e6, solo: true,
        }),
      ]);
      const next = q2.parseLiveCursor(live.cursor)!;
      expect(next.id).toBe(12);
      expect((await q2.getLiveEvents(HOME, next)).events).toEqual([]);

      // A batch sharing one timestamp, larger than a page: the id in the cursor keeps the rest.
      await storeKillmails(db(), Array.from({ length: 12 }, (_, i) => ({
        killmail_id: 100 + i, killmail_time: recent, solar_system_id: 30000180,
        victim: { character_id: 9, corporation_id: 555, ship_type_id: 622, damage_taken: 1 },
        attackers: [{ character_id: 1, corporation_id: HOME, ship_type_id: 622, damage_done: 1, final_blow: true }],
        zkb: { hash: `b${i}`, totalValue: 1 },
      })) as never);
      const first = await q2.getLiveEvents(HOME, next);
      const second = await q2.getLiveEvents(HOME, q2.parseLiveCursor(first.cursor)!);
      expect([...first.events, ...second.events].map((e) => e.killmailId)).toEqual(Array.from({ length: 12 }, (_, i) => 100 + i));
    });

    it("accepts only well-formed live cursors that name a real instant", async () => {
      const { parseLiveCursor } = await kb();
      expect(parseLiveCursor("2026-10-03T16:01:34.110089Z_42")).toEqual({ at: "2026-10-03T16:01:34.110089Z", id: 42 });
      expect(parseLiveCursor("2026-10-03T16:01:34Z_0")).toEqual({ at: "2026-10-03T16:01:34Z", id: 0 });
      for (const bad of ["2026-99-99T00:00:00Z_1", "2026-02-30T00:00:00Z_1", "2026-10-03T16:01:34Z", "now(); DROP", "", null]) {
        expect(parseLiveCursor(bad)).toBeNull();
      }
    });

    it("syncs only killmails inside the plan's window", async () => {
      const { syncCorporationKillmails } = await import("@/modules/killboard/sync");
      await db().execute(sql`TRUNCATE killmails, killmail_attackers`);
      const resolved: number[] = [];
      const zkill = {
        async *corporationKillmails() {
          yield fixture.slice(0, 3) as never;
          yield fixture.slice(2, 4) as never; // overlap is de-duplicated
        },
      };
      const out = await syncCorporationKillmails(
        db(),
        HOME,
        { mode: "backfill", windows: [{ year: 2026, month: 9 }], since: new Date("2026-09-21T00:00:00Z") },
        { zkill, resolve: async (_corp, entries) => void resolved.push(...entries.map((e) => e.killmail_id)) },
      );
      expect(out).toEqual({ mode: "backfill", fetched: 3, inserted: 3 });
      expect(resolved.sort()).toEqual([1, 3, 4]);
    });

    it("writes one situation report per week window", async () => {
      const { generateSituationReport, getLatestReport } = await import("@/modules/killboard/report/generate");
      const now = new Date("2026-10-02T03:00:00Z");
      const first = await generateSituationReport(db(), HOME, now);
      expect(first).toMatchObject({ created: true, source: "template", week: windows.week });
      expect((await generateSituationReport(db(), HOME, now)).created).toBe(false);
      expect((await generateSituationReport(db(), HOME, now, { force: true })).created).toBe(true);
      const latest = await getLatestReport(HOME);
      expect(latest?.periodTo).toBe("2026-10-01");
      expect(latest?.facts.week).toMatchObject({ kills: 1, losses: 2 });
      expect(latest?.facts.topPilots.map((p) => p.name)).toEqual(["Alpha", "Bravo"]);
      expect(latest?.report.paragraphs.length).toBeGreaterThan(0);
    });
  });

  describe("appraisal", () => {
    it("appraises a paste end to end and saves a shareable snapshot", async () => {
      const { appraise, saveAppraisal } = await import("@/modules/trade/appraisal/appraise");
      await db().insert(schema.eveGroups).values({ groupId: 25, name: "Frigate", categoryId: 6 });
      await db().insert(schema.eveTypes).values([
        { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, packagedVolume: 0.01, portionSize: 1 },
        { typeId: 587, name: "Rifter", groupId: 25, volume: 27289, packagedVolume: 2500, portionSize: 1 },
      ]);
      await db().insert(schema.typeValues).values([
        { typeId: 34, source: "jita_buy", unitPrice: 4, basis: "direct" },
        { typeId: 34, source: "jita_sell", unitPrice: 5, basis: "direct" },
        // An ESI-average fallback is not a Jita price.
        { typeId: 587, source: "jita_buy", unitPrice: 400_000, basis: "esi_average" },
      ]);
      // No network: unknown names resolve to nothing, live pricing finds no orders.
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/universe/ids")) return new Response("{}", { status: 200 });
        return new Response("[]", { status: 200, headers: { "x-pages": "1" } });
      });
      try {
        const result = await appraise("Tritanium x 1,000\ntritanium\t500\n[Rifter, test]\nNot an item");
        expect(result.items).toEqual([
          { typeId: 34, name: "Tritanium", quantity: 1500, buy: 4, sell: 5, volume: 0.01 },
          { typeId: 587, name: "Rifter", quantity: 1, buy: null, sell: null, volume: 2500 },
        ]);
        expect(result.totals).toMatchObject({ buy: 6000, sell: 7500, split: 6750, volume: 2515, types: 2, unpriced: 1 });
        expect(result.unparsed).toEqual([{ line: 4, raw: "Not an item" }]);
        // Rifter only had a recent buy-side value, so it was priced again; Tritanium was fresh on both sides.
        const orderCalls = fetchSpy.mock.calls.map(([u]) => String(u instanceof Request ? u.url : u)).filter((u) => u.includes("/orders"));
        expect(orderCalls.some((u) => u.includes("type_id=587"))).toBe(true);
        expect(orderCalls.some((u) => u.includes("type_id=34"))).toBe(false);
        // Both stay in the hourly price job for a while.
        const interest = await db().select().from(schema.priceInterest);
        expect(interest.map((r) => r.typeId).sort()).toEqual([34, 587]);

        const id = await saveAppraisal(result, { input: "x", pricePercent: 90, userId: userA, userName: "Alpha" });
        const [row] = await db().select().from(schema.appraisals);
        expect(row).toMatchObject({ id, pricePercent: 90, createdBy: userA, createdByName: "Alpha" });
        expect((row.items as unknown[]).length).toBe(2);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("appraisal rate limit", () => {
    it("counts every attempt, deleted or parallel, and only within the window", async () => {
      const { APPRAISAL_RATE_LIMIT, APPRAISAL_RATE_WINDOW_MS, reserveAppraisalAttempt } = await import(
        "@/modules/trade/appraisal/appraise"
      );
      const now = new Date();
      // Parallel submits are serialised: exactly the limit gets through.
      const results = await Promise.all(
        Array.from({ length: APPRAISAL_RATE_LIMIT + 5 }, () => reserveAppraisalAttempt(userA, now)),
      );
      expect(results.filter(Boolean)).toHaveLength(APPRAISAL_RATE_LIMIT);
      // Deleting saved appraisals doesn't free a slot; another user is unaffected.
      await db().delete(schema.appraisals);
      expect(await reserveAppraisalAttempt(userA, now)).toBe(false);
      expect(await reserveAppraisalAttempt(userB, now)).toBe(true);
      expect(await reserveAppraisalAttempt(userA, new Date(now.getTime() + APPRAISAL_RATE_WINDOW_MS + 1))).toBe(true);
    });
  });

  describe("ESI failures in appraisal and field estimator", () => {
    const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
    const outage = () => new EsiError("ESI POST /universe/ids failed: 503", 503, "/universe/ids");

    it("refuses an appraisal when names can't be resolved, and never sends names ESI would reject", async () => {
      const { appraise, AppraisalUnavailableError } = await import("@/modules/trade/appraisal/appraise");
      const { getEsi } = await import("@/core/esi");
      const postSpy = vi.spyOn(getEsi(), "post").mockRejectedValue(outage());
      try {
        await expect(appraise("Veldspar x 10\nScordite x 5")).rejects.toBeInstanceOf(AppraisalUnavailableError);
        // A line too long to be any item name is skipped rather than failing the whole batch.
        postSpy.mockResolvedValue(reply({}));
        await appraise(`Scordite x 5\n${"x".repeat(101)}`);
        const sent = postSpy.mock.lastCall?.[1] as string[];
        expect(sent).toContain("Scordite");
        expect(sent.every((n) => n.length <= 100)).toBe(true);
      } finally {
        postSpy.mockRestore();
      }
    });

    it("refuses an appraisal when a resolved type can't be loaded", async () => {
      const { appraise, AppraisalUnavailableError } = await import("@/modules/trade/appraisal/appraise");
      const { getEsi } = await import("@/core/esi");
      const postSpy = vi.spyOn(getEsi(), "post").mockResolvedValue(reply({ inventory_types: [{ id: 1228, name: "Scordite" }] }));
      // Only the type lookup fails; pricing would succeed.
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) => {
          if (path.startsWith("/universe/types/")) throw outage();
          return reply([]);
        }) as unknown as { mockRestore: () => void };
      try {
        await expect(appraise("Scordite x 5")).rejects.toBeInstanceOf(AppraisalUnavailableError);
      } finally {
        postSpy.mockRestore();
        getSpy.mockRestore();
      }
    });

    it("flags ores whose resolved type can't be loaded in the field estimator", async () => {
      vi.doMock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: userA }) }));
      const { priceSurveyTypes } = await import("@/modules/mining/estimator/actions");
      const { getEsi } = await import("@/core/esi");
      const postSpy = vi.spyOn(getEsi(), "post").mockResolvedValue(reply({ inventory_types: [{ id: 1228, name: "Scordite" }] }));
      const getSpy = vi.spyOn(getEsi(), "get").mockRejectedValue(outage()) as unknown as { mockRestore: () => void };
      try {
        const result = await priceSurveyTypes(["Veldspar", "Scordite"]);
        expect(result.esiUnavailable).toBe(true);
        expect(Object.keys(result.prices)).toEqual(["veldspar"]);
      } finally {
        postSpy.mockRestore();
        getSpy.mockRestore();
        vi.doUnmock("@/core/auth/dal");
      }
    });

    it("refuses an appraisal when stale items can't be priced", async () => {
      const { appraise, AppraisalUnavailableError } = await import("@/modules/trade/appraisal/appraise");
      const { getEsi } = await import("@/core/esi");
      // Veldspar has no recent jita_sell value, so it must be priced live.
      const getSpy = vi.spyOn(getEsi(), "get").mockRejectedValue(outage()) as unknown as { mockRestore: () => void };
      try {
        await expect(appraise("Veldspar x 10")).rejects.toBeInstanceOf(AppraisalUnavailableError);
      } finally {
        getSpy.mockRestore();
      }
    });

    it("prices what it can in the field estimator and flags the rest", async () => {
      vi.doMock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: userA }) }));
      const { priceSurveyTypes } = await import("@/modules/mining/estimator/actions");
      const { getEsi } = await import("@/core/esi");
      await db().insert(schema.eveTypes).values({ typeId: 1228, name: "Scordite", groupId: 462, volume: 0.15, portionSize: 100 });
      const postSpy = vi.spyOn(getEsi(), "post").mockRejectedValue(outage());
      const getSpy = vi.spyOn(getEsi(), "get").mockRejectedValue(outage()) as unknown as { mockRestore: () => void };
      try {
        const result = await priceSurveyTypes(["Veldspar", "Scordite", "Pyroxeres"]);
        expect(result.esiUnavailable).toBe(true);
        // Veldspar had a value; Scordite couldn't be priced and Pyroxeres couldn't be resolved, so
        // both are left out for the next request to try again rather than cached as unpriced.
        expect(Object.keys(result.prices)).toEqual(["veldspar"]);
        expect(result.prices.veldspar.unitPrice).toBe(10);
      } finally {
        postSpy.mockRestore();
        getSpy.mockRestore();
        vi.doUnmock("@/core/auth/dal");
      }
    });
  });

  describe("field estimator pricing", () => {
    it("prices a stale value again before using it", async () => {
      vi.doMock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: userA }) }));
      const { priceSurveyTypes } = await import("@/modules/mining/estimator/actions");
      const { getEsi } = await import("@/core/esi");
      await db().execute(sql`UPDATE type_values SET updated_at = now() - interval '3 hours' WHERE type_id = 1230`);
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi.spyOn(getEsi(), "get").mockImplementation(async (path: string) =>
        reply(path.includes("/orders") ? [{ is_buy_order: true, location_id: 60003760, price: 12 }] : []),
      ) as unknown as { mockRestore: () => void };
      try {
        const result = await priceSurveyTypes(["Veldspar"]);
        expect(result).toMatchObject({ esiUnavailable: false, prices: { veldspar: { unitPrice: 12 } } });
        expect((await db().select().from(schema.priceInterest)).map((r) => r.typeId)).toEqual([1230]);
      } finally {
        getSpy.mockRestore();
        vi.doUnmock("@/core/auth/dal");
      }
    });

    it("keeps the ores it priced when ESI rate-limits the rest", async () => {
      vi.doMock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: userA }) }));
      const { priceSurveyTypes } = await import("@/modules/mining/estimator/actions");
      const { getEsi } = await import("@/core/esi");
      const { EsiRateLimitedError } = await import("@/core/esi/client");
      await db().insert(schema.eveTypes).values({ typeId: 1228, name: "Scordite", groupId: 462, volume: 0.15, portionSize: 100 });
      await db().execute(sql`UPDATE type_values SET updated_at = now() - interval '3 hours' WHERE type_id = 1230`);
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi.spyOn(getEsi(), "get").mockImplementation(async (path: string, opts?: { query?: Record<string, unknown> }) => {
        if (!path.includes("/orders")) return reply([]);
        if (opts?.query?.type_id === 1228) throw new EsiRateLimitedError(path, 420, new Date(Date.now() + 60_000));
        return reply([{ is_buy_order: true, location_id: 60003760, price: 12 }]);
      }) as unknown as { mockRestore: () => void };
      try {
        const result = await priceSurveyTypes(["Veldspar", "Scordite"]);
        expect(result.esiUnavailable).toBe(true);
        expect(Object.keys(result.prices)).toEqual(["veldspar"]);
        expect(result.prices.veldspar.unitPrice).toBe(12);
      } finally {
        getSpy.mockRestore();
        vi.doUnmock("@/core/auth/dal");
      }
    });
  });

  describe("market price job", async () => {
    const { marketPricesJob } = await import("@/core/sync/core-jobs");
    const { miningPriceInterest } = await import("@/modules/mining/jobs");
    const { EsiRateLimitedError } = await import("@/core/esi/client");
    const job = marketPricesJob([miningPriceInterest]);

    /** ESI that answers order requests per type id: a Jita buy price, or an HTTP status to fail with. */
    const fakeEsi = (orders: Record<number, number | { status: number }>, requested: number[] = []) =>
      new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        maxRetries: 0,
        sleep: async () => {},
        fetchImpl: (async (url: string) => {
          const u = new URL(String(url));
          if (u.pathname.endsWith("/markets/prices")) return Response.json([]);
          const typeId = Number(u.searchParams.get("type_id"));
          requested.push(typeId);
          const answer = orders[typeId];
          if (typeof answer === "object") {
            return Response.json({ error: "nope" }, { status: answer.status, headers: { "retry-after": "60" } });
          }
          const body = answer ? [{ is_buy_order: true, location_id: 60003760, price: answer }] : [];
          return Response.json(body, { headers: { "x-pages": "1" } });
        }) as typeof fetch,
      });
    const run = (esi: InstanceType<typeof EsiClient>) =>
      job.run({ jobId: 1, ownerType: "global", ownerId: 0, characterId: null, esi, db: db(), log: undefined as never, meta: {} });
    const jitaBuy = async () =>
      Object.fromEntries(
        (await db().select().from(schema.typeValues))
          .filter((r) => r.source === "jita_buy")
          .map((r) => [r.typeId, r.unitPrice]),
      );

    it("keeps what it priced when one type fails, and reports the failure", async () => {
      // Zeolites prices fine; Veldspar's orders fail with a server error.
      const result = await run(fakeEsi({ 45490: 700, 1230: { status: 503 } }));
      expect(result?.summary).toBe("Priced 1 types (1 incl. compressed), 1 failed");
      // Veldspar keeps its old value rather than falling back to "no Jita orders".
      expect(await jitaBuy()).toEqual({ 1230: 10, 45490: 700 });
    });

    it("prices ledger ores and recently requested types only", async () => {
      await db().insert(schema.eveTypes).values([
        { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, portionSize: 1 },
        { typeId: 35, name: "Pyerite", groupId: 18, volume: 0.01, portionSize: 1 },
        { typeId: 587, name: "Rifter", groupId: 25, volume: 27289, portionSize: 1 },
      ]);
      // Rifter was valued once but nobody asks for it any more.
      await db().insert(schema.typeValues).values({ typeId: 587, source: "jita_buy", unitPrice: 400_000, basis: "direct" });
      await db().insert(schema.priceInterest).values([
        { typeId: 34, lastRequestedAt: new Date() },
        { typeId: 35, lastRequestedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000) },
      ]);
      const requested: number[] = [];
      await run(fakeEsi({ 34: 4, 35: 8, 1230: 11, 45490: 700 }, requested));
      expect(requested.sort((a, b) => a - b)).toEqual([34, 1230, 45490]);
      expect((await db().select().from(schema.priceInterest)).map((r) => r.typeId)).toEqual([34]);
      expect(await jitaBuy()).toMatchObject({ 34: 4, 587: 400_000, 1230: 11, 45490: 700 });
    });

    it("writes what it has and fails the run when ESI rate-limits it", async () => {
      await expect(run(fakeEsi({ 45490: 700, 1230: { status: 420 } }))).rejects.toBeInstanceOf(EsiRateLimitedError);
      expect(await jitaBuy()).toEqual({ 1230: 10, 45490: 700 });
    });

    it("fails the run when no type could be priced", async () => {
      await expect(run(fakeEsi({ 45490: { status: 503 }, 1230: { status: 503 } }))).rejects.toBeInstanceOf(EsiError);
      expect(await jitaBuy()).toEqual({ 1230: 10, 45490: 600 });
    });
  });

  describe("mining P&L", async () => {
    const pnl = await import("@/modules/mining/pnl/queries");
    const { pnlScope } = await import("@/modules/mining/pnl/scope");
    const { buildPnlReport } = await import("@/modules/mining/pnl/report");
    const { characterLedgerJob } = await import("@/modules/mining/jobs");
    const { walletFeesJob, walletTransactionsJob } = await import("@/modules/wallet/jobs");
    const { WALLET_SCOPE } = await import("@/modules/wallet/module");

    const range = { from: "2026-09-01", to: "2026-09-30" };
    const scopeB = (extra: { characters?: number[]; ratePct?: number; mode?: "current" | "historical" } = {}) =>
      pnlScope(
        { id: userB, characterIds: [2, 3] },
        { ...range, characters: extra.characters ?? [] },
        { ...val, mode: extra.mode ?? "current" },
        extra.ratePct ?? 100,
      );
    const income = async (s: ReturnType<typeof scopeB>) =>
      (await pnl.getIncomeRows(s)).reduce((sum, r) => sum + r.value, 0);
    const tx = (characterId: number, transactionId: number, typeId: number, extra: Record<string, unknown> = {}) => ({
      characterId,
      transactionId,
      userId: userB,
      date: new Date("2026-09-10T12:00:00Z"),
      typeId,
      quantity: 10,
      unitPrice: 1000,
      isBuy: true,
      clientId: 1,
      locationId: 60003760,
      journalRefId: transactionId,
      ...extra,
    });

    beforeEach(async () => {
      await db().insert(schema.eveGroups).values([
        { groupId: 482, name: "Mining Crystal", categoryId: 8 },
        { groupId: 423, name: "Ice Product", categoryId: 4 },
        { groupId: 18, name: "Mineral", categoryId: 4 },
      ]);
      await db().insert(schema.eveTypes).values([
        { typeId: 18066, name: "Veldspar Mining Crystal I", groupId: 482, volume: 6 },
        { typeId: 16272, name: "Heavy Water", groupId: 423, volume: 0.4 },
        { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01 },
        { typeId: 62516, name: "Compressed Veldspar", groupId: 462, volume: 0.001, portionSize: 1 },
      ]);
      await db().update(schema.eveTypes).set({ compressedTypeId: 62516 }).where(sql`type_id = 1230`);
    });

    it("values income like the dashboard, then applies the rate and price rules", async () => {
      const dashboard = await q.getMiningSummary(filters(), own([2, 3]), val);
      expect(await income(scopeB())).toBe(dashboard.current.value);
      expect(await income(scopeB({ ratePct: 90 }))).toBeCloseTo(58_500);

      // Veldspar sold at 20 ISK from the 11th: only Bravo Alt's 500 units on the 11th.
      await db().insert(schema.miningPnlPriceRules).values({ userId: userB, typeId: 1230, unitPrice: 20, validFrom: "2026-09-11" });
      expect(await income(scopeB({ ratePct: 90 }))).toBeCloseTo(100 * 600 * 0.9 + 500 * 20);
      // Another account's rules never apply.
      await db().insert(schema.miningPnlPriceRules).values({ userId: userA, typeId: 45490, unitPrice: 1 });
      expect(await income(scopeB({ ratePct: 90 }))).toBeCloseTo(100 * 600 * 0.9 + 500 * 20);

      await db().execute(sql`TRUNCATE mining_pnl_price_rules`);
      expect(await income(scopeB({ mode: "historical" }))).toBe(100 * 500 + 500 * 10);
      // A member asking for someone else's character gets their own.
      const a = pnlScope({ id: userA, characterIds: [1] }, { ...range, characters: [2] }, val, 100);
      expect(a.characterIds).toEqual([1]);
      expect(await income(a)).toBe(1000 * 10);
    });

    it("keeps wallet purchases private to the importing account", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(2, 1, 18066),
        // Imported while the character belonged to someone else.
        { ...tx(2, 2, 18066), userId: userA },
      ]);
      const rows = await pnl.getPurchases(scopeB(), { status: "mining", limit: 50, offset: 0 });
      expect(rows.rows.map((r) => r.transactionId)).toEqual([1]);
      const a = pnlScope({ id: userA, characterIds: [1] }, { ...range, characters: [2] }, val, 100);
      expect((await pnl.getPurchases(a, { status: "mining", limit: 50, offset: 0 })).total).toBe(0);
      expect(await pnl.getExpenseRows(a)).toEqual([]);
    });

    it("classifies purchases: suggested by default, counted when switched on, overrides win", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(2, 1, 18066), // crystal, Bravo: auto-count off -> suggested
        tx(3, 2, 16272), // heavy water, Bravo Alt: auto-count on -> counted
        tx(2, 3, 34), // tritanium: untagged
        tx(3, 4, 18066), // crystal excluded by hand
        tx(2, 5, 34), // tritanium tagged and included by hand
        tx(2, 6, 18066, { isBuy: false }), // a sale is never an expense
        tx(2, 7, 18066, { date: new Date("2026-10-01T00:00:00Z") }), // outside the range
      ]);
      await db().insert(schema.miningPnlCharacters).values({ userId: userB, characterId: 3, autoIncludeExpenses: true });
      await db().insert(schema.miningPnlTxOverrides).values([
        { userId: userB, characterId: 3, transactionId: 4, included: false },
        { userId: userB, characterId: 2, transactionId: 5, category: "other", included: true },
      ]);
      const status = async (s: "counted" | "suggested" | "excluded" | "untagged") =>
        (await pnl.getPurchases(scopeB(), { status: s, limit: 50, offset: 0 })).rows.map((r) => r.transactionId);
      expect(await status("suggested")).toEqual([1]);
      expect((await status("counted")).sort()).toEqual([2, 5]);
      expect(await status("excluded")).toEqual([4]);
      expect(await status("untagged")).toEqual([3]);

      const report = buildPnlReport({
        ...range,
        bucket: "month",
        income: await pnl.getIncomeRows(scopeB()),
        expenses: await pnl.getExpenseRows(scopeB()),
        manual: [],
        activity: await pnl.getActivityStats(scopeB()),
        characters: [
          { characterId: 2, name: "Bravo" },
          { characterId: 3, name: "Bravo Alt" },
        ],
      });
      expect(report.totals.wallet).toBe(20_000);
      expect(report.purchases.suggested).toEqual({ amount: 10_000, count: 1 });
      expect(report.byCategory).toEqual([
        { category: "fuel", amount: 10_000 },
        { category: "other", amount: 10_000 },
      ]);
    });

    it("classifies sales like purchases and counts them as income when switched to sales", async () => {
      const sell = { isBuy: false };
      await db().insert(schema.walletTransactions).values([
        tx(2, 11, 62516, sell), // compressed Veldspar, Bravo: auto-count off -> suggested
        tx(3, 12, 34, sell), // Tritanium, Bravo Alt: auto-count on -> counted
        tx(3, 13, 45490, { ...sell, quantity: 2 }), // Zeolites, counted
        tx(2, 14, 18066, sell), // a mining crystal resold: untagged
        tx(2, 15, 1230, { ...sell, clientId: 3 }), // to your own alt: not income
        tx(2, 16, 1230), // a purchase is never income
        { ...tx(2, 17, 1230, sell), userId: userA }, // imported by another account
      ]);
      await db().insert(schema.miningPnlCharacters).values({ userId: userB, characterId: 3, autoIncludeSales: true });
      await db().insert(schema.miningPnlTxOverrides).values({ userId: userB, characterId: 3, transactionId: 13, category: "other" });
      const status = async (s: "counted" | "suggested" | "excluded" | "untagged") =>
        (await pnl.getSales(scopeB(), { status: s, limit: 50, offset: 0 })).rows.map((r) => [r.transactionId, r.category]);
      expect(await status("suggested")).toEqual([[11, "ore"]]);
      expect((await status("counted")).sort()).toEqual([
        [12, "ore"],
        [13, "other"],
      ]);
      expect(await status("untagged")).toEqual([[14, null]]);
      expect((await pnl.getPurchases(scopeB(), { status: "untagged", limit: 50, offset: 0 })).rows.map((r) => r.transactionId)).toEqual([16]);

      const report = buildPnlReport({
        ...range,
        bucket: "month",
        incomeSource: "sales",
        income: await pnl.getIncomeRows(scopeB()),
        sales: await pnl.getSaleRows(scopeB()),
        expenses: [],
        manual: [],
        activity: await pnl.getActivityStats(scopeB()),
        characters: [
          { characterId: 2, name: "Bravo" },
          { characterId: 3, name: "Bravo Alt" },
        ],
      });
      expect(report.totals.income).toBe(12_000);
      expect(report.totals.minedIncome).toBe(await income(scopeB()));
      expect(report.sales.suggested).toEqual({ amount: 10_000, count: 1 });
      expect(report.characters.find((c) => c.characterId === 3)?.income).toBe(12_000);

      expect(await pnl.getPnlSettings(userB)).toEqual({ ratePct: 100, incomeSource: "mined" });
      await db().insert(schema.miningPnlSettings).values({ userId: userB, incomeSource: "sales" });
      expect((await pnl.getPnlSettings(userB)).incomeSource).toBe("sales");
    });

    it("matches mined ore with sales of it and its compressed variant, in raw units", async () => {
      // Real portion sizes: compression is 1:1 in units (Veldspar 100 → Compressed Veldspar 100).
      await db().update(schema.eveTypes).set({ portionSize: 100 }).where(sql`type_id = 62516`);
      await db().insert(schema.walletTransactions).values([
        tx(2, 21, 1230, { isBuy: false, quantity: 100, unitPrice: 12 }), // raw Veldspar
        tx(3, 22, 62516, { isBuy: false, quantity: 300, unitPrice: 11 }), // compressed Veldspar
        tx(3, 23, 62516, { isBuy: false, quantity: 999, unitPrice: 11 }), // excluded by hand
        tx(2, 24, 62516, { isBuy: false, quantity: 999, unitPrice: 11, clientId: 3 }), // to your own alt
        tx(2, 25, 62516, { quantity: 999 }), // a purchase
        tx(2, 26, 34, { isBuy: false, quantity: 5000, unitPrice: 4 }), // minerals aren't ore
      ]);
      await db().insert(schema.miningPnlTxOverrides).values({ userId: userB, characterId: 3, transactionId: 23, included: false });
      // Veldspar is the only asteroid ore in the fixture ledgers.
      const minedVeldspar = (await pnl.getIncomeRows(scopeB())).filter((r) => r.oreClass === "ore").reduce((sum, r) => sum + r.quantity, 0);

      const flows = await pnl.getOreFlows(scopeB());
      const veldspar = flows.find((f) => f.typeId === 1230)!;
      expect(veldspar).toMatchObject({ mined: minedVeldspar, sold: 400, soldCompressed: 300, soldIsk: 1200 + 3300, sales: 2 });
      expect(flows.some((f) => f.typeId === 62516 || f.typeId === 34)).toBe(false);
      // Narrowed to Bravo: only Bravo's own sale.
      const bravo = (await pnl.getOreFlows(scopeB({ characters: [2] }))).find((f) => f.typeId === 1230);
      expect(bravo).toMatchObject({ sold: 100, soldCompressed: 0, soldIsk: 1200 });
    });

    it("spreads manual entries over their days; account-wide ones only without a character filter", async () => {
      await db().insert(schema.miningPnlEntries).values([
        { userId: userB, characterId: 3, date: "2026-08-17", spreadDays: 30, category: "subscription", amount: 3000 },
        { userId: userB, characterId: null, date: "2026-09-05", category: "other", amount: 100 },
        { userId: userA, characterId: 1, date: "2026-09-05", category: "other", amount: 999 },
      ]);
      const all = await pnl.getManualDaily(scopeB(), [2, 3]);
      expect(all.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1500 + 100);
      expect(all.filter((r) => r.characterId === 3)).toHaveLength(15);
      const narrowed = await pnl.getManualDaily(scopeB({ characters: [3] }), [2, 3]);
      expect(narrowed.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1500);
      expect((await pnl.getManualEntries(userB, range.from, range.to)).map((e) => e.amount)).toEqual([100, 3000]);
    });

    it("measures wall-clock and character hours from activity windows", async () => {
      await db().insert(schema.miningCharacterLedger).values({
        characterId: 3, date: "2026-09-10", solarSystemId: 30000180, typeId: 1230, quantity: 300,
      });
      await db().insert(schema.miningActivity).values([
        { characterId: 2, date: "2026-09-10", typeId: 45490, quantity: 50,
          windowStart: new Date("2026-09-10T10:00:00Z"), windowEnd: new Date("2026-09-10T11:00:00Z") },
        { characterId: 3, date: "2026-09-10", typeId: 1230, quantity: 300,
          windowStart: new Date("2026-09-10T10:30:00Z"), windowEnd: new Date("2026-09-10T11:30:00Z") },
      ]);
      await db().insert(schema.miningActivityCoverage).values([
        { characterId: 2, since: new Date("2026-09-01T00:00:00Z"), lastObservedAt: new Date("2026-09-10T11:00:00Z") },
      ]);
      const stats = await pnl.getActivityStats(scopeB());
      expect(stats.total.hours).toBeCloseTo(1.5);
      expect(stats.total.value).toBe(50 * 600 + 300 * 10);
      expect(stats.byCharacter.get(2)?.hours).toBeCloseTo(1);
      expect(stats.byActivity.get("moon")?.hours).toBeCloseTo(1);
      expect(stats.byActivity.get("ore")?.value).toBe(3000);
      expect(stats.trackedSince?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });

    it("records ledger growth in the sync job", async () => {
      const { MINING_LEDGER_SCOPE } = await import("@/modules/mining/module");
      await db().insert(schema.esiTokens).values({ characterId: 1, refreshTokenEnc: "x", scopes: [MINING_LEDGER_SCOPE] });
      const today = new Date().toISOString().slice(0, 10);
      let quantity = 1000;
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async () =>
          new Response(JSON.stringify([{ date: today, quantity, solar_system_id: 30000180, type_id: 1230 }]), {
            status: 200,
            headers: { "content-type": "application/json", "last-modified": new Date().toUTCString() },
          })) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 1, characterId: 1, esi, db: db(), log: undefined as never, meta: {} };
      await characterLedgerJob.run(ctx);
      const [first] = await db().select().from(schema.miningActivityCoverage);
      expect(first.characterId).toBe(1);
      expect(await db().select().from(schema.miningActivity)).toHaveLength(0);

      // Fifteen minutes later the ledger has grown.
      const earlier = new Date(Date.now() - 15 * 60_000);
      await db().update(schema.miningActivityCoverage).set({ lastObservedAt: earlier });
      quantity = 1600;
      await characterLedgerJob.run(ctx);
      const rows = await db().select().from(schema.miningActivity);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ characterId: 1, date: today, typeId: 1230, quantity: 600 });
      expect(rows[0].windowStart.getTime()).toBe(earlier.getTime());
      const [ledger] = await db().select().from(schema.miningCharacterLedger).where(sql`character_id = 1 AND date = ${today}`);
      expect(ledger.quantity).toBe(1600);

      // A snapshot that isn't newer than the last observation never rolls the ledger back.
      await db().update(schema.miningActivityCoverage).set({ lastObservedAt: new Date(Date.now() + 60_000) });
      quantity = 1200;
      expect((await characterLedgerJob.run(ctx))?.summary).toContain("older snapshot, skipped");
      const [kept] = await db().select().from(schema.miningCharacterLedger).where(sql`character_id = 1 AND date = ${today}`);
      expect(kept.quantity).toBe(1600);
    });

    it("imports wallet transactions for the owning account", async () => {
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) =>
          new Response(
            JSON.stringify(
              String(url).includes("from_id")
                ? []
                : [
                    { transaction_id: 11, date: "2026-09-10T12:00:00Z", type_id: 16272, quantity: 500, unit_price: 700,
                      is_buy: true, is_personal: true, client_id: 5, location_id: 60003760, journal_ref_id: 1 },
                    { transaction_id: 12, date: "2026-09-10T12:00:00Z", type_id: 34, quantity: 1, unit_price: 5,
                      is_buy: true, is_personal: false, client_id: 5, location_id: 60003760, journal_ref_id: 2 },
                  ],
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          )) as unknown as typeof fetch,
      });
      expect(walletTransactionsJob.requiredScopes).toEqual([WALLET_SCOPE]);
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };
      const result = await walletTransactionsJob.run(ctx);
      expect(result?.summary).toBe("1 new transaction");
      const rows = await db().select().from(schema.walletTransactions);
      expect(rows).toEqual([expect.objectContaining({ characterId: 3, transactionId: 11, userId: userB, isBuy: true })]);
    });

    it("ignores market trades between the account's own characters", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(2, 31, 18066), // bought from a stranger: a cost
        tx(2, 32, 18066, { clientId: 3 }), // bought from your own alt: just moving crystals around
        tx(3, 33, 1230, { isBuy: false, quantity: 100, unitPrice: 50, clientId: 2 }), // sold to your main
      ]);
      const rows = await pnl.getPurchases(scopeB(), { status: "mining", limit: 50, offset: 0 });
      expect(rows.rows.map((r) => r.transactionId)).toEqual([31]);
      expect(await pnl.getSaleHints(scopeB(), range)).toEqual([]);
    });

    it("never brings wallet rows back for a character removed or sold during the import", async () => {
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async () => {
          // The character changes hands while ESI is answering.
          await db().execute(sql`UPDATE characters SET user_id = ${userA} WHERE character_id = 3`);
          return new Response(
            JSON.stringify([{ transaction_id: 41, date: "2026-09-10T12:00:00Z", type_id: 16272, quantity: 1, unit_price: 1,
              is_buy: true, is_personal: true, client_id: 5, location_id: 60003760, journal_ref_id: 1 }]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };
      const result = await walletTransactionsJob.run(ctx);
      expect(result?.summary).toBe("Character changed owner during the import");
      expect(await db().select().from(schema.walletTransactions)).toEqual([]);
    });

    it("resumes the wallet import per owner, but reimports all pages after deleting wallet data", async () => {
      // A previous owner's rows must not hide the new owner's history.
      await db().insert(schema.walletTransactions).values({ ...tx(3, 900, 34), userId: userA });
      const seen: (string | null)[] = [];
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) => {
          const fromId = new URL(String(url)).searchParams.get("from_id");
          seen.push(fromId);
          const all = [
            { transaction_id: 950, is_personal: false },
            { transaction_id: 800, is_personal: true },
            { transaction_id: 700, is_personal: true },
          ].map((t) => ({ ...t, date: "2026-09-10T12:00:00Z", type_id: 34, quantity: 1, unit_price: 5, is_buy: true,
            client_id: 5, location_id: 60003760, journal_ref_id: t.transaction_id }));
          return new Response(JSON.stringify(all.filter((t) => !fromId || t.transaction_id < Number(fromId)).slice(0, 2)), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };
      const first = await walletTransactionsJob.run(ctx);
      expect(first?.summary).toBe("2 new transactions");
      expect(first?.meta).toEqual({ userId: userB, newestSeenId: 950 });
      // Next run: the corporation trade (950) is the high-water mark, so one request is enough.
      seen.length = 0;
      await walletTransactionsJob.run({ ...ctx, meta: first!.meta! });
      expect(seen).toEqual([null]);

      await db().delete(schema.esiTokens).where(sql`character_id = 3`);
      await db().insert(schema.syncJobs).values([
        {
          jobKey: "wallet.character-transactions",
          ownerType: "character",
          ownerId: 3,
          meta: first!.meta!,
        },
        {
          jobKey: "wallet.character-fees",
          ownerType: "character",
          ownerId: 3,
          meta: first!.meta!,
        },
      ]);
      vi.doMock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: userB, characterIds: [3] }) }));
      vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
      vi.doMock("server-only", () => ({}));
      try {
        const { deleteWalletData } = await import("@/app/(app)/mining/pnl/actions");
        expect(await deleteWalletData(3)).toEqual({ ok: true });
      } finally {
        vi.doUnmock("@/core/auth/dal");
        vi.doUnmock("next/cache");
        vi.doUnmock("server-only");
      }
      expect((await db().select({ meta: schema.syncJobs.meta }).from(schema.syncJobs)).map((j) => j.meta)).toEqual([null, null]);
      seen.length = 0;
      const restored = await walletTransactionsJob.run(ctx);
      expect(restored?.summary).toBe("2 new transactions");
      expect(restored?.meta).toEqual(first?.meta);
      expect(seen).toEqual([null, "800", "700"]);
      const rows = await db().select().from(schema.walletTransactions).where(sql`user_id = ${userB}`).orderBy(schema.walletTransactions.transactionId);
      expect(rows.map((r) => r.transactionId)).toEqual([700, 800]);
    });

    it("uses the high-water mark when no personal transactions have been stored", async () => {
      let requests = 0;
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async () => {
          requests++;
          return Response.json([{
            transaction_id: 950,
            date: "2026-09-10T12:00:00Z",
            type_id: 34,
            quantity: 1,
            unit_price: 5,
            is_buy: true,
            is_personal: false,
            client_id: 5,
            location_id: 60003760,
            journal_ref_id: 950,
          }]);
        }) as unknown as typeof fetch,
      });
      const ctx = {
        jobId: 1,
        ownerType: "character" as const,
        ownerId: 3,
        characterId: 3,
        esi,
        db: db(),
        log: undefined as never,
        meta: { userId: userB, newestSeenId: 950 },
      };
      const first = await walletTransactionsJob.run(ctx);
      expect(requests).toBe(1);
      expect(first?.meta).toEqual(ctx.meta);
      expect(await db().select().from(schema.walletTransactions)).toEqual([]);

      requests = 0;
      await walletTransactionsJob.run({ ...ctx, meta: first!.meta! });
      expect(requests).toBe(1);
    });

    it("imports only wallet fees, resumes incrementally, and reimports all pages after deleting wallet data", async () => {
      const pages: string[] = [];
      const journal = [
        { id: 105, ref_type: "bounty_prizes", amount: 1_000_000 },
        { id: 104, ref_type: "transaction_tax", amount: -360, context_id: 11, context_id_type: "market_transaction_id" },
        { id: 103, ref_type: "market_transaction", amount: 10_000, context_id: 11, context_id_type: "market_transaction_id" },
        { id: 102, ref_type: "brokers_fee", amount: -150, description: "Market order commission to Jita IV - Moon 4" },
        { id: 101, ref_type: "player_donation", amount: -5 },
      ].map((e) => ({ description: "", ...e, date: "2026-09-10T12:00:00Z" }));
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) => {
          const page = Number(new URL(String(url)).searchParams.get("page") ?? 1);
          pages.push(String(page));
          return new Response(JSON.stringify(page === 1 ? journal.slice(0, 3) : journal.slice(3)), {
            status: 200, headers: { "content-type": "application/json", "x-pages": "2" },
          });
        }) as unknown as typeof fetch,
      });
      expect(walletFeesJob.requiredScopes).toEqual([WALLET_SCOPE]);
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 3, characterId: 3, esi, db: db(), log: undefined as never, meta: {} };

      // With a prior high-water mark, corporation-only journal rows don't force a full history read.
      const emptyArchive = await walletFeesJob.run({ ...ctx, meta: { userId: userB, newestSeenId: 105, descriptions: true } });
      expect(pages).toEqual(["1"]);
      expect(emptyArchive?.meta).toEqual({ userId: userB, newestSeenId: 105, descriptions: true });
      pages.length = 0;

      const first = await walletFeesJob.run(ctx);
      expect(pages).toEqual(["1", "2"]);
      expect(first?.summary).toBe("2 new fees");
      expect(first?.meta).toEqual({ userId: userB, newestSeenId: 105, descriptions: true });
      const rows = await db().select().from(schema.walletFees).orderBy(schema.walletFees.journalId);
      expect(rows.map((r) => [r.journalId, r.refType, r.amount, r.contextId, r.userId, r.description])).toEqual([
        [102, "brokers_fee", 150, null, userB, "Market order commission to Jita IV - Moon 4"],
        [104, "transaction_tax", 360, 11, userB, null],
      ]);
      // Nothing newer than the cursor: nothing new stored.
      pages.length = 0;
      expect((await walletFeesJob.run({ ...ctx, meta: first!.meta! }))?.summary).toBe("0 new fees");
      expect(pages).toEqual(["1"]);

      // Deleting history clears the cursor and descriptions flag before import is re-enabled.
      await db().delete(schema.walletFees).where(sql`character_id = 3 AND user_id = ${userB}`);
      pages.length = 0;
      const restored = await walletFeesJob.run(ctx);
      expect(restored?.summary).toBe("2 new fees");
      expect(restored?.meta).toEqual(first?.meta);
      expect(pages).toEqual(["1", "2"]);
      expect(await db().select().from(schema.walletFees).orderBy(schema.walletFees.journalId)).toEqual(
        rows.map((r) => ({ ...r, firstSeenAt: expect.any(Date) })),
      );

      // Fees imported before descriptions were kept get theirs from one full read, without counting as new.
      await db().update(schema.walletFees).set({ description: null });
      const backfill = await walletFeesJob.run({ ...ctx, meta: { userId: userB, newestSeenId: 105 } });
      expect(backfill?.summary).toBe("0 new fees");
      expect(backfill?.meta).toMatchObject({ descriptions: true });
      expect((await db().select().from(schema.walletFees).where(sql`journal_id = 102`))[0].description).toBe(
        "Market order commission to Jita IV - Moon 4",
      );
      // Fees alone count as wallet history in Settings (so they can be deleted), even without transactions.
      expect((await pnl.getWalletStatus(userB)).find((w) => w.characterId === 3)).toMatchObject({ transactions: 0, fees: 2 });

      // Settings shows the fee import's error too, not only the transaction import's state.
      const job = { ownerType: "character" as const, ownerId: 3, lastSuccessAt: new Date("2026-09-10T12:00:00Z") };
      await db().insert(schema.syncJobs).values([
        { ...job, jobKey: "wallet.character-transactions", lastStatus: "ok" as const },
        { ...job, jobKey: "wallet.character-fees", lastStatus: "error" as const, lastError: "ESI 503" },
      ]);
      expect((await pnl.getWalletStatus(userB)).find((w) => w.characterId === 3)).toMatchObject({ lastStatus: "error", lastError: "ESI 503" });
    });

    it("counts sales tax with the sale it was paid on, even in a multi-sell, and leaves broker fees to you", async () => {
      // Sales tax has no review of its own: it always takes its sale's status.
      const sell = { isBuy: false };
      await db().insert(schema.walletTransactions).values([
        tx(3, 71, 62516, { ...sell, date: new Date("2026-09-10T12:00:00Z") }), // compressed Veldspar: mining sale
        tx(3, 72, 18066, { ...sell, date: new Date("2026-09-11T08:30:00Z") }), // a crystal resold: not mining income
        tx(3, 73, 1230, { ...sell, date: new Date("2026-09-12T09:00:00Z") }), // Veldspar, excluded by hand
        // A multi-sell: journal order sale 90, tax 91, sale 92, tax 93, all in the same second.
        tx(3, 74, 1230, { ...sell, date: new Date("2026-09-13T10:00:00Z"), journalRefId: 90 }), // Veldspar
        tx(3, 75, 18066, { ...sell, date: new Date("2026-09-13T10:00:00Z"), journalRefId: 92 }), // a crystal
      ]);
      await db().insert(schema.miningPnlTxOverrides).values([
        { userId: userB, characterId: 3, transactionId: 71, included: true },
        { userId: userB, characterId: 3, transactionId: 73, included: false },
        { userId: userB, characterId: 3, transactionId: 74, included: true },
      ]);
      const fee = (journalId: number, refType: "transaction_tax" | "brokers_fee", date: string, extra = {}) => ({
        characterId: 3,
        journalId,
        userId: userB,
        date: new Date(date),
        refType,
        amount: 100,
        ...extra,
      });
      await db().insert(schema.walletFees).values([
        fee(81, "transaction_tax", "2026-09-10T12:00:00Z", { contextId: 71, contextIdType: "market_transaction_id" }),
        fee(82, "transaction_tax", "2026-09-11T08:30:00Z"), // no context: the sale booked right before it
        fee(83, "transaction_tax", "2026-09-12T09:00:00Z", { contextId: 73, contextIdType: "market_transaction_id" }),
        fee(84, "brokers_fee", "2026-09-09T10:00:00Z"),
        fee(91, "transaction_tax", "2026-09-13T10:00:00Z"),
        fee(93, "transaction_tax", "2026-09-13T10:00:00Z"),
        // Names a sale that wasn't imported: falls back to the journal order (the crystal, untagged).
        fee(95, "transaction_tax", "2026-09-13T10:00:00Z", { contextId: 999, contextIdType: "market_transaction_id" }),
        { ...fee(85, "brokers_fee", "2026-09-09T10:00:00Z"), userId: userA }, // another account's
      ]);
      const status = async () =>
        Object.fromEntries(
          (await pnl.getFees(scopeB(), { status: "mining", limit: 50, offset: 0 })).rows.map((r) => [r.journalId, [r.status, r.sale?.typeId ?? null]]),
        );
      expect(await status()).toEqual({
        81: ["counted", 62516],
        83: ["excluded", 1230],
        84: ["suggested", null],
        91: ["counted", 1230],
      });
      expect((await pnl.getFees(scopeB(), { status: "untagged", limit: 50, offset: 0 })).rows.map((r) => [r.journalId, r.sale?.typeId])).toEqual([
        [95, 18066],
        [93, 18066],
        [82, 18066],
      ]);

      // Counting sales automatically never counts broker fees (they may be for other orders); your choice wins.
      // A decision stored on a sales tax (from before taxes followed their sale) has no effect.
      await db().insert(schema.miningPnlCharacters).values({ userId: userB, characterId: 3, autoIncludeSales: true });
      await db().insert(schema.miningPnlFeeOverrides).values([
        { userId: userB, characterId: 3, journalId: 81, included: false },
        { userId: userB, characterId: 3, journalId: 84, included: true },
      ]);
      expect(await status()).toEqual({
        81: ["counted", 62516],
        83: ["excluded", 1230],
        84: ["counted", null],
        91: ["counted", 1230],
      });
      // The Expenses tab reviews broker fees only.
      expect((await pnl.getFees(scopeB(), { status: "mining", kind: "brokers_fee", limit: 50, offset: 0 })).rows.map((r) => r.journalId)).toEqual([84]);

      // Broker fees are the only fee expenses; sales tax is deducted from its sale's income instead.
      expect((await pnl.getFeeRows(scopeB())).filter((r) => r.status === "counted")).toEqual([
        { date: "2026-09-09", characterId: 3, category: "fees", status: "counted", amount: 100, count: 1 },
      ]);
      const countedSales = (await pnl.getSaleRows(scopeB())).filter((r) => r.status === "counted");
      expect(countedSales.map((r) => [r.date, r.gross, r.tax, r.amount])).toEqual([
        ["2026-09-10", 10_000, 100, 9_900],
        ["2026-09-13", 10_000, 100, 9_900],
      ]);

      // Each sale on the Income tab shows the tax paid on it.
      const sales = (await pnl.getSales(scopeB(), { status: "counted", limit: 50, offset: 0 })).rows;
      expect(Object.fromEntries(sales.map((r) => [r.transactionId, r.tax]))).toEqual({ 71: 100, 74: 100 });
    });

    it("drops the previous owner's wallet history when a character is transferred", async () => {
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      await db().insert(schema.walletTransactions).values([tx(3, 51, 18066), tx(2, 52, 18066)]);
      const fee = { userId: userB, date: new Date("2026-09-10T12:00:00Z"), refType: "brokers_fee" as const, amount: 5 };
      await db().insert(schema.walletFees).values([{ ...fee, characterId: 3, journalId: 61 }, { ...fee, characterId: 2, journalId: 62 }]);
      await db().insert(schema.miningPnlFeeOverrides).values([
        { userId: userB, characterId: 3, journalId: 61, included: true },
        { userId: userB, characterId: 2, journalId: 62, included: true },
      ]);
      await db().transaction((t) => detachTransferredCharacter(t, 3, userB));
      expect((await db().select().from(schema.walletTransactions)).map((r) => r.transactionId)).toEqual([52]);
      expect((await db().select().from(schema.walletFees)).map((r) => r.journalId)).toEqual([62]);
      expect((await db().select().from(schema.miningPnlFeeOverrides)).map((r) => r.journalId)).toEqual([62]);
    });

    it("keeps a character's history when its own account links it back from another EVE account", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { provisionFromSso } = await import("@/core/auth/provision");
      await db().insert(schema.walletTransactions).values(tx(3, 51, 18066));
      await db().insert(schema.walletFees).values({
        userId: userB,
        characterId: 3,
        journalId: 61,
        date: new Date("2026-09-10T12:00:00Z"),
        refType: "brokers_fee",
        amount: 5,
      });
      await db().insert(schema.mailLabels).values({ userId: userB, characterId: 3, labelId: 1, name: "Inbox" });
      await db().insert(schema.esiTokens).values({ characterId: 3, refreshTokenEnc: encryptToken("r"), scopes: [WALLET_SCOPE] });
      await db()
        .insert(schema.syncJobs)
        .values({ jobKey: "wallet.character-transactions", ownerType: "character", ownerId: 3, meta: { newestSeenId: 51 } });
      await db()
        .insert(schema.esiCache)
        .values({ key: "3:GET /characters/3/wallet/transactions", body: {}, expiresAt: new Date(Date.now() + 60_000) });
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) =>
          reply(path.startsWith("/corporations/") ? { name: "Home", ticker: "HOME", member_count: 3 } : { corporation_id: 100 }),
        ) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      try {
        // Bravo moved the alt to another of their EVE accounts (new owner hash) and links it to the same Keystar account.
        const result = await provisionFromSso({
          verified: { characterId: 3, name: "Bravo Alt", ownerHash: "h3-moved", scopes: [WALLET_SCOPE], expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" },
          intent: "link",
          currentUserId: userB,
        });
        expect(result).toMatchObject({ userId: userB, newCharacter: false, lostOptionalScopes: [] });
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
      const [alt] = await db().select().from(schema.characters).where(sql`character_id = 3`);
      expect(alt).toMatchObject({ userId: userB, ownerHash: "h3-moved" });
      expect((await db().select().from(schema.walletTransactions)).map((r) => r.transactionId)).toEqual([51]);
      expect((await db().select().from(schema.walletFees)).map((r) => r.journalId)).toEqual([61]);
      expect(await db().select().from(schema.mailLabels)).toHaveLength(1);
      const [cursor] = await db().select().from(schema.syncJobs).where(sql`owner_id = 3`);
      expect(cursor.meta).toEqual({ newestSeenId: 51 });
      // Responses cached with the old EVE account's token are fetched again.
      expect(await db().select().from(schema.esiCache).where(sql`key LIKE '3:%'`)).toEqual([]);
      const [b] = await db().select().from(schema.users).where(sql`id = ${userB}`);
      expect(b).toMatchObject({ isDisabled: false, mainCharacterId: 2 });
    });

    it("reports opt-in scopes that a generic re-link dropped", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { provisionFromSso } = await import("@/core/auth/provision");
      const MINING = "esi-industry.read_character_mining.v1";
      await db().insert(schema.esiTokens).values({ characterId: 2, refreshTokenEnc: encryptToken("r"), scopes: [MINING, WALLET_SCOPE] });
      // The shared client may already hold an earlier fetch, so stub its calls rather than global fetch.
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) =>
          reply(path.startsWith("/corporations/") ? { name: "Home", ticker: "HOME", member_count: 3 } : { corporation_id: 100 }),
        ) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      const link = (scopes: string[]) =>
        provisionFromSso({
          verified: { characterId: 2, name: "Bravo", ownerHash: "h2", scopes, expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" },
          intent: "link",
          currentUserId: userB,
        });
      try {
        expect((await link([MINING])).lostOptionalScopes).toEqual([WALLET_SCOPE]);
        // Granted again: nothing lost.
        await db().update(schema.esiTokens).set({ scopes: [MINING, WALLET_SCOPE] });
        expect((await link([MINING, WALLET_SCOPE])).lostOptionalScopes).toEqual([]);
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
    });

    it("clears in-app switches on a new EVE consent and reports what it changed", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { provisionFromSso } = await import("@/core/auth/provision");
      const { FLEET_SCOPE } = await import("@/modules/fleet/logic");
      const MINING = "esi-industry.read_character_mining.v1";
      // Wallet import switched off in Keystar; the token still holds it.
      await db()
        .insert(schema.esiTokens)
        .values({ characterId: 2, refreshTokenEnc: encryptToken("r"), scopes: [MINING], disabledScopes: [WALLET_SCOPE] });
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) =>
          reply(path.startsWith("/corporations/") ? { name: "Home", ticker: "HOME", member_count: 3 } : { corporation_id: 100 }),
        ) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      const link = (characterId: number, name: string, scopes: string[]) =>
        provisionFromSso({
          verified: { characterId, name, ownerHash: `h${characterId}`, scopes, expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", refresh_token: "r", expires_in: 1200, token_type: "Bearer" },
          intent: "link",
          currentUserId: userB,
        });
      try {
        // Re-authorise links leave switched-off scopes out, so the new token drops them for good.
        const result = await link(2, "Bravo", [MINING, FLEET_SCOPE]);
        expect(result).toMatchObject({ newCharacter: false, lostOptionalScopes: [], addedOptionalScopes: [FLEET_SCOPE] });
        const [token] = await db().select().from(schema.esiTokens).where(sql`character_id = 2`);
        expect(token).toMatchObject({ scopes: [MINING, FLEET_SCOPE], disabledScopes: [] });
        // A character the account didn't have before.
        expect((await link(4, "Charlie", [MINING])).newCharacter).toBe(true);
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
    });

    it("deletes the token only when a character is re-authorised with no scope at all", async () => {
      const { encryptToken } = await import("@/core/crypto");
      const { provisionFromSso } = await import("@/core/auth/provision");
      const { MINING_LEDGER_SCOPE: MINING } = await import("@/modules/mining/module");
      // Wallet import on, the mining ledger switched off in Keystar but still in the token.
      await db()
        .insert(schema.esiTokens)
        .values({ characterId: 2, refreshTokenEnc: encryptToken("old-refresh"), scopes: [WALLET_SCOPE], disabledScopes: [MINING] });
      const { getEsi } = await import("@/core/esi");
      const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
      const getSpy = vi
        .spyOn(getEsi(), "get")
        .mockImplementation(async (path: string) =>
          reply(path.startsWith("/corporations/") ? { name: "Home", ticker: "HOME", member_count: 3 } : { corporation_id: 100 }),
        ) as unknown as { mockRestore: () => void };
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async () => reply([]));
      // Only CCP's revoke endpoint is fetched directly.
      const revoke = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
      const login = (intent: "login" | "join" | "link", reauthorize?: boolean, ownerHash = "h2") =>
        provisionFromSso({
          verified: { characterId: 2, name: "Bravo", ownerHash, scopes: [], expiresAt: new Date(Date.now() + 1e6) },
          tokens: { access_token: "a", expires_in: 1200, token_type: "Bearer" },
          intent,
          currentUserId: intent === "link" ? userB : null,
          reauthorize,
        });
      const tokens = async () => db().select().from(schema.esiTokens);
      try {
        // Signing in, joining, and a plain link with a character already on the account leave its access alone.
        expect(await login("login")).toMatchObject({ tokenRemoved: false, lostOptionalScopes: [] });
        expect(await login("join")).toMatchObject({ tokenRemoved: false, lostOptionalScopes: [] });
        expect(await login("link")).toMatchObject({ tokenRemoved: false, newCharacter: false, lostOptionalScopes: [] });
        expect(await tokens()).toMatchObject([{ scopes: [WALLET_SCOPE], disabledScopes: [MINING] }]);
        expect(revoke).not.toHaveBeenCalled();

        // Re-authorising this very character without any scope withdraws everything, switched-off scopes included.
        expect(await login("link", true)).toMatchObject({ tokenRemoved: true, lostOptionalScopes: [WALLET_SCOPE] });
        expect(await tokens()).toEqual([]);
        expect(revoke).toHaveBeenCalledOnce();
        expect(String(revoke.mock.calls[0][1]?.body)).toContain("token=old-refresh");
        // Nothing left to remove the second time.
        expect(await login("link", true)).toMatchObject({ tokenRemoved: false, lostOptionalScopes: [] });
        expect(revoke).toHaveBeenCalledOnce();

        // Linked back from another of the player's EVE accounts: the old token belongs to the account it left.
        await db().insert(schema.esiTokens).values({ characterId: 2, refreshTokenEnc: encryptToken("old-account"), scopes: [WALLET_SCOPE] });
        expect(await login("link", false, "h2-moved")).toMatchObject({ tokenRemoved: true, lostOptionalScopes: [WALLET_SCOPE] });
        expect(await tokens()).toEqual([]);
        expect(String(revoke.mock.calls[1][1]?.body)).toContain("token=old-account");
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
        revoke.mockRestore();
      }
    });

    it("hints at realised sale prices per raw unit, raw or compressed", async () => {
      await db().insert(schema.walletTransactions).values([
        tx(3, 21, 62516, { isBuy: false, quantity: 10, unitPrice: 1100 }), // 10 compressed = 1000 raw
        tx(3, 22, 1230, { isBuy: false, quantity: 500, unitPrice: 12 }),
        { ...tx(1, 23, 1230, { isBuy: false, quantity: 1, unitPrice: 1e6 }), userId: userA },
      ]);
      const hints = await pnl.getSaleHints(scopeB(), range);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toMatchObject({ typeId: 1230, rawUnits: 1500, isk: 17_000, sales: 2, baseUnitPrice: 10 });
      expect(hints[0].rawUnitPrice).toBeCloseTo(17_000 / 1500);
    });

    it("saves settings through actions that refuse with codes instead of throwing", async () => {
      const form = (fields: Record<string, string>) => {
        const data = new FormData();
        for (const [key, value] of Object.entries(fields)) data.set(key, value);
        return data;
      };
      vi.doMock("@/core/auth/dal", () => ({ assertPermission: async () => ({ id: userB, characterIds: [3] }) }));
      vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
      vi.doMock("server-only", () => ({}));
      try {
        const a = await import("@/app/(app)/mining/pnl/actions");
        expect(await a.setIncomeSource(form({ source: "sales" }))).toEqual({ ok: true });
        expect(await a.setIncomeSource(form({ source: "guesswork" }))).toEqual({ ok: false, error: "invalidSource" });
        expect(await a.setIncomeRate(form({ rate: "0" }))).toEqual({ ok: false, error: "invalidRate" });
        expect(await a.addPriceRule(form({ typeId: "1230", unitPrice: "12", validFrom: "2026-09-10", validTo: "2026-09-01" }))).toEqual({
          ok: false,
          error: "invalidRange",
        });
        expect(await a.addPriceRule(form({ typeId: "999999", unitPrice: "12" }))).toEqual({ ok: false, error: "unknownType" });
        expect(await a.setAutoInclude(1, true)).toEqual({ ok: false, error: "notOwned" });
        expect(await a.deleteManualEntry(424242)).toEqual({ ok: false, error: "notFound" });
        expect(await a.addManualEntry(form({ date: "2026-09-10", amount: "2.1b", category: "subscription", spreadDays: "1" }))).toEqual({
          ok: true,
        });
      } finally {
        vi.doUnmock("@/core/auth/dal");
        vi.doUnmock("next/cache");
        vi.doUnmock("server-only");
      }
      const [settings] = await db().select().from(schema.miningPnlSettings).where(sql`user_id = ${userB}`);
      expect(settings.incomeSource).toBe("sales");
      const entries = await db().select().from(schema.miningPnlEntries).where(sql`user_id = ${userB}`);
      expect(entries.map((e) => e.amount)).toEqual([2.1e9]);
    });
  });

  describe("EVE mail", async () => {
    const { mailJob } = await import("@/modules/social/jobs");
    const { MAIL_SCOPE } = await import("@/modules/social/module");
    const mail = await import("@/modules/social/queries");

    type Header = { mail_id: number; from: number; subject: string; timestamp: string; is_read: boolean; labels: number[];
      recipients: { recipient_id: number; recipient_type: string }[] };
    const h = (id: number, extra: Partial<Header> = {}): Header => ({
      mail_id: id,
      from: 9,
      subject: `Mail ${id}`,
      timestamp: `2026-09-${String(id % 28 + 1).padStart(2, "0")}T12:00:00Z`,
      is_read: false,
      labels: [1],
      recipients: [{ recipient_id: 2, recipient_type: "character" }],
      ...extra,
    });
    // Mailboxes by character; ESI answers per character token like the real routes.
    let boxes: Record<number, Header[]> = {};
    let bodyRequests: string[] = [];
    const esi = new EsiClient({
      baseUrl: "https://esi.test",
      userAgent: "t",
      compatibilityDate: "2026-08-18",
      tokenProvider: async () => "token",
      maxRetries: 0,
      fetchImpl: (async (url: string) => {
        const u = new URL(String(url));
        const m = /^\/characters\/(\d+)\/mail(?:\/(labels|lists|\d+))?$/.exec(u.pathname)!;
        const box = boxes[Number(m[1])] ?? [];
        const reply = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        if (m[2] === "labels") return reply({ labels: [{ label_id: 1, name: "Inbox", color: "#ffffff" }, { label_id: 256, name: "Ops", color: "#ff6600" }], total_unread_count: 1 });
        if (m[2] === "lists") return reply([{ mailing_list_id: 145, name: "Keystar Ops" }]);
        if (m[2]) {
          bodyRequests.push(`${m[1]}:${m[2]}`);
          const found = box.find((x) => x.mail_id === Number(m[2]));
          if (!found) return reply({ error: "Mail not found" }, 404);
          return reply({ ...found, read: found.is_read, body: `<font size=12 color=#bfffffff>Hello <a href="showinfo:1377//9">Outsider</a></font><br>Mail ${found.mail_id}` });
        }
        const below = Number(u.searchParams.get("last_mail_id") ?? Infinity);
        return reply(box.filter((x) => x.mail_id < below).sort((a, b) => b.mail_id - a.mail_id).slice(0, 50));
      }) as unknown as typeof fetch,
    });
    const run = (characterId: number) =>
      mailJob.run({ jobId: 1, ownerType: "character", ownerId: characterId, characterId, esi, db: db(), log: undefined as never, meta: {} });
    const all = { characterId: null, folder: { kind: "all" as const }, q: "", page: 1 };

    beforeEach(async () => {
      bodyRequests = [];
      await db().insert(schema.eveEntities).values([
        { id: 1, name: "Alpha", category: "character" },
        { id: 2, name: "Bravo", category: "character" },
        { id: 3, name: "Bravo Alt", category: "character" },
        { id: 100, name: "Home Corp", category: "corporation" },
      ]);
      await db().insert(schema.eveGroups).values({ groupId: 1, name: "Character", categoryId: 1 });
      await db().insert(schema.eveTypes).values({ typeId: 1377, name: "Character", groupId: 1, volume: 0 });
      const corpMail = h(500, { labels: [4, 256], recipients: [{ recipient_id: 100, recipient_type: "corporation" }] });
      boxes = {
        2: [corpMail, h(501), h(503, { labels: [], recipients: [{ recipient_id: 145, recipient_type: "mailing_list" }] })],
        3: [{ ...corpMail, is_read: true }, h(502, { from: 3, labels: [2], is_read: true })],
      };
    });

    it("imports mailboxes for the owning account and shares bodies between its characters", async () => {
      expect(mailJob.requiredScopes).toEqual([MAIL_SCOPE]);
      expect((await run(2))?.summary).toBe("3 new mails, 3 bodies");
      expect((await run(3))?.summary).toBe("2 new mails, 1 body");
      // The corp mail's body was copied from Bravo's mailbox, not fetched again.
      expect(bodyRequests).toEqual(["2:503", "2:501", "2:500", "3:502"]);
      const rows = await db().select().from(schema.mailMessages);
      expect(rows.every((r) => r.userId === userB && r.body !== null)).toBe(true);
      expect(await db().select().from(schema.mailLists)).toHaveLength(2);

      // Listed once with both receiving characters, unread because Bravo hasn't read it.
      const list = await mail.getMailList(userB, all);
      expect(list.total).toBe(4);
      expect(list.items.find((i) => i.mailId === 500)).toMatchObject({ characterIds: [2, 3], unread: true, from: { name: "Outsider" } });
      expect(list.items.find((i) => i.mailId === 502)).toMatchObject({ sent: true });
      expect(list.items.find((i) => i.mailId === 501)?.preview).toBe("Hello Outsider Mail 501");

      const counts = await mail.getFolderCounts(userB, null);
      expect(counts.unread).toEqual({ all: 3, inbox: 1, sent: 0, corp: 1, alliance: 0, lists: 1 });
      expect(counts.lists).toEqual([{ id: 145, name: "Keystar Ops", unread: 1 }]);
      expect(counts.labels).toEqual([{ name: "Ops", color: "#ff6600", unread: 1 }]);
      expect((await mail.getMailList(userB, { ...all, folder: { kind: "label", name: "Ops" } })).items.map((i) => i.mailId)).toEqual([500]);
      expect((await mail.getMailList(userB, { ...all, folder: { kind: "list", id: 145 } })).items.map((i) => i.mailId)).toEqual([503]);
      expect((await mail.getMailList(userB, { ...all, q: "outs" })).total).toBe(3);

      const open = await mail.getMail(userB, 3, 500);
      expect(open).toMatchObject({ characterIds: [2, 3], labels: [{ id: 4 }, { id: 256, name: "Ops", color: "#ff6600" }] });
      expect(open?.names.get("entity:100")).toEqual({ name: "Home Corp", category: "corporation" });
      expect(open?.links.types.get(1377)).toEqual({ name: "Character", groupId: 1, categoryId: 1 });
    });

    it("never shows one account's mail to another", async () => {
      await run(2);
      expect((await mail.getMailList(userA, all)).total).toBe(0);
      expect(await mail.getMail(userA, 2, 500)).toBeNull();
      expect((await mail.getFolderCounts(userA, null)).unread.all).toBe(0);
    });

    it("follows read state and deletions in game", async () => {
      await run(2);
      boxes[2] = [{ ...boxes[2][0], is_read: true }, boxes[2][2]]; // 500 read, 501 deleted
      expect((await run(2))?.summary).toBe("0 new mails, 0 bodies, 1 deleted in game");
      const rows = await db().select().from(schema.mailMessages);
      expect(rows.map((r) => [r.mailId, r.isRead]).sort()).toEqual([[500, true], [503, false]]);
    });

    it("drops a mail whose body is gone", async () => {
      // Listed in the headers, deleted in game before its body is read.
      boxes[2] = boxes[2].slice(0, 1);
      const fetchBody = esi.get.bind(esi);
      const spy = vi.spyOn(esi, "get").mockImplementation(async (path, opts) => {
        if (path.endsWith("/mail/500")) boxes[2] = [];
        return fetchBody(path, opts);
      });
      expect((await run(2))?.summary).toBe("1 new mail, 0 bodies, 1 deleted in game");
      spy.mockRestore();
      expect(await db().select().from(schema.mailMessages)).toEqual([]);
    });

    it("never brings mail back for a character sold during the import", async () => {
      const spy = vi.spyOn(esi, "get");
      spy.mockImplementationOnce(async (...args) => {
        await db().execute(sql`UPDATE characters SET user_id = ${userA} WHERE character_id = 2`);
        spy.mockRestore();
        return esi.get(...args);
      });
      expect((await run(2))?.summary).toBe("Character changed owner during the import");
      expect(await db().select().from(schema.mailMessages)).toEqual([]);
    });

    it("announces new unread mail once per account, without sent or old mail", async () => {
      const { liveCursorNow, parseLiveCursor } = await import("@/core/live-cursor");
      const cursor = parseLiveCursor(await liveCursorNow())!;
      await db().insert(schema.mailLists).values({ characterId: 2, mailingListId: 145, userId: userB, name: "Keystar Ops" });
      const recent = new Date(Date.now() - 10 * 60_000);
      const corp = { labels: [4], recipients: [{ id: 100, type: "corporation" as const }] };
      const row = (characterId: number, mailId: number, extra: Partial<typeof schema.mailMessages.$inferInsert> = {}) => ({
        characterId, mailId, userId: userB, fromId: 9, subject: `Mail ${mailId}`, sentAt: recent, labels: [1],
        recipients: [{ id: characterId, type: "character" as const }], ...extra,
      });
      await db().insert(schema.mailMessages).values([row(2, 600), row(2, 601, corp)]);
      await db().insert(schema.mailMessages).values([
        row(3, 601, corp), // The same corp mail, imported later for Bravo Alt.
        row(2, 602, { labels: [], recipients: [{ id: 145, type: "mailing_list" }] }),
        row(2, 603, { isRead: true }),
        row(2, 604, { sentAt: new Date(Date.now() - 5 * 3600_000) }),
        row(3, 605, { fromId: 3, labels: [2] }), // Bravo Alt writes to Bravo: the account's own mail.
        row(2, 605, { fromId: 3 }),
        row(3, 607, { fromId: 2 }), // From Bravo, whose own mailbox doesn't have it: still the account's own mail.
        { ...row(1, 606), userId: userA },
      ]);

      const live = await mail.getLiveMail(userB, cursor);
      expect(live.mails).toEqual([
        expect.objectContaining({ mailId: 600, characterId: 2, characterName: "Bravo", fromName: "Outsider", fromCategory: "character", kind: "direct", listName: null }),
        expect.objectContaining({ mailId: 601, characterId: 2, kind: "corp" }),
        expect.objectContaining({ mailId: 602, kind: "list", listName: "Keystar Ops" }),
      ]);
      expect(parseLiveCursor(live.cursor)!.id).toBe(602);
      expect((await mail.getLiveMail(userB, parseLiveCursor(live.cursor)!)).mails).toEqual([]);
      expect((await mail.getLiveMail(userA, cursor)).mails.map((m) => m.mailId)).toEqual([606]);
    });

    it("drops the previous owner's mail when a character is transferred", async () => {
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      await run(2);
      await run(3);
      await db().transaction((t) => detachTransferredCharacter(t, 3, userB));
      const rows = await db().select().from(schema.mailMessages);
      expect(rows.every((r) => r.characterId === 2)).toBe(true);
      expect(await db().select().from(schema.mailLabels).where(sql`character_id = 3`)).toEqual([]);
    });
  });

  describe("corporation wallets", async () => {
    const { corporationWalletsJob, corporationDivisionsJob } = await import("@/modules/wallet/corp/sync");
    const walletQ = await import("@/modules/wallet/corp/queries");
    const { parseCorpWalletFilters } = await import("@/modules/wallet/corp/filters");
    const DAY = 86_400_000;
    const NOW = Math.floor(Date.now() / 1000) * 1000;
    const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");

    /** Fake ESI for corporation 100: journal and transactions per division, routed by path. */
    function corpEsi(data: {
      journal?: Record<number, Record<string, unknown>[]>;
      transactions?: Record<number, Record<string, unknown>[]>;
      divisions?: { division: number; name?: string }[];
    }) {
      const calls: string[] = [];
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        fetchImpl: (async (url: string) => {
          const u = new URL(String(url));
          calls.push(u.pathname + u.search);
          const m = u.pathname.match(/\/wallets\/(\d)\/(journal|transactions)$/);
          let body: unknown = [];
          if (u.pathname.endsWith("/wallets")) body = [1, 2, 3, 4, 5, 6, 7].map((division) => ({ division, balance: division * 1e6 }));
          else if (u.pathname.endsWith("/divisions")) body = { hangar: [], wallet: data.divisions ?? [] };
          else if (m && m[2] === "journal") body = data.journal?.[Number(m[1])] ?? [];
          else if (m && !u.searchParams.has("from_id")) body = data.transactions?.[Number(m[1])] ?? [];
          return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-pages": "1" } });
        }) as unknown as typeof fetch,
      });
      return { esi, calls };
    }
    const ctx = (esi: InstanceType<typeof EsiClient>) => ({
      jobId: 1, ownerType: "corporation" as const, ownerId: 100, characterId: 1, esi, db: db(), log: undefined as never, meta: {},
    });
    const j = (id: number, daysAgo: number, amount: number, extra: Record<string, unknown> = {}) => ({
      id, date: iso(daysAgo), ref_type: "bounty_prizes", description: "", amount, first_party_id: 1000125, second_party_id: 100, ...extra,
    });
    const filters = parseCorpWalletFilters({}, new Date().toISOString().slice(0, 10));

    beforeEach(async () => {
      // Known names and types, so the resolver has nothing to ask ESI for.
      await db().insert(schema.eveEntities).values([
        { id: 100, name: "Home Corp", category: "corporation" },
        { id: 1000125, name: "CONCORD", category: "corporation" },
        { id: 1, name: "Alpha", category: "character" },
      ]);
      await db().insert(schema.eveTypes).values({ typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, portionSize: 1 });
    });

    it("archives balances, journal and transactions without duplicates", async () => {
      const { esi } = corpEsi({
        journal: {
          1: [
            j(3, 1, 5e6),
            j(2, 2, -2e6, { ref_type: "corporation_account_withdrawal", first_party_id: 100, second_party_id: 100 }),
            j(1, 3, -1e6, { ref_type: "office_rental_fee", second_party_id: 1000125, first_party_id: 100 }),
          ],
          2: [j(10, 2, 2e6, { ref_type: "corporation_account_withdrawal", first_party_id: 100, second_party_id: 100 })],
        },
        transactions: {
          1: [{ transaction_id: 77, date: iso(1), type_id: 34, quantity: 1000, unit_price: 4, is_buy: true, client_id: 1,
            location_id: 60003760, journal_ref_id: 3 }],
        },
      });
      expect(corporationWalletsJob.preferredCorpRoles).toEqual(["Accountant", "Junior_Accountant"]);
      const first = await corporationWalletsJob.run(ctx(esi));
      expect(first?.summary).toBe("7 divisions, 4 new journal entries, 1 new transaction");
      const second = await corporationWalletsJob.run(ctx(esi));
      expect(second?.summary).toBe("7 divisions, 0 new journal entries, 0 new transactions");
      expect(await db().select().from(schema.corpWalletJournal)).toHaveLength(4);
      expect(await db().select().from(schema.corpWalletTransactions)).toHaveLength(1);
      expect((await walletQ.getDivisions(100)).map((d) => d.balance)).toEqual([1e6, 2e6, 3e6, 4e6, 5e6, 6e6, 7e6]);
      const state = await walletQ.getSyncState(100);
      expect(state).toHaveLength(14);
      expect(state.every((s) => s.gaps.length === 0 && s.lastSyncedAt)).toBe(true);
      expect(state.find((s) => s.division === 1 && s.stream === "journal")?.historyStartsAt?.toISOString()).toBe(
        new Date(iso(3)).toISOString(),
      );

      // Income and expenses leave the transfer out; it shows up as moved between divisions.
      const flows = await walletQ.getDailyFlows(100, filters);
      const sum = (k: "income" | "expenses" | "transfersIn" | "transfersOut") => flows.reduce((s, r) => s + r[k], 0);
      expect([sum("income"), sum("expenses"), sum("transfersIn"), sum("transfersOut")]).toEqual([5e6, 1e6, 2e6, 2e6]);

      const all = await walletQ.getJournal(100, filters, { limit: 50, offset: 0 });
      expect(all.total).toBe(4);
      expect(all.rows[0]).toMatchObject({ id: 3, category: "bounties", firstPartyName: "CONCORD", transfer: false });
      const rent = await walletQ.getJournal(100, { ...filters, categories: ["structures"] }, { limit: 50, offset: 0 });
      expect(rent.rows.map((r) => r.id)).toEqual([1]);
      const transfers = await walletQ.getJournal(100, { ...filters, flow: "transfer" }, { limit: 50, offset: 0 });
      expect(transfers.rows.map((r) => r.id).sort()).toEqual([10, 2]);
      const expenses = await walletQ.getJournal(100, { ...filters, flow: "expense", divisions: [1] }, { limit: 50, offset: 0 });
      expect(expenses.rows.map((r) => r.id)).toEqual([1]);
    });

    it("keeps history ESI no longer returns and records the hole when imports stopped too long", async () => {
      await db().insert(schema.corpWalletJournal).values({
        corporationId: 100, division: 1, id: 1, date: new Date(iso(60)), refType: "bounty_prizes", amount: 1e6, description: "",
      });
      await db().insert(schema.corpWalletSyncState).values({
        corporationId: 100, division: 1, stream: "journal", historyStartsAt: new Date(iso(90)), lastSyncedAt: new Date(iso(60)),
      });
      const { esi } = corpEsi({ journal: { 1: [j(500, 10, 3e6), j(499, 20, 3e6)] } });
      const result = await corporationWalletsJob.run(ctx(esi));
      expect(result?.summary).toContain("history gap in division 1");
      expect((await db().select().from(schema.corpWalletJournal)).map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 499, 500]);
      const state = (await walletQ.getSyncState(100)).find((s) => s.division === 1 && s.stream === "journal")!;
      expect(state.historyStartsAt?.toISOString()).toBe(new Date(iso(90)).toISOString());
      expect(state.gaps).toHaveLength(1);
      expect(new Date(state.gaps[0].from).getTime()).toBeLessThan(new Date(state.gaps[0].to).getTime());

      // The next hourly import overlaps: no new gap.
      await corporationWalletsJob.run(ctx(esi));
      const again = (await walletQ.getSyncState(100)).find((s) => s.division === 1 && s.stream === "journal")!;
      expect(again.gaps).toHaveLength(1);
    });

    it("stores custom division names and clears renamed-back ones", async () => {
      await corporationDivisionsJob.run(ctx(corpEsi({ divisions: [{ division: 2, name: "SRP" }, { division: 7, name: " " }] }).esi));
      expect((await walletQ.getDivisions(100)).map((d) => d.name)).toEqual([null, "SRP", null, null, null, null, null]);
      await corporationDivisionsJob.run(ctx(corpEsi({ divisions: [] }).esi));
      expect((await walletQ.getDivisions(100)).every((d) => d.name === null)).toBe(true);
    });
  });

  describe("fleet", async () => {
    const { createLogger } = await import("@/core/logger");
    const { fleetLiveJob } = await import("@/modules/fleet/jobs");
    const { EsiError } = await import("@/core/esi/client");
    type Routes = Record<string, unknown>;
    // Stub ESI: each path returns its fixture, an Error is thrown, a missing path is a 404.
    const stubEsi = (routes: Routes) =>
      ({
        get: async (path: string) => {
          const out = routes[path];
          if (out instanceof Error) throw out;
          if (out === undefined) throw new EsiError(`ESI GET ${path} failed: not found`, 404, path);
          return { data: out, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false };
        },
      }) as unknown as InstanceType<typeof EsiClient>;
    const run = (characterId: number, routes: Routes) =>
      fleetLiveJob.run({
        jobId: 1,
        ownerType: "character",
        ownerId: characterId,
        characterId,
        esi: stubEsi(routes),
        db: db(),
        log: createLogger("test"),
        meta: {},
      }).then((r) => ({ summary: r?.summary }));
    const fm = (id: number, role: string, wing: number, squad: number, ship = 1230) => ({
      character_id: id,
      join_time: "2026-10-03T18:00:00Z",
      role,
      role_name: role,
      ship_type_id: ship,
      solar_system_id: 30000180,
      squad_id: squad,
      wing_id: wing,
      takes_fleet_warp: true,
    });
    const boss = (members: unknown[]) => ({
      "/characters/1/fleet": { fleet_id: 77, fleet_boss_id: 1, role: "fleet_commander", wing_id: -1, squad_id: -1 },
      "/fleets/77": { is_free_move: true, is_registered: false, is_voice_enabled: false, motd: "hi" },
      "/fleets/77/members": members,
      "/fleets/77/wings": [{ id: 5, name: "Wing", squads: [{ id: 50, name: "Squad" }] }],
    });

    beforeEach(async () => {
      await db().insert(schema.eveEntities).values([
        { id: 1, name: "Alpha", category: "character" },
        { id: 2, name: "Bravo", category: "character" },
      ]);
    });

    it("does nothing without an active tracker", async () => {
      const out = await run(1, {});
      expect(out.summary).toBe("Not tracking");
      expect(await db().select().from(schema.fleets)).toEqual([]);
    });

    it("records the fleet, then who left, then closes it when the boss leaves", async () => {
      await db().insert(schema.fleetTrackers).values({ characterId: 1, userId: userA });
      await run(1, boss([fm(1, "fleet_commander", -1, -1), fm(2, "squad_member", 5, 50, 45490), fm(9, "squad_member", 5, 50)]));
      const [fleet] = await db().select().from(schema.fleets);
      expect(fleet).toMatchObject({ fleetId: 77, bossCharacterId: 1, isFreeMove: true, endedAt: null });
      expect(fleet.wings).toEqual([{ id: 5, name: "Wing", squads: [{ id: 50, name: "Squad" }] }]);
      expect(await db().select().from(schema.fleetMembers)).toHaveLength(3);
      const [tracker] = await db().select().from(schema.fleetTrackers);
      expect(tracker).toMatchObject({ status: "tracking", fleetId: 77 });

      await run(1, boss([fm(1, "fleet_commander", -1, -1), fm(2, "squad_member", 5, 50, 45490)]));
      const members = await db().select().from(schema.fleetMembers);
      expect(members.filter((m) => m.leftAt).map((m) => m.characterId)).toEqual([9]);

      const out = await run(1, {});
      expect(out.summary).toMatch(/Not in a fleet/);
      const [ended] = await db().select().from(schema.fleets);
      expect(ended.endedAt).not.toBeNull();
      expect((await db().select().from(schema.fleetMembers)).every((m) => m.leftAt)).toBe(true);
      const [stopped] = await db().select().from(schema.fleetTrackers);
      expect(stopped.status).toBe("no_fleet");
    });

    it("waits without reading members while the character is not the boss", async () => {
      await db().insert(schema.fleetTrackers).values({ characterId: 2, userId: userB });
      const out = await run(2, {
        "/characters/2/fleet": { fleet_id: 77, fleet_boss_id: 1, role: "squad_member", wing_id: 5, squad_id: 50 },
        "/fleets/77/members": new Error("must not be called"),
      });
      expect(out.summary).toMatch(/not the boss/);
      const [tracker] = await db().select().from(schema.fleetTrackers);
      expect(tracker).toMatchObject({ status: "not_boss", fleetId: 77 });
      expect(await db().select().from(schema.fleets)).toEqual([]);
    });

    it("switches fleet access off and on in Keystar without an EVE login", async () => {
      const { disableOptionalScope, enableOptionalScope } = await import("@/core/auth/scope-switch");
      const { fleetJobs } = await import("@/modules/fleet/jobs");
      const { FLEET_SCOPE } = await import("@/modules/fleet/logic");
      // A corporation scope: never opt-in, so the switch refuses it.
      const CORP_MINING = "esi-industry.read_corporation_mining.v1";
      await db().insert(schema.esiTokens).values({ characterId: 1, refreshTokenEnc: "x", scopes: [CORP_MINING, FLEET_SCOPE] });
      const token = async () => (await db().select().from(schema.esiTokens))[0];
      const fleetJobEnabled = async () => {
        await scheduler.planJobs(fleetJobs);
        return (await db().select().from(schema.syncJobs)).some((r) => r.ownerId === 1 && r.enabled);
      };
      expect(await fleetJobEnabled()).toBe(true);

      expect(await disableOptionalScope(1, FLEET_SCOPE)).toBe("ok");
      expect(await token()).toMatchObject({ scopes: [CORP_MINING], disabledScopes: [FLEET_SCOPE] });
      expect(await fleetJobEnabled()).toBe(false);
      // Idempotent, and only for opt-in scopes the token holds.
      expect(await disableOptionalScope(1, FLEET_SCOPE)).toBe("ok");
      expect(await disableOptionalScope(1, CORP_MINING)).toBe("unknownScope");
      expect(await disableOptionalScope(2, FLEET_SCOPE)).toBe("notHeld");

      expect(await enableOptionalScope(1, FLEET_SCOPE)).toBe("ok");
      expect(await token()).toMatchObject({ scopes: [CORP_MINING, FLEET_SCOPE], disabledScopes: [] });
      expect(await fleetJobEnabled()).toBe(true);
      expect(await enableOptionalScope(1, FLEET_SCOPE)).toBe("ok");
      expect(await enableOptionalScope(2, FLEET_SCOPE)).toBe("notHeld");

      // A revoked token can't be switched back on in Keystar: that needs the EVE login.
      expect(await disableOptionalScope(1, FLEET_SCOPE)).toBe("ok");
      await db().execute(sql`UPDATE esi_tokens SET status = 'invalid' WHERE character_id = 1`);
      expect(await enableOptionalScope(1, FLEET_SCOPE)).toBe("notHeld");
      expect(await token()).toMatchObject({ scopes: [CORP_MINING], disabledScopes: [FLEET_SCOPE] });
    });
  });

  describe("skills", async () => {
    const { skillQueueJob, characterSkillsJob, implantsJob } = await import("@/modules/skills/jobs");
    const { IMPLANTS_SCOPE, SKILLQUEUE_SCOPE, SKILLS_SCOPE } = await import("@/modules/skills/module");
    const skills = await import("@/modules/skills/queries");

    type QueueItem = { queue_position: number; skill_id: number; finished_level: number; start_date?: string; finish_date?: string;
      training_start_sp?: number; level_start_sp?: number; level_end_sp?: number };
    let queues: Record<number, QueueItem[]> = {};
    let trained: Record<number, { skill_id: number; trained_skill_level: number; active_skill_level: number; skillpoints_in_skill: number }[]> = {};
    let typeRequests: number[] = [];
    let implants: Record<number, number[]> = {};
    // Ocular Filter - Standard (+4 perception) and an implant without attribute bonuses.
    const IMPLANT_DOGMA: Record<number, { attribute_id: number; value: number }[]> = {
      10216: [175, 176, 177, 178, 179].map((id) => ({ attribute_id: id, value: id === 178 ? 4 : 0 })),
      9957: [{ attribute_id: 331, value: 7 }],
    };
    const esi = new EsiClient({
      baseUrl: "https://esi.test",
      userAgent: "t",
      compatibilityDate: "2026-08-18",
      tokenProvider: async () => "token",
      maxRetries: 0,
      fetchImpl: (async (url: string) => {
        const path = new URL(String(url)).pathname;
        const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        const type = /^\/universe\/types\/(\d+)$/.exec(path);
        if (type) {
          typeRequests.push(Number(type[1]));
          const implantDogma = IMPLANT_DOGMA[Number(type[1])];
          if (implantDogma) return reply({ type_id: Number(type[1]), name: "Implant", group_id: 745, published: true, dogma_attributes: implantDogma });
          return reply({ type_id: Number(type[1]), name: "Skill", group_id: 255, published: true,
            dogma_attributes: [{ attribute_id: 180, value: 165 }, { attribute_id: 181, value: 168 }, { attribute_id: 275, value: 2 }] });
        }
        const m = /^\/characters\/(\d+)\/(skillqueue|skills|attributes|implants)$/.exec(path)!;
        const id = Number(m[1]);
        if (m[2] === "implants") return reply(implants[id] ?? []);
        if (m[2] === "skillqueue") return reply(queues[id] ?? []);
        if (m[2] === "skills") return reply({ skills: trained[id] ?? [], total_sp: 5_000_000, unallocated_sp: 1000 });
        return reply({ charisma: 19, intelligence: 27, memory: 21, perception: 20, willpower: 20, bonus_remaps: 1,
          accrued_remap_cooldown_date: "2027-01-01T00:00:00Z" });
      }) as unknown as typeof fetch,
    });
    const ctx = (characterId: number) => ({ jobId: 1, ownerType: "character" as const, ownerId: characterId, characterId, esi, db: db(),
      log: undefined as never, meta: {} });
    const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

    beforeEach(async () => {
      typeRequests = [];
      implants = { 2: [10216, 9957] };
      queues = {
        2: [
          { queue_position: 0, skill_id: 3300, finished_level: 4, start_date: future(-1), finish_date: future(10),
            training_start_sp: 50_000, level_start_sp: 45_255, level_end_sp: 256_000 },
          { queue_position: 1, skill_id: 3301, finished_level: 5, start_date: future(10), finish_date: future(100),
            training_start_sp: 256_000, level_start_sp: 256_000, level_end_sp: 1_280_000 },
        ],
      };
      trained = { 2: [{ skill_id: 3300, trained_skill_level: 3, active_skill_level: 3, skillpoints_in_skill: 50_000 },
        { skill_id: 3302, trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 256_000 }] };
      // Names are already known, so ensureTypes stays off the network.
      await db().insert(schema.eveGroups).values({ groupId: 255, name: "Gunnery", categoryId: 16 });
      await db().insert(schema.eveTypes).values([3300, 3301, 3302].map((typeId) => ({ typeId, name: `Skill ${typeId}`, groupId: 255 })));
      await db().insert(schema.eveGroups).values({ groupId: 745, name: "Cyber Learning", categoryId: 20 });
      await db().insert(schema.eveTypes).values([10216, 9957].map((typeId) => ({ typeId, name: `Implant ${typeId}`, groupId: 745 })));
      await db().insert(schema.characters).values({ characterId: 4, userId: userA, name: "Alpha Abroad", corporationId: 200, ownerHash: "h4" });
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: "x", scopes: [] },
        { characterId: 2, refreshTokenEnc: "x", scopes: [SKILLQUEUE_SCOPE, SKILLS_SCOPE] },
        { characterId: 3, refreshTokenEnc: "x", scopes: [] },
        { characterId: 4, refreshTokenEnc: "x", scopes: [SKILLQUEUE_SCOPE, SKILLS_SCOPE] },
      ]);
    });

    it("replaces the queue snapshot and learns each skill's attributes once", async () => {
      expect((await skillQueueJob.run(ctx(2)))?.summary).toBe("2 queued skills");
      expect(await db().select().from(schema.skillsTypeAttributes)).toEqual(
        expect.arrayContaining([expect.objectContaining({ typeId: 3300, primaryAttribute: 165, secondaryAttribute: 168, rank: 2 })]),
      );
      expect(typeRequests.sort()).toEqual([3300, 3301]);

      queues[2] = queues[2].slice(1).map((e) => ({ ...e, queue_position: 0 }));
      await db().execute(sql`DELETE FROM esi_cache`);
      expect((await skillQueueJob.run(ctx(2)))?.summary).toBe("1 queued skill");
      const rows = await db().select().from(schema.skillsQueue);
      expect(rows.map((r) => [r.queuePosition, r.skillId])).toEqual([[0, 3301]]);
      expect(typeRequests).toHaveLength(2);
    });

    it("stores trained skills and attributes, dropping skills ESI no longer lists", async () => {
      await characterSkillsJob.run(ctx(2));
      trained[2] = trained[2].slice(0, 1).map((s) => ({ ...s, trained_skill_level: 4 }));
      await db().execute(sql`DELETE FROM esi_cache`);
      expect((await characterSkillsJob.run(ctx(2)))?.summary).toBe("1 trained skill");
      const rows = await db().select().from(schema.skillsCharacterSkills);
      expect(rows.map((r) => [r.skillId, r.trainedLevel])).toEqual([[3300, 4]]);
      const [c] = await db().select().from(schema.skillsCharacter);
      expect(c).toMatchObject({ characterId: 2, totalSp: 5_000_000, unallocatedSp: 1000, intelligence: 27, bonusRemaps: 1 });
    });

    it("shows own characters, and in the corporation view only home members who share their queue", async () => {
      await skillQueueJob.run(ctx(2));
      await characterSkillsJob.run(ctx(2));
      const user = (id: string, perms: string[]) => ({ id, can: (p: string) => perms.includes(p) });

      const ownA = await skills.getSkillsOverview(skills.skillsScope(user(userA, ["skills.view.own"]), 100, "corp"));
      expect(ownA.characters.map((c) => c.characterId)).toEqual([1, 4]);
      expect(ownA.characters.find((c) => c.characterId === 1)?.queueEnabled).toBe(false);

      const director = user(userA, ["skills.view.own", "skills.view.corp"]);
      const corp = await skills.getSkillsOverview(skills.skillsScope(director, 100, "corp"));
      // Bravo shares; Bravo Alt doesn't; Alpha Abroad shares but is in another corporation.
      expect(corp.characters.map((c) => [c.characterId, c.ownerName, c.isOwn])).toEqual([[2, "Bravo", false]]);
      const queue = corp.queues.get(2)!;
      expect(queue.map((e) => [e.skillName, e.groupName, e.finishedLevel])).toEqual([["Skill 3300", "Gunnery", 4], ["Skill 3301", "Gunnery", 5]]);
      expect(corp.characters[0]).toMatchObject({ totalSp: 5_000_000, attributes: { intelligence: 27 } });

      // Without a home corporation the corporation view falls back to the viewer's own characters.
      expect(skills.skillsScope(director, null, "corp").corp).toBe(false);

      // Keeping only the queue scope leaves the corporation view; own views drop what the skills scope read.
      await db().update(schema.esiTokens).set({ scopes: [SKILLQUEUE_SCOPE] }).where(sql`character_id = 2`);
      expect((await skills.getSkillsOverview(skills.skillsScope(director, 100, "corp"))).characters).toEqual([]);
      const queueOnly = await skills.getSkillsOverview(skills.skillsScope(user(userB, ["skills.view.own"]), 100, "own"));
      expect(queueOnly.characters[0]).toMatchObject({ characterId: 2, queueEnabled: true, skillsEnabled: false, totalSp: null, attributes: null });

      // Turning sharing off hides the stored queue at once.
      await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 2`);
      const ownB = await skills.getSkillsOverview(skills.skillsScope(user(userB, ["skills.view.own"]), 100, "own"));
      expect(ownB.characters.map((c) => [c.characterId, c.queueEnabled])).toEqual([[2, false], [3, false]]);
      expect(ownB.queues.size).toBe(0);
      expect((await skills.getSkillsAccess(userB)).map((a) => [a.characterId, a.granted, a.hasData])).toEqual([[2, false, true], [3, false, false]]);
    });

    it("stores implants with their attribute bonuses for the remap optimiser", async () => {
      await skillQueueJob.run(ctx(2));
      expect(await skills.getRemapInputs([2], [3300, 3301, 3302])).toMatchObject({ implantsShared: new Set() });

      await db().update(schema.esiTokens).set({ scopes: [SKILLQUEUE_SCOPE, SKILLS_SCOPE, IMPLANTS_SCOPE] }).where(sql`character_id = 2`);
      // Shared but not read yet: implants unknown, not "none".
      expect((await skills.getRemapInputs([2], [])).implants.get(2)).toBeNull();

      expect((await implantsJob.run(ctx(2)))?.summary).toBe("2 implants");
      const attrs = await db().select().from(schema.skillsImplantAttributes);
      expect(attrs.map((a) => [a.typeId, a.perception]).sort()).toEqual([[10216, 4], [9957, 0]].sort());
      const inputs = await skills.getRemapInputs([2], [3300, 3301, 3302]);
      expect(inputs.implants.get(2)).toEqual({ charisma: 0, intelligence: 0, memory: 0, perception: 4, willpower: 0 });
      expect(inputs.implantsShared.has(2)).toBe(true);
      // Skill 3302 was never queued, so its attributes are unknown.
      expect([...inputs.skillAttributes.keys()].sort()).toEqual([3300, 3301]);

      // Unplugged implants disappear; known bonuses aren't fetched again.
      implants[2] = [];
      typeRequests = [];
      await db().execute(sql`DELETE FROM esi_cache`);
      expect((await implantsJob.run(ctx(2)))?.summary).toBe("0 implants");
      expect((await skills.getRemapInputs([2], [])).implants.get(2)).toEqual({ charisma: 0, intelligence: 0, memory: 0, perception: 0, willpower: 0 });
      expect(typeRequests).toEqual([]);
    });

    it("stores implant bonuses even when their names can't be resolved", async () => {
      const { getEsi } = await import("@/core/esi");
      // Unknown names send ensureTypes to ESI, where the implant's group can't be read.
      await db().execute(sql`DELETE FROM eve_types WHERE type_id = 10216`);
      const names = vi.spyOn(getEsi(), "get").mockImplementation(async (path: string) => {
        if (path.startsWith("/universe/groups/")) throw new Error("ESI down");
        return { data: { type_id: 10216, name: "Ocular Filter - Standard", group_id: 99_999 } } as never;
      });
      implants[2] = [10216];
      expect((await implantsJob.run(ctx(2)))?.summary).toBe("1 implant");
      names.mockRestore();
      const [bonus] = await db().select().from(schema.skillsImplantAttributes);
      expect(bonus).toMatchObject({ typeId: 10216, perception: 4 });
    });

    it("counts a character as sharing with the queue and skills scopes alone", async () => {
      const [access] = await skills.getSkillsAccess(userB);
      expect(access).toMatchObject({ characterId: 2, granted: true, implantsGranted: false });
      expect((await skills.getRemapInputs([2], [])).implantsShared.has(2)).toBe(false);
    });

    it("switches sharing off and back on in Keystar while the token holds both scopes", async () => {
      const { disableOptionalScope, enableOptionalScope } = await import("@/core/auth/scope-switch");
      for (const scope of [SKILLQUEUE_SCOPE, SKILLS_SCOPE]) await disableOptionalScope(2, scope);
      const [off] = await skills.getSkillsAccess(userB);
      expect(off).toMatchObject({ characterId: 2, granted: false, switchedOff: true });
      const director = { id: userA, can: (p: string) => p.startsWith("skills.") };
      expect((await skills.getSkillsOverview(skills.skillsScope(director, 100, "corp"))).characters).toEqual([]);

      for (const scope of [SKILLQUEUE_SCOPE, SKILLS_SCOPE]) await enableOptionalScope(2, scope);
      expect((await skills.getSkillsAccess(userB))[0]).toMatchObject({ granted: true, switchedOff: false });
      // A revoked token needs the EVE login, so it isn't offered the in-app switch.
      await disableOptionalScope(2, SKILLS_SCOPE);
      await db().update(schema.esiTokens).set({ status: "invalid" }).where(sql`character_id = 2`);
      expect((await skills.getSkillsAccess(userB))[0]).toMatchObject({ granted: false, switchedOff: false });
    });
  });

  describe("industry access", async () => {
    const { INDUSTRY_JOBS_SCOPE, INDUSTRY_SCOPES, STRUCTURES_SCOPE } = await import("@/modules/industry/module");
    const industry = await import("@/modules/industry/queries");
    const job = (jobId: number, characterId: number) => ({
      jobId,
      characterId,
      installerId: characterId,
      locationId: 60003760,
      facilityId: 60003760,
      activityId: 1,
      activity: "manufacturing" as const,
      blueprintId: 1,
      blueprintTypeId: 787,
      blueprintLocationId: 60003760,
      outputLocationId: 60003760,
      runs: 1,
      duration: 3600,
      status: "active" as const,
      startDate: new Date(),
      endDate: new Date(Date.now() + 3600_000),
    });
    // Who the server actions run as; null makes the permission check fail.
    let actor: { id: string; characterIds: number[] } | null = null;

    beforeEach(async () => {
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: "x", scopes: [...INDUSTRY_SCOPES] },
        { characterId: 2, refreshTokenEnc: "x", scopes: [...INDUSTRY_SCOPES] },
        { characterId: 3, refreshTokenEnc: "x", scopes: [] },
      ]);
      await db().insert(schema.industryJobs).values([job(1, 1), job(2, 2)]);
      vi.doMock("@/core/auth/dal", () => ({
        assertPermission: async () => {
          if (!actor) throw new Error("forbidden");
          return actor;
        },
      }));
      vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
      vi.doMock("server-only", () => ({}));
    });
    afterEach(() => {
      vi.doUnmock("@/core/auth/dal");
      vi.doUnmock("next/cache");
      vi.doUnmock("server-only");
    });
    const scopesOf = async (characterId: number) =>
      (await db().select({ scopes: schema.esiTokens.scopes }).from(schema.esiTokens).where(sql`character_id = ${characterId}`))[0].scopes.sort();

    it("switches both scopes off and on together, in Keystar only", async () => {
      const { setIndustryAccess } = await import("@/app/(app)/industry/actions");
      actor = { id: userB, characterIds: [2, 3] };
      expect(await industry.enabledCharacterIds([2, 3])).toEqual([2]);

      expect(await setIndustryAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([]);
      expect((await industry.getIndustryAccess(userB))[0]).toMatchObject({ characterId: 2, granted: false, switchedOff: true, hasData: true });
      // The stored jobs stay, but the page no longer reads the character.
      expect(await industry.enabledCharacterIds([2, 3])).toEqual([]);
      expect(await industry.getIndustryCoverage([2, 3])).toMatchObject({ tracked: 0, notEnabled: 2 });
      expect((await industry.getIndustryJobs(industry_filters(), { ownCharacterIds: [] }, { limit: 10, offset: 0 })).total).toBe(0);

      expect(await setIndustryAccess(2, true)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([...INDUSTRY_SCOPES].sort());
      expect(await industry.enabledCharacterIds([2, 3])).toEqual([2]);
      expect(await industry.getIndustryCoverage([2, 3])).toMatchObject({ tracked: 1, notEnabled: 1 });

      // A token that never held the scopes needs the EVE login.
      expect(await setIndustryAccess(3, true)).toEqual({ ok: false, error: "notHeld" });
    });

    it("refuses a token holding only one scope rather than enabling half", async () => {
      const { setIndustryAccess } = await import("@/app/(app)/industry/actions");
      actor = { id: userB, characterIds: [2, 3] };
      await db().update(schema.esiTokens).set({ scopes: [INDUSTRY_JOBS_SCOPE] }).where(sql`character_id = 2`);
      expect(await setIndustryAccess(2, true)).toEqual({ ok: false, error: "notHeld" });
      expect(await scopesOf(2)).toEqual([INDUSTRY_JOBS_SCOPE]);
      // Partly enabled counts as not enabled everywhere, so the pages agree.
      expect((await industry.getIndustryAccess(userB))[0]).toMatchObject({ granted: false, switchedOff: false });
      expect(await industry.enabledCharacterIds([2])).toEqual([]);
      expect(await industry.getIndustryCoverage([2])).toMatchObject({ tracked: 0, notEnabled: 1 });
      // Switching off a partly enabled character works and clears what it still holds.
      expect(await setIndustryAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([]);
      expect(STRUCTURES_SCOPE).toBeTruthy();
    });

    it("keeps the structure scope while market access uses it", async () => {
      const { deleteIndustryData, setIndustryAccess } = await import("@/app/(app)/industry/actions");
      const { MARKET_ORDERS_SCOPE } = await import("@/modules/market/module");
      actor = { id: userB, characterIds: [2, 3] };
      await db().update(schema.esiTokens).set({ scopes: [...INDUSTRY_SCOPES, MARKET_ORDERS_SCOPE] }).where(sql`character_id = 2`);

      expect(await setIndustryAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([MARKET_ORDERS_SCOPE, STRUCTURES_SCOPE].sort());
      // Switched off, not partly enabled: the structure scope left is market access's.
      expect((await industry.getIndustryAccess(userB))[0]).toMatchObject({ granted: false, partial: false, switchedOff: true });
      expect(await industry.enabledCharacterIds([2])).toEqual([]);
      expect(await deleteIndustryData(2)).toEqual({ ok: true });

      expect(await setIndustryAccess(2, true)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([...INDUSTRY_SCOPES, MARKET_ORDERS_SCOPE].sort());
    });

    it("checks the permission and the owner, also against the database", async () => {
      const { deleteIndustryData, setIndustryAccess } = await import("@/app/(app)/industry/actions");
      actor = null;
      expect(await setIndustryAccess(2, false)).toEqual({ ok: false, error: "forbidden" });
      expect(await deleteIndustryData(2)).toEqual({ ok: false, error: "forbidden" });
      actor = { id: userB, characterIds: [3] };
      expect(await setIndustryAccess(2, false)).toEqual({ ok: false, error: "notOwned" });
      expect(await deleteIndustryData(2)).toEqual({ ok: false, error: "notOwned" });
      // The session's character list is stale: character 1 belongs to Alpha, not Bravo.
      actor = { id: userB, characterIds: [1] };
      expect(await setIndustryAccess(1, false)).toEqual({ ok: false, error: "notOwned" });
      expect(await deleteIndustryData(1)).toEqual({ ok: false, error: "notOwned" });
      expect(await scopesOf(1)).toEqual([...INDUSTRY_SCOPES].sort());
      expect((await db().select().from(schema.industryJobs)).map((j) => j.jobId).sort()).toEqual([1, 2]);
    });

    it("skips a sync's write once access is off, so deleted jobs stay deleted", async () => {
      const { characterIndustryJobsJob } = await import("@/modules/industry/jobs");
      let requests = 0;
      let offAfterFetch = false;
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        maxRetries: 0,
        fetchImpl: (async (url: string) => {
          const path = new URL(String(url)).pathname;
          const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
          if (/\/industry\/jobs$/.test(path)) {
            requests++;
            // Simulates access being switched off while the ESI request is in flight.
            if (offAfterFetch) await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 2`);
            return reply([{ job_id: 900, installer_id: 2, facility_id: 60003760, station_id: 60003760, activity_id: 1, blueprint_id: 5,
              blueprint_type_id: 787, blueprint_location_id: 60003760, output_location_id: 60003760, runs: 2, cost: 10, duration: 3600,
              status: "active", start_date: new Date().toISOString(), end_date: new Date(Date.now() + 3600_000).toISOString() }]);
          }
          if (/\/universe\/stations\//.test(path)) return reply({ name: "Station", system_id: 30000180, type_id: 1529 });
          if (/\/universe\/types\//.test(path)) return reply({ type_id: 787, name: "Blueprint", group_id: 462, published: true });
          return reply([]);
        }) as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 2, characterId: 2, esi, db: db(), log: undefined as never, meta: {} };
      // With access on, the run stores the job.
      expect((await characterIndustryJobsJob.run(ctx))?.summary).toContain("1 running job");
      expect((await db().select().from(schema.industryJobs)).map((j) => j.jobId).sort()).toEqual([1, 2, 900]);

      // Access off and data deleted: a run claimed before the planner disables the schedule reads nothing from ESI.
      await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 2`);
      await db().delete(schema.industryJobs).where(sql`character_id = 2`);
      await db().delete(schema.esiCache);
      const before = requests;
      expect((await characterIndustryJobsJob.run(ctx))?.summary).toBe("Industry access is switched off");
      expect(requests).toBe(before);
      expect((await db().select().from(schema.industryJobs)).map((j) => j.jobId)).toEqual([1]);

      // A run whose ESI request already happened when access went off must not bring the jobs back either.
      await db().update(schema.esiTokens).set({ scopes: [...INDUSTRY_SCOPES] }).where(sql`character_id = 2`);
      offAfterFetch = true;
      expect((await characterIndustryJobsJob.run(ctx))?.summary).toContain("switched industry access off");
      expect((await db().select().from(schema.industryJobs)).map((j) => j.jobId)).toEqual([1]);
    });

    it("deletes stored jobs only once access is off", async () => {
      const { deleteIndustryData, setIndustryAccess } = await import("@/app/(app)/industry/actions");
      actor = { id: userB, characterIds: [2, 3] };
      await db().insert(schema.esiCache).values(
        ["2:GET /characters/2/industry/jobs?include_completed=true", "2:GET /characters/2/roles"].map((key) => ({ key, body: [] })),
      );
      expect(await deleteIndustryData(2)).toEqual({ ok: false, error: "stillEnabled" });
      expect(await setIndustryAccess(2, false)).toEqual({ ok: true });
      expect(await deleteIndustryData(2)).toEqual({ ok: true });
      expect((await db().select().from(schema.industryJobs)).map((j) => j.jobId)).toEqual([1]);
      // The cached copy of the jobs goes too; other cached responses stay.
      expect((await db().select().from(schema.esiCache)).map((r) => r.key)).toEqual(["2:GET /characters/2/roles"]);
      expect((await industry.getIndustryAccess(userB))[0]).toMatchObject({ characterId: 2, hasData: false });
    });
  });

  describe("mining access", async () => {
    const { MINING_LEDGER_SCOPE: MINING } = await import("@/modules/mining/module");
    const { characterLedgerJob } = await import("@/modules/mining/jobs");
    // Who the server actions run as; null makes the permission check fail.
    let actor: { id: string; characterIds: number[] } | null = null;

    beforeEach(async () => {
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: "x", scopes: [MINING] },
        { characterId: 2, refreshTokenEnc: "x", scopes: [MINING] },
        { characterId: 3, refreshTokenEnc: "x", scopes: [] },
      ]);
      const windowEnd = new Date("2026-09-10T12:00:00Z");
      for (const characterId of [1, 2]) {
        await db().insert(schema.miningActivity).values({
          characterId,
          windowStart: new Date(windowEnd.getTime() - 900_000),
          windowEnd,
          date: "2026-09-10",
          typeId: 1230,
          quantity: 10,
        });
        await db().insert(schema.miningActivityCoverage).values({ characterId, since: windowEnd, lastObservedAt: windowEnd });
      }
      vi.doMock("@/core/auth/dal", () => ({
        assertPermission: async () => {
          if (!actor) throw new Error("forbidden");
          return actor;
        },
        getCurrentUser: async () => actor,
      }));
      vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
      vi.doMock("server-only", () => ({}));
    });
    afterEach(() => {
      vi.doUnmock("@/core/auth/dal");
      vi.doUnmock("next/cache");
      vi.doUnmock("server-only");
    });
    const characterRows = async (table: typeof schema.miningCharacterLedger | typeof schema.miningActivity | typeof schema.miningActivityCoverage) =>
      (await db().select({ characterId: table.characterId }).from(table)).map((r) => r.characterId).sort();

    it("switches the ledger off and on in Keystar, keeping the history", async () => {
      const { setOptionalScope } = await import("@/app/(app)/characters/actions");
      actor = { id: userB, characterIds: [2, 3] };
      expect(await q.getMiningAccess(userB)).toMatchObject([
        { characterId: 2, granted: true, switchedOff: false, tokenStatus: "active", firstDate: "2026-09-10", lastDate: "2026-09-10" },
        { characterId: 3, granted: false, switchedOff: false, firstDate: "2026-09-11" },
      ]);
      expect(await q.getCoverage(own([2, 3]))).toMatchObject({ trackedCharacters: 1, notEnabled: 1, invalidTokens: 0 });

      expect(await setOptionalScope(2, MINING, false)).toEqual({ ok: true });
      const [token] = await db().select().from(schema.esiTokens).where(sql`character_id = 2`);
      expect(token).toMatchObject({ scopes: [], disabledScopes: [MINING] });
      expect((await q.getMiningAccess(userB))[0]).toMatchObject({ granted: false, switchedOff: true, firstDate: "2026-09-10" });
      expect(await q.getCoverage(own([2, 3]))).toMatchObject({ trackedCharacters: 0, notEnabled: 2 });
      // The sync stops, but the stored history still counts.
      await scheduler.planJobs([characterLedgerJob]);
      expect((await db().select().from(schema.syncJobs)).filter((j) => j.enabled).map((j) => j.ownerId)).toEqual([1]);
      expect((await q.getMiningSummary(filters(), own([2, 3]), val)).current.value).toBe(100 * 600 + 500 * 10);

      expect(await setOptionalScope(2, MINING, true)).toEqual({ ok: true });
      expect(await q.getCoverage(own([2, 3]))).toMatchObject({ trackedCharacters: 1, notEnabled: 1 });
      // A token that never held the scope needs the EVE login.
      expect(await setOptionalScope(3, MINING, true)).toEqual({ ok: false, error: "notHeld" });
    });

    it("counts characters without a token as not sharing, and revoked tokens apart", async () => {
      await db().delete(schema.esiTokens).where(sql`character_id = 3`);
      await db().update(schema.esiTokens).set({ status: "invalid" }).where(sql`character_id = 1`);
      expect(await q.getCoverage(corp)).toMatchObject({ trackedCharacters: 1, notEnabled: 1, invalidTokens: 1 });
      expect((await q.getMiningAccess(userB))[1]).toMatchObject({ characterId: 3, granted: false, tokenStatus: null });
    });

    it("deletes the stored ledger only once it is off", async () => {
      const { setOptionalScope } = await import("@/app/(app)/characters/actions");
      const { deleteMiningData } = await import("@/app/(app)/mining/actions");
      actor = { id: userB, characterIds: [2, 3] };
      await db().insert(schema.esiCache).values(
        ["2:GET /characters/2/mining?page=1", "2:GET /characters/2/roles", "1:GET /characters/1/mining?page=1"].map((key) => ({ key, body: [] })),
      );
      expect(await deleteMiningData(2)).toEqual({ ok: false, error: "stillEnabled" });
      expect(await setOptionalScope(2, MINING, false)).toEqual({ ok: true });
      expect(await deleteMiningData(2)).toEqual({ ok: true });

      expect(await characterRows(schema.miningCharacterLedger)).toEqual([1, 3]);
      expect(await characterRows(schema.miningActivity)).toEqual([1]);
      expect(await characterRows(schema.miningActivityCoverage)).toEqual([1]);
      // Moon-drill records belong to the corporation and stay.
      expect((await db().select().from(schema.miningObserverLedger)).map((r) => r.characterId).sort()).toEqual([2, 9]);
      // The cached copy of the ledger goes too; other cached responses stay.
      expect((await db().select().from(schema.esiCache)).map((r) => r.key).sort()).toEqual([
        "1:GET /characters/1/mining?page=1",
        "2:GET /characters/2/roles",
      ]);
      expect((await q.getMiningAccess(userB))[0]).toMatchObject({ characterId: 2, firstDate: null, lastDate: null });
    });

    it("checks the permission and the owner, also against the database", async () => {
      const { setOptionalScope } = await import("@/app/(app)/characters/actions");
      const { deleteMiningData } = await import("@/app/(app)/mining/actions");
      actor = null;
      expect(await setOptionalScope(2, MINING, false)).toEqual({ ok: false, error: "forbidden" });
      expect(await deleteMiningData(2)).toEqual({ ok: false, error: "forbidden" });
      actor = { id: userB, characterIds: [3] };
      expect(await setOptionalScope(2, MINING, false)).toEqual({ ok: false, error: "notOwned" });
      expect(await deleteMiningData(2)).toEqual({ ok: false, error: "notOwned" });
      // The session's character list is stale: character 1 belongs to Alpha, not Bravo.
      await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 1`);
      actor = { id: userB, characterIds: [1] };
      expect(await deleteMiningData(1)).toEqual({ ok: false, error: "notOwned" });
      expect(await characterRows(schema.miningCharacterLedger)).toEqual([1, 2, 3]);
    });

    it("skips a sync's write once the ledger is off, so deleted history stays deleted", async () => {
      const today = new Date().toISOString().slice(0, 10);
      let requests = 0;
      let offAfterFetch = false;
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        maxRetries: 0,
        fetchImpl: (async () => {
          requests++;
          // Simulates the ledger being switched off while the ESI request is in flight.
          if (offAfterFetch) await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 2`);
          return new Response(JSON.stringify([{ date: today, quantity: 700, solar_system_id: 30000180, type_id: 1230 }]), {
            status: 200,
            headers: { "content-type": "application/json", "last-modified": new Date().toUTCString() },
          });
        }) as unknown as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 2, characterId: 2, esi, db: db(), log: undefined as never, meta: {} };
      const todayRows = async () => db().select().from(schema.miningCharacterLedger).where(sql`character_id = 2 AND date = ${today}`);

      // Off: a run claimed before the planner disables the schedule reads nothing from ESI.
      await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 2`);
      expect((await characterLedgerJob.run(ctx))?.summary).toBe("Mining ledger is switched off");
      expect(requests).toBe(0);

      // A run whose ESI request already happened when the ledger went off writes nothing either, and drops the cached
      // response (stored on its way in), which a run after switching back on would otherwise skip as already applied.
      await db().update(schema.esiTokens).set({ scopes: [MINING] }).where(sql`character_id = 2`);
      await db().insert(schema.esiCache).values(
        ["2:GET /characters/2/mining?page=1", "2:GET /characters/2/roles"].map((key) => ({ key, body: [] })),
      );
      offAfterFetch = true;
      expect((await characterLedgerJob.run(ctx))?.summary).toBe("Mining ledger was switched off during the sync");
      expect(requests).toBe(1);
      expect(await todayRows()).toEqual([]);
      expect((await db().select().from(schema.esiCache)).map((r) => r.key)).toEqual(["2:GET /characters/2/roles"]);


      // On: the run stores the ledger.
      offAfterFetch = false;
      await db().update(schema.esiTokens).set({ scopes: [MINING] }).where(sql`character_id = 2`);
      await db().delete(schema.esiCache);
      expect((await characterLedgerJob.run(ctx))?.summary).toContain("1 ledger entries");
      expect(await todayRows()).toHaveLength(1);

      // A revoked token isn't "switched off": the run goes on to fail at the token refresh (stubbed here), as before.
      await db().update(schema.esiTokens).set({ status: "invalid" }).where(sql`character_id = 2`);
      const before = requests;
      expect((await characterLedgerJob.run(ctx))?.summary).not.toContain("switched off");
      expect(requests).toBe(before + 1);
    });
  });

  describe("market access", async () => {
    const { INDUSTRY_JOBS_SCOPE, INDUSTRY_SCOPES } = await import("@/modules/industry/module");
    const { MARKET_ORDERS_SCOPE, MARKET_SCOPES } = await import("@/modules/market/module");
    const market = await import("@/modules/market/queries");
    const industry = await import("@/modules/industry/queries");
    const { parseMarketFilters } = await import("@/modules/market/filters");
    const order = (orderId: number, characterId: number, extra: Partial<typeof schema.marketOrders.$inferInsert> = {}) => ({
      orderId,
      characterId,
      typeId: 34,
      regionId: 10000002,
      locationId: 60003760,
      isBuyOrder: false,
      isCorporation: false,
      price: 5,
      volumeTotal: 100,
      volumeRemain: 40,
      range: "region" as const,
      duration: 90,
      issued: new Date(Date.now() - 86_400_000),
      state: "open" as const,
      ...extra,
    });
    // Who the server actions run as; null makes the permission check fail.
    let actor: { id: string; characterIds: number[] } | null = null;

    beforeEach(async () => {
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: "x", scopes: [...MARKET_SCOPES] },
        { characterId: 2, refreshTokenEnc: "x", scopes: [...MARKET_SCOPES] },
        { characterId: 3, refreshTokenEnc: "x", scopes: [] },
      ]);
      await db().insert(schema.marketOrders).values([order(1, 1), order(2, 2)]);
      vi.doMock("@/core/auth/dal", () => ({
        assertPermission: async () => {
          if (!actor) throw new Error("forbidden");
          return actor;
        },
      }));
      vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
      vi.doMock("server-only", () => ({}));
    });
    afterEach(() => {
      vi.doUnmock("@/core/auth/dal");
      vi.doUnmock("next/cache");
      vi.doUnmock("server-only");
    });
    const scopesOf = async (characterId: number) =>
      (await db().select({ scopes: schema.esiTokens.scopes }).from(schema.esiTokens).where(sql`character_id = ${characterId}`))[0].scopes.sort();

    it("switches both scopes off and on together, in Keystar only", async () => {
      const { setMarketAccess } = await import("@/app/(app)/market/actions");
      actor = { id: userB, characterIds: [2, 3] };
      expect(await market.enabledCharacterIds([2, 3])).toEqual([2]);

      expect(await setMarketAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([]);
      expect((await market.getMarketAccess(userB))[0]).toMatchObject({ characterId: 2, granted: false, partial: false, switchedOff: true, hasData: true });
      // The stored orders stay, but the page no longer reads the character.
      expect(await market.enabledCharacterIds([2, 3])).toEqual([]);
      expect(await market.getMarketCoverage([2, 3])).toMatchObject({ tracked: 0, notEnabled: 2 });

      expect(await setMarketAccess(2, true)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([...MARKET_SCOPES].sort());
      expect(await market.getMarketCoverage([2, 3])).toMatchObject({ tracked: 1, notEnabled: 1 });

      // A token that never held the scopes needs the EVE login.
      expect(await setMarketAccess(3, true)).toEqual({ ok: false, error: "notHeld" });
    });

    it("keeps the structure scope while industry access uses it", async () => {
      const { deleteMarketData, setMarketAccess } = await import("@/app/(app)/market/actions");
      actor = { id: userB, characterIds: [2, 3] };
      await db().update(schema.esiTokens).set({ scopes: [MARKET_ORDERS_SCOPE, ...INDUSTRY_SCOPES] }).where(sql`character_id = 2`);

      // Market off: industry still names its structures.
      expect(await setMarketAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([...INDUSTRY_SCOPES].sort());
      expect(await industry.enabledCharacterIds([2])).toEqual([2]);
      expect((await market.getMarketAccess(userB))[0]).toMatchObject({ granted: false, partial: false, switchedOff: true });
      // The structure scope still held doesn't keep the market orders from being deleted.
      expect(await deleteMarketData(2)).toEqual({ ok: true });
      expect((await db().select().from(schema.marketOrders)).map((o) => o.orderId)).toEqual([1]);

      // And back on without a login: the structure scope was never switched off.
      expect(await setMarketAccess(2, true)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([MARKET_ORDERS_SCOPE, ...INDUSTRY_SCOPES].sort());

      // With industry off, switching market off takes the structure scope too.
      await db()
        .update(schema.esiTokens)
        .set({ scopes: [...MARKET_SCOPES], disabledScopes: [INDUSTRY_JOBS_SCOPE] })
        .where(sql`character_id = 2`);
      expect(await setMarketAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([]);
    });

    it("refuses a token holding only one scope rather than enabling half", async () => {
      const { setMarketAccess } = await import("@/app/(app)/market/actions");
      actor = { id: userB, characterIds: [2, 3] };
      await db().update(schema.esiTokens).set({ scopes: [MARKET_ORDERS_SCOPE] }).where(sql`character_id = 2`);
      expect(await setMarketAccess(2, true)).toEqual({ ok: false, error: "notHeld" });
      expect((await market.getMarketAccess(userB))[0]).toMatchObject({ granted: false, partial: true, switchedOff: false });
      expect(await market.enabledCharacterIds([2])).toEqual([]);
      expect(await setMarketAccess(2, false)).toEqual({ ok: true });
      expect(await scopesOf(2)).toEqual([]);
      // A structure scope industry access left behind alone is not market access.
      await db().update(schema.esiTokens).set({ scopes: [...INDUSTRY_SCOPES], disabledScopes: [] }).where(sql`character_id = 2`);
      expect((await market.getMarketAccess(userB))[0]).toMatchObject({ granted: false, partial: false, switchedOff: false });
    });

    it("checks the permission and the owner, also against the database", async () => {
      const { deleteMarketData, setMarketAccess } = await import("@/app/(app)/market/actions");
      actor = null;
      expect(await setMarketAccess(2, false)).toEqual({ ok: false, error: "forbidden" });
      expect(await deleteMarketData(2)).toEqual({ ok: false, error: "forbidden" });
      actor = { id: userB, characterIds: [3] };
      expect(await setMarketAccess(2, false)).toEqual({ ok: false, error: "notOwned" });
      expect(await deleteMarketData(2)).toEqual({ ok: false, error: "notOwned" });
      // The session's character list is stale: character 1 belongs to Alpha, not Bravo.
      actor = { id: userB, characterIds: [1] };
      expect(await setMarketAccess(1, false)).toEqual({ ok: false, error: "notOwned" });
      expect(await deleteMarketData(1)).toEqual({ ok: false, error: "notOwned" });
      expect(await scopesOf(1)).toEqual([...MARKET_SCOPES].sort());
      expect((await db().select().from(schema.marketOrders)).map((o) => o.orderId).sort()).toEqual([1, 2]);
    });

    it("deletes stored orders only once access is off", async () => {
      const { deleteMarketData, setMarketAccess } = await import("@/app/(app)/market/actions");
      actor = { id: userB, characterIds: [2, 3] };
      await db().insert(schema.esiCache).values(
        ["2:GET /characters/2/orders", "2:GET /characters/2/orders/history", "2:GET /characters/2/roles"].map((key) => ({ key, body: [] })),
      );
      expect(await deleteMarketData(2)).toEqual({ ok: false, error: "stillEnabled" });
      expect(await setMarketAccess(2, false)).toEqual({ ok: true });
      expect(await deleteMarketData(2)).toEqual({ ok: true });
      expect((await db().select().from(schema.marketOrders)).map((o) => o.orderId)).toEqual([1]);
      // The cached copies of the orders go too; other cached responses stay.
      expect((await db().select().from(schema.esiCache)).map((r) => r.key)).toEqual(["2:GET /characters/2/roles"]);
      expect((await market.getMarketAccess(userB))[0]).toMatchObject({ characterId: 2, hasData: false });
    });

    it("syncs open and closed orders, and notices orders that left the market", async () => {
      const { characterMarketOrdersJob } = await import("@/modules/market/jobs");
      await db().delete(schema.marketOrders);
      await db().insert(schema.eveTypes).values({ typeId: 34, name: "Tritanium", groupId: 462 });
      await db().insert(schema.eveEntities).values({ id: 10000002, name: "The Forge", category: "region" });
      const issued = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const esiOrder = (orderId: number, extra: Record<string, unknown> = {}) => ({
        order_id: orderId, type_id: 34, region_id: 10000002, location_id: 60003760, is_corporation: false, price: 5,
        volume_total: 100, volume_remain: 40, range: "region", duration: 90, issued, ...extra,
      });
      let open: unknown[] = [esiOrder(900), esiOrder(901, { is_buy_order: true, range: "station", escrow: 200, min_volume: 1 })];
      let history: unknown[] = [esiOrder(902, { state: "cancelled", volume_remain: 70 })];
      let requests = 0;
      const esi = new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        maxRetries: 0,
        fetchImpl: (async (url: string) => {
          const path = new URL(String(url)).pathname;
          const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
          if (/\/orders$/.test(path)) {
            requests++;
            return reply(open);
          }
          if (/\/orders\/history$/.test(path)) return reply(history);
          if (/\/universe\/stations\//.test(path)) return reply({ name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant", system_id: 30000180, type_id: 52678 });
          return reply([]);
        }) as typeof fetch,
      });
      const ctx = { jobId: 1, ownerType: "character" as const, ownerId: 2, characterId: 2, esi, db: db(), log: undefined as never, meta: {} };
      const stored = async () =>
        Object.fromEntries((await db().select().from(schema.marketOrders)).map((o) => [o.orderId, o] as const));

      expect((await characterMarketOrdersJob.run(ctx))?.summary).toBe("2 open orders, 3 listed");
      let rows = await stored();
      expect(rows[900]).toMatchObject({ state: "open", isBuyOrder: false, volumeRemain: 40, closedAt: null });
      expect(rows[901]).toMatchObject({ state: "open", isBuyOrder: true, range: "station", escrow: 200 });
      expect(rows[902]).toMatchObject({ state: "cancelled", volumeRemain: 70, closedAt: null });

      // The page reads them, named, with the summary of what is open.
      const scope = { ownCharacterIds: [2] };
      const page = await market.getMarketOrders(parseMarketFilters({ view: "all" }), scope, { limit: 10, offset: 0 });
      expect(page.total).toBe(3);
      expect(page.orders[0]).toMatchObject({ typeName: "Tritanium", locationName: "Jita IV - Moon 4 - Caldari Navy Assembly Plant", systemName: "Osmon", regionName: "The Forge" });
      expect(page.orders.map((o) => o.state)).toEqual(["open", "open", "cancelled"]);
      expect((await market.getMarketOrders(parseMarketFilters({ side: "buy" }), scope, { limit: 10, offset: 0 })).orders.map((o) => o.orderId)).toEqual([901]);
      expect(await market.getMarketSummary(parseMarketFilters({ view: "closed" }), scope, new Date())).toMatchObject({
        sellOrders: 1,
        sellValue: 200,
        buyOrders: 1,
        buyValue: 200,
        escrow: 200,
        expiringSoon: 0,
        byLocation: [{ locationId: 60003760, orders: 2, value: 400, regionName: "The Forge" }],
      });

      // The buy order is gone from the market, the sell order was repriced; the history hasn't caught up yet.
      open = [esiOrder(900, { price: 4.9, volume_remain: 30 })];
      expect((await characterMarketOrdersJob.run(ctx))?.summary).toBe("1 open order, 2 listed");
      rows = await stored();
      expect(rows[900]).toMatchObject({ state: "open", price: 4.9, volumeRemain: 30 });
      expect(rows[901].state).toBe("closed");
      const noticed = rows[901].closedAt;
      expect(noticed).toBeInstanceOf(Date);

      // Now the history has it (filled), while a stale open list still shows the cancelled one: the history wins.
      history = [esiOrder(902, { state: "cancelled", volume_remain: 70 }), esiOrder(901, { is_buy_order: true, range: "station", state: "expired", volume_remain: 0 })];
      open = [esiOrder(900, { price: 4.9, volume_remain: 30 }), esiOrder(902)];
      await characterMarketOrdersJob.run(ctx);
      rows = await stored();
      expect(rows[901]).toMatchObject({ state: "expired", volumeRemain: 0, closedAt: noticed });
      expect(rows[902]).toMatchObject({ state: "cancelled", volumeRemain: 70 });

      // Access off: a run claimed before the planner disables the schedule reads nothing from ESI.
      await db().update(schema.esiTokens).set({ scopes: [] }).where(sql`character_id = 2`);
      const before = requests;
      expect((await characterMarketOrdersJob.run(ctx))?.summary).toBe("Market access is switched off");
      expect(requests).toBe(before);
    });
  });

  describe("ESI answers \"not modified\"", async () => {
    const { INDUSTRY_SCOPES } = await import("@/modules/industry/module");
    type CachedEntry = import("@/core/esi/client").CachedEntry;
    let expires = new Date(0);
    let body: unknown = [];
    let requests = 0;
    // Serves `body` with ETag "v1", and 304 when the client already holds it.
    const esiFor = (pathPattern: RegExp) => {
      const store = new Map<string, CachedEntry>();
      return new EsiClient({
        baseUrl: "https://esi.test",
        userAgent: "t",
        compatibilityDate: "2026-08-18",
        tokenProvider: async () => "token",
        maxRetries: 0,
        cache: { get: async (k) => store.get(k) ?? null, set: async (k, e) => void store.set(k, e) },
        fetchImpl: (async (url: string, init?: RequestInit) => {
          if (!pathPattern.test(new URL(String(url)).pathname)) return new Response("{}", { status: 404 });
          requests++;
          const headers = { "content-type": "application/json", etag: '"v1"', expires: expires.toUTCString() };
          if ((init?.headers as Record<string, string>)["If-None-Match"] === '"v1"') return new Response(null, { status: 304, headers });
          return new Response(JSON.stringify(body), { status: 200, headers });
        }) as typeof fetch,
      });
    };
    const ctx = (esi: InstanceType<typeof EsiClient>, ownerType: "global" | "character" | "corporation", ownerId: number, characterId: number | null) =>
      ({ jobId: 1, ownerType, ownerId, characterId, esi, db: db(), log: undefined as never, meta: {} });

    beforeEach(async () => {
      expires = new Date(0);
      requests = 0;
      // Everything the jobs would look up is known, so they make no other requests.
      await db().insert(schema.eveEntities).values([1, 2].map((id) => ({ id, name: `Pilot ${id}`, category: "character" })));
      await db().insert(schema.eveTypes).values({ typeId: 787, name: "Blueprint", groupId: 462 });
      await db().insert(schema.industryLocations).values({ locationId: 60003760, kind: "station", name: "Station", resolvedAt: new Date() });
      await db().insert(schema.esiTokens).values({ characterId: 2, refreshTokenEnc: "x", scopes: [...INDUSTRY_SCOPES] });
    });

    it("stores industry jobs again that are missing although ESI reports the list unchanged", async () => {
      const { characterIndustryJobsJob } = await import("@/modules/industry/jobs");
      body = [{ job_id: 900, installer_id: 2, facility_id: 60003760, station_id: 60003760, activity_id: 1, blueprint_id: 5,
        blueprint_type_id: 787, blueprint_location_id: 60003760, output_location_id: 60003760, runs: 2, cost: 10, duration: 3600,
        status: "active", start_date: new Date().toISOString(), end_date: new Date(Date.now() + 3600_000).toISOString() }];
      const esi = esiFor(/\/industry\/jobs$/);
      const jobIds = async () => (await db().select().from(schema.industryJobs)).map((j) => j.jobId);
      expect((await characterIndustryJobsJob.run(ctx(esi, "character", 2, 2)))?.summary).toBe("1 running job, 1 listed");
      expect(await jobIds()).toEqual([900]);

      // The stored jobs are gone (a failed write, or an unlink and relink) while the cached ETag stays: ESI answers 304.
      await db().delete(schema.industryJobs);
      expect((await characterIndustryJobsJob.run(ctx(esi, "character", 2, 2)))?.summary).toBe("1 running job, 1 listed (unchanged)");
      expect(await jobIds()).toEqual([900]);
      expect(requests).toBe(2);

      // The same for a run served from Keystar's own cache before Expires.
      expires = new Date(Date.now() + 300_000);
      await characterIndustryJobsJob.run(ctx(esi, "character", 2, 2));
      await db().delete(schema.industryJobs);
      expect((await characterIndustryJobsJob.run(ctx(esi, "character", 2, 2)))?.summary).toContain("(unchanged)");
      expect(requests).toBe(3);
      expect(await jobIds()).toEqual([900]);
    });

    it("brings the corporation roster up to date although ESI reports the member list unchanged", async () => {
      const { corporationMembersJob } = await import("@/core/sync/core-jobs");
      body = [1, 2, 9];
      const esi = esiFor(/\/corporations\/100\/members$/);
      const roster = async () =>
        (await db().select().from(schema.corporationMembers)).map((m) => m.characterId).sort((a, b) => a - b);
      await corporationMembersJob.run(ctx(esi, "corporation", 100, 1));
      expect(await roster()).toEqual([1, 2, 9]);
      const [nine] = await db().select().from(schema.corporationMembers).where(sql`character_id = 9`);

      // A write that never landed: the table holds an older roster, and ESI answers 304.
      await db().delete(schema.corporationMembers).where(sql`character_id = 2`);
      await db().insert(schema.corporationMembers).values({ corporationId: 100, characterId: 50 });
      expect((await corporationMembersJob.run(ctx(esi, "corporation", 100, 1)))?.summary).toBe("3 members");
      expect(await roster()).toEqual([1, 2, 9]);
      expect(requests).toBe(2);
      // Members that stayed are left alone.
      expect((await db().select().from(schema.corporationMembers).where(sql`character_id = 9`))[0]).toEqual(nine);

      body = [];
      await db().delete(schema.esiCache);
      const fresh = esiFor(/\/corporations\/100\/members$/);
      expect((await corporationMembersJob.run(ctx(fresh, "corporation", 100, 1)))?.summary).toBe("0 members");
      expect(await roster()).toEqual([]);
    });

    it("forgets a character's cached ESI responses when it changes hands", async () => {
      const { detachTransferredCharacter } = await import("@/core/auth/provision");
      await db().insert(schema.esiCache).values(
        ["2:GET /characters/2/industry/jobs", "2:GET /characters/2/roles", "21:GET /characters/21/roles", "0:GET /status"].map((key) => ({
          key,
          body: {},
          expiresAt: new Date(Date.now() + 60_000),
        })),
      );
      await db().transaction((tx) => detachTransferredCharacter(tx, 2, userB));
      expect((await db().select().from(schema.esiCache)).map((r) => r.key).sort()).toEqual(["0:GET /status", "21:GET /characters/21/roles"]);
    });

    it("purges cache entries without an expiry once they are a week old", async () => {
      const { housekeepingJob } = await import("@/core/sync/core-jobs");
      const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
      await db().insert(schema.esiCache).values([
        { key: "0:GET /old-no-expiry", body: {}, expiresAt: null, updatedAt: daysAgo(8) },
        { key: "0:GET /new-no-expiry", body: {}, expiresAt: null, updatedAt: daysAgo(1) },
        { key: "0:GET /expired", body: {}, expiresAt: daysAgo(8) },
        { key: "0:GET /fresh", body: {}, expiresAt: daysAgo(1) },
      ]);
      await housekeepingJob.run(ctx(esiFor(/^$/), "global", 0, null));
      expect((await db().select().from(schema.esiCache)).map((r) => r.key).sort()).toEqual(["0:GET /fresh", "0:GET /new-no-expiry"]);
    });
  });

  describe("sync scheduler", () => {
    const job = (run: () => Promise<void>) => ({
      key: "test.job",
      label: () => "Test",
      module: "test",
      owner: "character" as const,
      requiredScopes: ["scope.a"],
      intervalSeconds: 600,
      run: async () => {
        await run();
        return { summary: "done" };
      },
    });
    const esi = new EsiClient({ baseUrl: "https://esi.invalid", userAgent: "t", compatibilityDate: "2026-08-18" });

    beforeEach(async () => {
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: "x", scopes: ["scope.a", "scope.b"] },
        { characterId: 2, refreshTokenEnc: "x", scopes: ["scope.b"] },
        { characterId: 3, refreshTokenEnc: "x", scopes: ["scope.a"], status: "invalid" },
      ]);
    });

    it("plans rows only for active tokens with the scope and disables stale ones", async () => {
      const def = job(async () => {});
      await scheduler.planJobs([def]);
      let rows = await db().select().from(schema.syncJobs);
      expect(rows.filter((r) => r.enabled).map((r) => r.ownerId)).toEqual([1]);

      await db().execute(sql`UPDATE esi_tokens SET status = 'invalid' WHERE character_id = 1`);
      await scheduler.planJobs([def]);
      rows = await db().select().from(schema.syncJobs);
      expect(rows.every((r) => !r.enabled)).toBe(true);
    });

    it("pauses character jobs while the account is disabled", async () => {
      const def = job(async () => {});
      const enabledOwners = async () =>
        (await db().select().from(schema.syncJobs)).filter((r) => r.enabled).map((r) => r.ownerId);
      await scheduler.planJobs([def]);
      expect(await enabledOwners()).toEqual([1]);

      await db().execute(sql`UPDATE users SET is_disabled = true WHERE id = ${userA}`);
      await scheduler.planJobs([def]);
      expect(await enabledOwners()).toEqual([]);

      await db().execute(sql`UPDATE users SET is_disabled = false WHERE id = ${userA}`);
      await scheduler.planJobs([def]);
      expect(await enabledOwners()).toEqual([1]);
    });

    it("claims due jobs exactly once and records success", async () => {
      const def = job(async () => {});
      await scheduler.planJobs([def]);
      const first = await scheduler.claimDueJobs("w1", [def.key], 10);
      const second = await scheduler.claimDueJobs("w2", [def.key], 10);
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);

      await scheduler.executeJob(first[0], def, { esi });
      const [row] = await db().select().from(schema.syncJobs);
      expect(row.lastStatus).toBe("ok");
      expect(row.lastSummary).toBe("done");
      expect(row.lockedBy).toBeNull();
      expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
    });

    it("backs off exponentially on failure", async () => {
      const def = job(async () => {
        throw new Error("boom");
      });
      await scheduler.planJobs([def]);
      const [claimed] = await scheduler.claimDueJobs("w1", [def.key], 10);
      await scheduler.executeJob(claimed, def, { esi });
      const [row] = await db().select().from(schema.syncJobs);
      expect(row.lastStatus).toBe("error");
      expect(row.lastError).toBe("boom");
      expect(row.consecutiveFailures).toBe(1);
      expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    });

    it("keeps a trigger that arrives while the job runs", async () => {
      let triggered = false;
      const def = job(async () => {
        await scheduler.triggerJobs({ jobKey: "test.job" });
        triggered = true;
      });
      await scheduler.planJobs([def]);
      const [claimed] = await scheduler.claimDueJobs("w1", [def.key], 10);
      await scheduler.executeJob(claimed, def, { esi });
      expect(triggered).toBe(true);
      const [row] = await db().select().from(schema.syncJobs);
      expect(row.lastStatus).toBe("ok");
      expect(row.nextRunAt.getTime()).toBeLessThan(Date.now() + 5_000);

      // Without a trigger the interval applies again.
      const [again] = await scheduler.claimDueJobs("w1", [def.key], 10);
      await scheduler.executeJob(again, job(async () => {}), { esi });
      const [after] = await db().select().from(schema.syncJobs);
      expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
    });

    it("lets any corporation member serve role-less corporation jobs, role holders first", async () => {
      await db().insert(schema.characterCorpRoles).values([
        { characterId: 1, roles: [] },
        { characterId: 2, roles: ["Director"] },
      ]);
      await db().execute(sql`UPDATE esi_tokens SET scopes = ARRAY['scope.a'], status = 'active'`);
      const base = { ...job(async () => {}), owner: "corporation" as const };
      expect(await scheduler.corporationCandidates(db(), 100, base)).toEqual([2, 3]);
      expect(await scheduler.corporationCandidates(db(), 100, { ...base, anyCorpMember: true })).toEqual([2, 1, 3]);
    });

    it("keeps disabled accounts' characters out of corporation jobs", async () => {
      const { setSetting } = await import("@/core/settings");
      await setSetting("corp.homeCorporationId", 100);
      await db().insert(schema.characterCorpRoles).values({ characterId: 2, roles: ["Director"] });
      await db().execute(sql`UPDATE esi_tokens SET scopes = ARRAY['scope.a'], status = 'active'`);
      const def = { ...job(async () => {}), owner: "corporation" as const, anyCorpMember: true };
      const corpJobEnabled = async () => {
        await scheduler.planJobs([def]);
        return (await db().select().from(schema.syncJobs)).some((r) => r.ownerId === 100 && r.enabled);
      };

      await db().execute(sql`UPDATE users SET is_disabled = true WHERE id = ${userB}`);
      expect(await scheduler.corporationCandidates(db(), 100, def)).toEqual([1]);
      expect(await corpJobEnabled()).toBe(true);

      await db().execute(sql`UPDATE users SET is_disabled = true WHERE id = ${userA}`);
      expect(await scheduler.corporationCandidates(db(), 100, def)).toEqual([]);
      expect(await corpJobEnabled()).toBe(false);
    });
  });

  describe("member audit", async () => {
    const audit = await import("@/core/member-audit");
    const { parseMemberAuditParams } = await import("@/core/member-audit-filters");
    const required = ["scope.a", "scope.b"];
    const params = (sp: Record<string, string> = {}) => parseMemberAuditParams(sp);
    const ids = async (sp: Record<string, string> = {}) =>
      (await audit.getMemberAuditPage(100, required, params(sp))).map((r) => r.id);

    beforeEach(async () => {
      const { encryptToken } = await import("@/core/crypto");
      // Roster: Alpha, Bravo, the unregistered Outsider and a pilot without a known name. Bravo Alt is missing from it.
      await db().insert(schema.corporationMembers).values([1, 2, 9, 10].map((characterId) => ({ corporationId: 100, characterId })));
      await db().insert(schema.esiTokens).values([
        { characterId: 1, refreshTokenEnc: encryptToken("r"), scopes: required },
        { characterId: 2, refreshTokenEnc: encryptToken("r"), scopes: ["scope.a"] },
      ]);
    });

    it("counts the roster against registered characters and ESI access", async () => {
      expect(await audit.getMemberAuditStats(100, required, params())).toEqual({
        rosterKnown: true,
        roster: 4,
        registered: 2,
        unregistered: 2,
        esiTrouble: 2,
        matched: 5,
        accountName: null,
      });
    });

    it("counts only revoked tokens while no scope is required of every member", async () => {
      // Bravo Alt has no token and Bravo only some scopes: fine while every scope is opt-in.
      expect((await audit.getMemberAuditStats(100, [], params())).esiTrouble).toBe(0);
      await db().update(schema.esiTokens).set({ status: "invalid" }).where(sql`character_id = 2`);
      expect((await audit.getMemberAuditStats(100, [], params())).esiTrouble).toBe(1);
      expect((await audit.getMemberAuditPage(100, [], params({ filter: "esi" }))).map((r) => r.id)).toEqual(["2"]);
    });

    it("lists registered characters first, then by name", async () => {
      expect(await ids()).toEqual(["1", "2", "3", "9", "10"]);
      const [bravo] = await audit.getMemberAuditPage(100, required, params({ q: "Bravo", filter: "registered" }));
      expect(bravo).toMatchObject({ name: "Bravo", inRoster: true, registered: true, mainName: "Bravo", scopes: ["scope.a"] });
    });

    it("sorts names without regard to case", async () => {
      await db().insert(schema.corporationMembers).values([11, 12, 13].map((characterId) => ({ corporationId: 100, characterId })));
      await db().insert(schema.eveEntities).values([
        { id: 11, name: "bravo", category: "character" },
        { id: 12, name: "alpha", category: "character" },
        { id: 13, name: "ALPHA", category: "character" },
      ]);
      // Byte order would put "ALPHA" and "Outsider" before every lowercase name.
      expect(await ids({ filter: "unregistered" })).toEqual(["13", "12", "11", "9", "10"]);
    });

    it("filters like the stat tiles count", async () => {
      expect(await ids({ filter: "roster" })).toEqual(["1", "2", "9", "10"]);
      expect(await ids({ filter: "registered" })).toEqual(["1", "2"]);
      expect(await ids({ filter: "unregistered" })).toEqual(["9", "10"]);
      expect(await ids({ filter: "esi" })).toEqual(["2", "3"]);
    });

    it("searches character and account names, exact IDs and literal wildcards", async () => {
      expect(await ids({ q: "alt" })).toEqual(["3"]);
      // Bravo Alt also matches through its account's main.
      expect(await ids({ q: "bravo" })).toEqual(["2", "3"]);
      expect(await ids({ q: "bravo", filter: "registered" })).toEqual(["2"]);
      expect(await ids({ q: "10" })).toEqual(["10"]);
      expect(await ids({ q: "%" })).toEqual([]);
      expect((await audit.getMemberAuditStats(100, required, params({ q: "bravo", filter: "esi" }))).matched).toBe(2);
    });

    it("limits the view to one account's characters, not every name that contains its main", async () => {
      expect(await ids({ account: userB })).toEqual(["2", "3"]);
      expect(await ids({ account: userB, filter: "esi" })).toEqual(["2", "3"]);
      // Alpha's account has no ESI trouble even though a search for its name could match other characters.
      expect(await ids({ account: userA, filter: "esi" })).toEqual([]);
      const stats = await audit.getMemberAuditStats(100, required, params({ account: userB }));
      expect(stats).toMatchObject({ matched: 2, accountName: "Bravo", roster: 4 });
    });

    it("counts every registered character while the roster is unknown", async () => {
      await db().execute(sql`TRUNCATE corporation_members`);
      const stats = await audit.getMemberAuditStats(100, required, params({ filter: "registered" }));
      expect(stats).toMatchObject({ rosterKnown: false, roster: 0, registered: 3, unregistered: 0, matched: 3 });
    });
  });

  describe("name resolver", async () => {
    const { ensureNames } = await import("@/core/eve/resolver");
    const { EsiError, getEsi } = await import("@/core/esi");
    const reply = <T,>(data: T) => ({ data, status: 200, expiresAt: null, pages: 1, fromCache: false, notModified: false, lastModified: null });
    const names = async () =>
      (await db().select().from(schema.eveEntities)).map((e) => e.id).sort((a, b) => a - b);

    it("bisects a batch that ESI rejects for one invalid id", async () => {
      const BAD = 666;
      const postSpy = vi.spyOn(getEsi(), "post").mockImplementation(async (path: string, ids: unknown) => {
        const chunk = ids as number[];
        if (chunk.includes(BAD)) throw new EsiError(`ESI POST ${path} failed`, 404, path);
        return reply(chunk.map((id) => ({ id, name: `Pilot ${id}`, category: "character" })));
      });
      try {
        await ensureNames([11, 12, BAD, 13]);
        expect(await names()).toEqual([9, 11, 12, 13]);
        // [11,12,666,13] → [11,12] ok, [666,13] → [666] invalid, [13] ok.
        expect(postSpy).toHaveBeenCalledTimes(5);
      } finally {
        postSpy.mockRestore();
      }
    });

    it.each([
      ["a server error", new EsiError("ESI POST /universe/names failed: HTTP 503", 503, "/universe/names")],
      ["a network error", new EsiError("ESI request failed: timeout", 0, "/universe/names")],
    ])("fails on %s instead of bisecting", async (_, error) => {
      const postSpy = vi.spyOn(getEsi(), "post").mockRejectedValue(error);
      try {
        await expect(ensureNames([11, 12, 13, 14])).rejects.toBe(error);
        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(await names()).toEqual([9]);
      } finally {
        postSpy.mockRestore();
      }
    });
  });
});
