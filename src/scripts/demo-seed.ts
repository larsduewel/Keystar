/**
 * Seeds a self-contained demo corporation (users of every role, ~120 days of
 * mining, two moon refineries, prices, a killboard, past fleets, threat-intel
 * scans, a month of gate camps, a mining P&L, skill queues, industry jobs and market orders) so Keystar can be explored without EVE SSO
 * credentials. Requires KEYSTAR_DEMO_MODE=true to log in as demo users.
 *
 *   pnpm demo:seed            # refuses if real (non-demo) users exist
 *   pnpm demo:seed --force    # wipes ALL Keystar data first
 */
import { sql } from "drizzle-orm";
import {
  auditLog,
  characterCorpRoles,
  characters,
  closeDb,
  corporationMembers,
  esiTokens,
  eveCorporations,
  eveEntities,
  eveGroups,
  eveSystems,
  eveTypes,
  getDb,
  marketPrices,
  miningCharacterLedger,
  miningObserverLedger,
  miningObservers,
  syncJobs,
  typeValueHistory,
  typeValues,
  users,
  workerHeartbeats,
} from "@/core/db";
import { encryptToken } from "@/core/crypto";
import { env } from "@/core/env";
import { classifyOre, type OreClass } from "@/core/eve/ore";
import { corporationScopes } from "@/core/modules/registry";
import type { Role } from "@/core/rbac/roles";
import { setSetting } from "@/core/settings";
import { KEYSTAR_VERSION } from "@/core/version";
import { mulberry32 } from "@/lib/random";
import { FLEET_SCOPE } from "@/modules/fleet/logic";
import { MINING_LEDGER_SCOPE } from "@/modules/mining/module";
import { generateSituationReport } from "@/modules/killboard/report/generate";
import { runMigrations } from "@/scripts/migrate";
import staticData from "./demo-data/eve-static.json";
import { seedCorpWallet } from "./demo-data/corp-wallet";
import { seedFleets } from "./demo-data/fleet";
import { seedGatecheck } from "./demo-data/gatecheck";
import { seedIndustry } from "./demo-data/industry";
import { seedMarket } from "./demo-data/market";
import { seedIntel } from "./demo-data/intel";
import { seedKillboard } from "./demo-data/killboard";
import { seedMiningPnl } from "./demo-data/pnl";
import { seedSkills } from "./demo-data/skills";
import { seedMail } from "./demo-data/social";

const DEMO_CHARACTER_BASE = 2_120_000_000;
const HOME_CORP = { corporationId: 98_765_432, name: "Keystar Industries", ticker: "KSTR" };
const OTHER_CORP = { corporationId: 98_111_222, name: "Frontier Haulage", ticker: "FRHL" };
const FOREIGN_CORP = { corporationId: 98_333_444, name: "Rogue Drillers Inc.", ticker: "RDI" };
const DAYS = 120;

// Deterministic PRNG so every seed produces the same demo.
const rand = mulberry32(20261002);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

type Profile = "highsec" | "moon" | "ice" | "gas" | "lowsec";

interface DemoChar {
  name: string;
  profile: Profile;
  activity: number;
  scale: number;
  corp?: typeof HOME_CORP;
}
interface DemoUser {
  role: Role;
  chars: DemoChar[];
}

const DEMO_USERS: DemoUser[] = [
  {
    role: "admin",
    chars: [
      { name: "Aria Vexmoor", profile: "moon", activity: 0.55, scale: 1.2 },
      { name: "Aria Ironveil", profile: "moon", activity: 0.6, scale: 1.1 },
      { name: "Kestrel Vexmoor", profile: "ice", activity: 0.35, scale: 1 },
    ],
  },
  {
    role: "director",
    chars: [
      { name: "Tovan Rhask", profile: "highsec", activity: 0.45, scale: 1 },
      { name: "Mira Rhask", profile: "moon", activity: 0.5, scale: 0.9 },
    ],
  },
  {
    role: "contributor",
    chars: [
      { name: "Selene Okaru", profile: "lowsec", activity: 0.4, scale: 1.1 },
      { name: "Daiko Okaru", profile: "gas", activity: 0.35, scale: 1 },
    ],
  },
  { role: "viewer", chars: [{ name: "Brann Holloway", profile: "highsec", activity: 0.25, scale: 0.7 }] },
  {
    role: "member",
    chars: [
      { name: "Ishani Calder", profile: "moon", activity: 0.7, scale: 1.3 },
      { name: "Ishani Deepcore", profile: "moon", activity: 0.65, scale: 1.2 },
    ],
  },
  { role: "member", chars: [{ name: "Jorek Taln", profile: "highsec", activity: 0.6, scale: 0.9 }] },
  {
    role: "member",
    chars: [
      { name: "Nyx Ashgrove", profile: "ice", activity: 0.5, scale: 1 },
      { name: "Nyx Frostline", profile: "ice", activity: 0.45, scale: 0.9 },
    ],
  },
  { role: "member", chars: [{ name: "Quill Merrow", profile: "highsec", activity: 0.3, scale: 0.6 }] },
  { role: "member", chars: [{ name: "Rhea Solenne", profile: "moon", activity: 0.55, scale: 1 }] },
  {
    role: "member",
    chars: [
      { name: "Vasko Drift", profile: "lowsec", activity: 0.5, scale: 1.2 },
      { name: "Vasko Hollowpoint", profile: "gas", activity: 0.3, scale: 0.8 },
    ],
  },
  { role: "member", chars: [{ name: "Zahra Imren", profile: "highsec", activity: 0.65, scale: 1 }] },
  { role: "member", chars: [{ name: "Pell Ostrava", profile: "moon", activity: 0.4, scale: 0.8 }] },
  { role: "guest", chars: [{ name: "Corin Vale", profile: "highsec", activity: 0.3, scale: 0.6, corp: OTHER_CORP }] },
];

/** Miners at our refineries who never registered with Keystar. */
const FOREIGN_MINERS = [
  { name: "Grim Halvard", corp: FOREIGN_CORP },
  { name: "Lys Teodor", corp: FOREIGN_CORP },
  { name: "Hollis Brande", corp: HOME_CORP },
];
const UNREGISTERED_MEMBERS = ["Hollis Brande", "Tamsin Rook", "Odo Varga"];

const SYSTEMS: Record<Profile, string[]> = {
  highsec: ["Osmon", "Sirseshin", "Ansila", "Hek", "Sobaseki"],
  moon: ["Osmon", "Sirseshin"],
  ice: ["Rens", "Hek", "Ansila"],
  gas: ["Tama", "Amamake", "Hakonen"],
  lowsec: ["Tama", "Akora", "Reblier", "Vitrauze"],
};

const ORES: Record<Profile, string[]> = {
  highsec: ["Veldspar", "Veldspar II-Grade", "Scordite", "Scordite II-Grade", "Pyroxeres", "Plagioclase", "Omber", "Kernite"],
  lowsec: ["Jaspet", "Hemorphite", "Hedbergite", "Dark Ochre", "Gneiss", "Spodumain", "Crokite", "Bistot"],
  ice: ["Clear Icicle", "Glacial Mass", "Blue Ice", "White Glaze", "Glare Crust", "Dark Glitter"],
  gas: ["Fullerite-C50", "Fullerite-C60", "Fullerite-C320", "Golden Mykoserocin", "Viridian Mykoserocin"],
  moon: [],
};

const REFINERIES = [
  {
    observerId: 1_045_000_000_001,
    name: "Osmon - Keystar Athanor",
    system: "Osmon",
    offset: 0,
    ores: ["Zeolites", "Sylvite", "Cobaltite", "Euxenite", "Otavite", "Carnotite"],
  },
  {
    observerId: 1_045_000_000_002,
    name: "Sirseshin - Deep Tatara",
    system: "Sirseshin",
    offset: 7,
    ores: ["Bitumens", "Coesite", "Titanite", "Scheelite", "Sperrylite", "Xenotime"],
  },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const e = env();
  const force = process.argv.includes("--force");
  await runMigrations(e.DATABASE_URL);
  const db = getDb();

  const [{ count: realUsers }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM characters c WHERE c.user_id = users.id AND c.character_id >= ${DEMO_CHARACTER_BASE} AND c.character_id < ${DEMO_CHARACTER_BASE + 100000})`,
    );
  if (realUsers > 0 && !force) {
    console.error(`Refusing to seed: ${realUsers} non-demo user(s) exist. Re-run with --force to wipe ALL data.`);
    process.exit(1);
  }

  console.log("Clearing existing data…");
  await db.execute(sql`TRUNCATE users, characters, esi_tokens, sessions, audit_log, app_settings, character_corp_roles,
    corporation_members, eve_entities, eve_corporations, eve_groups, eve_types, eve_systems, market_prices, type_values,
    type_value_history, price_interest, esi_cache, sync_jobs, worker_heartbeats, mining_character_ledger, mining_observers,
    mining_observer_ledger, killmails, killmail_attackers, killboard_reports, fleets, fleet_members, fleet_trackers,
    eve_constellations, intel_scans, intel_scan_pilots, intel_pilots, intel_pilot_killmails, intel_queue, intel_contacts,
    intel_ai_notes, wallet_transactions, wallet_fees, mining_activity, mining_activity_coverage, mining_pnl_settings,
    mining_pnl_characters, mining_pnl_price_rules, mining_pnl_tx_overrides, mining_pnl_fee_overrides, mining_pnl_entries,
    corp_wallet_divisions, corp_wallet_balance_history, corp_wallet_journal, corp_wallet_transactions,
    corp_wallet_sync_state, mail_messages, mail_labels, mail_lists, skills_queue, skills_character_skills, skills_character, skills_type_attributes,
    industry_jobs, industry_locations, skills_implants, skills_implant_attributes, gatecheck_kills, gatecheck_feed, market_orders
    RESTART IDENTITY CASCADE`);

  // --- Static EVE data --------------------------------------------------
  await db.insert(eveGroups).values(staticData.groups);
  await db.insert(eveTypes).values(
    staticData.types.map((t) => ({
      typeId: t.typeId,
      name: t.name,
      groupId: t.groupId,
      volume: t.volume,
      portionSize: t.portionSize,
      marketGroupId: t.marketGroupId,
      compressedTypeId: t.compressedTypeId,
      published: true,
    })),
  );
  await db.insert(eveSystems).values(staticData.systems);
  await db.insert(eveEntities).values(staticData.systems.map((s) => ({ id: s.systemId, name: s.name, category: "solar_system" })));
  const typeByName = new Map(staticData.types.map((t) => [t.name, t]));
  const groupCategory = new Map(staticData.groups.map((g) => [g.groupId, g.categoryId]));
  const systemByName = new Map(staticData.systems.map((s) => [s.name, s.systemId]));

  for (const corp of [HOME_CORP, OTHER_CORP, FOREIGN_CORP]) {
    await db.insert(eveCorporations).values({ ...corp, memberCount: corp === HOME_CORP ? 24 : 9 });
    await db.insert(eveEntities).values({ id: corp.corporationId, name: corp.name, category: "corporation" });
  }

  // --- Users, characters, tokens ---------------------------------------
  let nextId = DEMO_CHARACTER_BASE + 1;
  const demoUserIds: Record<string, string> = {};
  const allChars: (DemoChar & { characterId: number; userId: string; role: Role })[] = [];
  const corpScopes = corporationScopes();
  // Characters whose token shares the mining ledger (opt-in): only they get a ledger sync.
  const sharesMining = new Set<number>();

  for (const [index, u] of DEMO_USERS.entries()) {
    const [user] = await db
      .insert(users)
      .values({ role: u.role, lastLoginAt: new Date(Date.now() - rand() * 6 * 86400_000) })
      .returning();
    if (!demoUserIds[u.role]) demoUserIds[u.role] = user.id;
    for (const [ci, c] of u.chars.entries()) {
      const characterId = nextId++;
      const corp = c.corp ?? HOME_CORP;
      await db.insert(characters).values({
        characterId,
        userId: user.id,
        name: c.name,
        corporationId: corp.corporationId,
        ownerHash: `demo-owner-${characterId}`,
        affiliationUpdatedAt: new Date(),
      });
      await db.insert(eveEntities).values({ id: characterId, name: c.name, category: "character" });
      if (ci === 0) await db.update(users).set({ mainCharacterId: characterId }).where(sql`${users.id} = ${user.id}`);

      const isLeadership = u.role === "admin" || u.role === "director";
      // Members share their mining ledger (opt-in); leadership mains also run fleets, so they have the fleet scope.
      let scopes = isLeadership && ci === 0 ? [...corpScopes, MINING_LEDGER_SCOPE, FLEET_SCOPE] : [MINING_LEDGER_SCOPE];
      let disabledScopes: string[] = [];
      let status: "active" | "invalid" = "active";
      let lastError: string | null = null;
      if (index === 5) {
        // A member who switched the mining ledger off: the token still holds it, the history stays until deleted.
        scopes = scopes.filter((s) => s !== MINING_LEDGER_SCOPE);
        disabledScopes = [MINING_LEDGER_SCOPE];
      }
      if (scopes.includes(MINING_LEDGER_SCOPE)) sharesMining.add(characterId);
      if (c.name === "Vasko Hollowpoint") {
        status = "invalid";
        lastError = "SSO token request failed: Invalid refresh token. Token missing/expired.";
      }
      await db.insert(esiTokens).values({
        characterId,
        refreshTokenEnc: encryptToken("demo-refresh-token"),
        scopes,
        disabledScopes,
        status,
        lastError,
        lastRefreshedAt: new Date(Date.now() - rand() * 3600_000),
      });
      if (isLeadership && ci === 0) {
        await db.insert(characterCorpRoles).values({
          characterId,
          roles: u.role === "admin" ? ["Director", "Accountant", "Station_Manager"] : ["Accountant"],
        });
      }
      allChars.push({ ...c, characterId, userId: user.id, role: u.role });
    }
  }

  const foreign = FOREIGN_MINERS.map((f) => ({ ...f, characterId: nextId++ }));
  for (const f of foreign) await db.insert(eveEntities).values({ id: f.characterId, name: f.name, category: "character" });
  const unregistered = UNREGISTERED_MEMBERS.map((name) => {
    const existing = foreign.find((f) => f.name === name);
    return { name, characterId: existing?.characterId ?? nextId++ };
  });
  for (const u of unregistered) {
    if (!foreign.some((f) => f.characterId === u.characterId)) {
      await db.insert(eveEntities).values({ id: u.characterId, name: u.name, category: "character" });
    }
  }
  await db.insert(corporationMembers).values([
    ...allChars.filter((c) => !c.corp).map((c) => ({ corporationId: HOME_CORP.corporationId, characterId: c.characterId })),
    ...unregistered.map((u) => ({ corporationId: HOME_CORP.corporationId, characterId: u.characterId })),
  ]);

  // --- Mining ledgers ----------------------------------------------------
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const personal = new Map<string, typeof miningCharacterLedger.$inferInsert>();
  const observer = new Map<string, typeof miningObserverLedger.$inferInsert>();

  const addPersonal = (characterId: number, date: string, systemId: number, typeId: number, quantity: number) => {
    const key = `${characterId}|${date}|${systemId}|${typeId}`;
    const row = personal.get(key);
    if (row) row.quantity = (row.quantity ?? 0) + quantity;
    else personal.set(key, { characterId, date, solarSystemId: systemId, typeId, quantity });
  };
  const addObserver = (observerId: number, characterId: number, corpId: number, date: string, typeId: number, quantity: number) => {
    const key = `${observerId}|${characterId}|${date}|${typeId}`;
    const row = observer.get(key);
    if (row) row.quantity = (row.quantity ?? 0) + quantity;
    else
      observer.set(key, {
        observerId,
        corporationId: HOME_CORP.corporationId,
        characterId,
        recordedCorporationId: corpId,
        date,
        typeId,
        quantity,
      });
  };

  /** Units for roughly `m3` cubic metres of a type. */
  const unitsFor = (typeName: string, m3: number) => {
    const t = typeByName.get(typeName)!;
    return Math.max(1, Math.round(m3 / (t.volume || 1)));
  };

  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(today.getTime() - d * 86400_000);
    const day = isoDay(date);
    const weekend = [0, 6].includes(date.getUTCDay());
    // Mining picked up over the last weeks (a growing alt corp).
    const growth = 0.75 + 0.5 * ((DAYS - d) / DAYS);

    for (const c of allChars) {
      if (rand() > c.activity * (weekend ? 1.25 : 0.9) * growth) continue;
      const m3 = (60_000 + rand() * 140_000) * c.scale;

      if (c.profile === "moon") {
        const ref = REFINERIES.find((r) => ((DAYS - d + r.offset) % 14) < 4);
        if (!ref) continue; // no chunk available today
        const systemId = systemByName.get(ref.system)!;
        const picks = [pick(ref.ores), pick(ref.ores)];
        for (const ore of picks) {
          const units = unitsFor(ore, m3 / picks.length);
          addPersonal(c.characterId, day, systemId, typeByName.get(ore)!.typeId, units);
          addObserver(ref.observerId, c.characterId, HOME_CORP.corporationId, day, typeByName.get(ore)!.typeId, units);
        }
      } else {
        const systemId = systemByName.get(pick(SYSTEMS[c.profile]))!;
        const kinds = 1 + Math.floor(rand() * 2);
        for (let k = 0; k < kinds; k++) {
          const ore = pick(ORES[c.profile]);
          const share = c.profile === "ice" ? 0.35 : c.profile === "gas" ? 0.04 : 1;
          addPersonal(c.characterId, day, systemId, typeByName.get(ore)!.typeId, unitsFor(ore, (m3 * share) / kinds));
        }
      }
    }

    // Non-registered miners show up only in refinery observers.
    for (const f of foreign) {
      const ref = REFINERIES.find((r) => ((DAYS - d + r.offset) % 14) < 4);
      if (!ref || rand() > 0.45) continue;
      const ore = pick(ref.ores);
      addObserver(ref.observerId, f.characterId, f.corp.corporationId, day, typeByName.get(ore)!.typeId, unitsFor(ore, 40_000 + rand() * 80_000));
    }
  }

  const personalRows = [...personal.values()];
  for (let i = 0; i < personalRows.length; i += 1000) await db.insert(miningCharacterLedger).values(personalRows.slice(i, i + 1000));
  const observerRows = [...observer.values()];
  for (let i = 0; i < observerRows.length; i += 1000) await db.insert(miningObserverLedger).values(observerRows.slice(i, i + 1000));
  for (const r of REFINERIES) {
    await db.insert(miningObservers).values({
      observerId: r.observerId,
      corporationId: HOME_CORP.corporationId,
      observerType: "structure",
      lastUpdated: isoDay(today),
      name: r.name,
      solarSystemId: systemByName.get(r.system)!,
      structureTypeId: 35835,
    });
  }

  // --- Prices with ~120 days of history ----------------------------------
  const sources = ["jita_buy", "jita_sell", "jita_split", "esi_average"] as const;
  const historyRows: (typeof typeValueHistory.$inferInsert)[] = [];
  const valueRows: (typeof typeValues.$inferInsert)[] = [];
  const marketRows: (typeof marketPrices.$inferInsert)[] = [];
  for (const t of staticData.types) {
    if (!t.price) continue;
    const cls: OreClass = classifyOre(t.groupId, groupCategory.get(t.groupId));
    const vol = cls.startsWith("moon") ? 0.025 : 0.015;
    let walk = 1;
    for (let d = DAYS - 1; d >= 0; d--) {
      walk *= 1 + (rand() - 0.5) * 2 * vol;
      walk = Math.min(1.4, Math.max(0.7, walk));
      const base = t.price * walk;
      const p = { jita_buy: base * 0.94, jita_sell: base * 1.05, jita_split: base * 0.995, esi_average: base };
      const day = isoDay(new Date(today.getTime() - d * 86400_000));
      for (const s of sources) historyRows.push({ typeId: t.typeId, source: s, date: day, unitPrice: p[s] });
      if (d === 0) {
        for (const s of sources) valueRows.push({ typeId: t.typeId, source: s, unitPrice: p[s], basis: "direct" });
        marketRows.push(
          { typeId: t.typeId, source: "jita_buy", price: p.jita_buy },
          { typeId: t.typeId, source: "jita_sell", price: p.jita_sell },
          { typeId: t.typeId, source: "esi_average", price: p.esi_average },
        );
      }
    }
  }
  for (let i = 0; i < historyRows.length; i += 2000) await db.insert(typeValueHistory).values(historyRows.slice(i, i + 2000));
  await db.insert(typeValues).values(valueRows);
  await db.insert(marketPrices).values(marketRows);

  // --- Mining P&L of the admin account (wallet import, costs, activity) ---
  const pnlChars = allChars.filter((c) => c.userId === demoUserIds.admin);
  const pnl = await seedMiningPnl(db, {
    userId: demoUserIds.admin,
    characters: pnlChars.map((c) => ({ characterId: c.characterId, name: c.name, profile: c.profile })),
    ledger: personalRows
      .filter((r) => pnlChars.some((c) => c.characterId === r.characterId))
      .map((r) => ({ characterId: r.characterId!, date: r.date!, typeId: r.typeId!, quantity: Number(r.quantity) })),
    types: new Map(staticData.types.map((t) => [t.typeId, { name: t.name, volume: t.volume, compressedTypeId: t.compressedTypeId ?? null }])),
    jitaBuy: new Map(valueRows.filter((v) => v.source === "jita_buy").map((v) => [v.typeId!, v.unitPrice!])),
    rand,
    now: new Date(),
  });

  // --- Corporation wallets ---------------------------------------------------
  const corpWallet = await seedCorpWallet(db, {
    corporationId: HOME_CORP.corporationId,
    members: allChars.filter((c) => (c.corp ?? HOME_CORP) === HOME_CORP).map((c) => c.characterId),
    rand,
    now: new Date(),
  });

  // --- Sync status, settings, audit --------------------------------------
  const now = Date.now();
  const jobRows: (typeof syncJobs.$inferInsert)[] = [
    { jobKey: "core.server-status", ownerType: "global", ownerId: 0, lastStatus: "ok", lastSummary: "31,842 pilots online" },
    { jobKey: "core.affiliations", ownerType: "global", ownerId: 0, lastStatus: "ok", lastSummary: `${allChars.length} characters checked, 0 changed corporation` },
    { jobKey: "core.market-prices", ownerType: "global", ownerId: 0, lastStatus: "ok", lastSummary: `Priced ${valueRows.length / 4} types` },
    { jobKey: "core.housekeeping", ownerType: "global", ownerId: 0, lastStatus: "ok", lastSummary: "Purged 2 sessions, 41 cache entries" },
    { jobKey: "core.corporation-members", ownerType: "corporation", ownerId: HOME_CORP.corporationId, lastStatus: "ok", lastSummary: `${allChars.length + 2} members` },
    { jobKey: "mining.corporation-observers", ownerType: "corporation", ownerId: HOME_CORP.corporationId, lastStatus: "ok", lastSummary: `2 observers, ${observerRows.length} entries` },
    {
      jobKey: "mining.corporation-structures",
      ownerType: "corporation",
      ownerId: HOME_CORP.corporationId,
      lastStatus: "error",
      lastError: "No linked character with Station_Manager role could access this data (ESI forbidden (missing scope or in-game role): /corporations/98765432/structures)",
      consecutiveFailures: 3,
    },
    ...allChars.filter((c) => sharesMining.has(c.characterId)).map((c) => ({
      jobKey: "mining.character-ledger",
      ownerType: "character" as const,
      ownerId: c.characterId,
      lastStatus: c.name === "Vasko Hollowpoint" ? ("error" as const) : ("ok" as const),
      lastError: c.name === "Vasko Hollowpoint" ? "Invalid refresh token. Token missing/expired." : null,
      consecutiveFailures: c.name === "Vasko Hollowpoint" ? 4 : 0,
      lastSummary: c.name === "Vasko Hollowpoint" ? null : `${10 + Math.floor(rand() * 40)} ledger entries`,
    })),
  ];
  await db.insert(syncJobs).values(
    jobRows.map((j) => ({
      ...j,
      lastRunAt: new Date(now - rand() * 900_000),
      lastSuccessAt: j.lastStatus === "ok" ? new Date(now - rand() * 900_000) : new Date(now - 3 * 3600_000),
      lastDurationMs: Math.round(150 + rand() * 2500),
      nextRunAt: new Date(now + rand() * 3600_000),
    })),
  );
  // The running version, so System Info doesn't report a worker/web version mismatch in demo mode.
  await db.insert(workerHeartbeats).values({ workerId: "demo-worker", version: KEYSTAR_VERSION, info: { demo: true } });

  // --- Killboard ----------------------------------------------------------
  const combatWeights: Record<string, number> = {
    "Selene Okaru": 9,
    "Vasko Drift": 8,
    "Tovan Rhask": 6,
    "Aria Vexmoor": 5,
    "Zahra Imren": 4,
    "Jorek Taln": 3,
    "Rhea Solenne": 2,
    "Tamsin Rook": 2,
    "Brann Holloway": 1,
  };
  const combatPilots = [...allChars, ...unregistered]
    .filter((c) => combatWeights[c.name])
    .map((c) => ({ characterId: c.characterId, weight: combatWeights[c.name] }));
  const killboard = await seedKillboard(db, {
    corporationId: HOME_CORP.corporationId,
    pilots: combatPilots,
    systems: staticData.systems,
    rand,
    now: new Date(),
  });

  const gatecheck = await seedGatecheck(db, { rand, now: new Date() });

  const fleetCount = await seedFleets(db, {
    pilots: combatPilots.map((p) => p.characterId),
    systems: staticData.systems,
    rand,
    now: new Date(),
  });

  // --- EVE mail of the admin account (opt-in on two characters) -----------
  const memberChar = allChars.find((c) => c.name === "Ishani Calder")!;
  const mails = await seedMail(db, {
    userId: demoUserIds.admin,
    characters: pnlChars.map((c) => ({ characterId: c.characterId, name: c.name })),
    otherUserId: memberChar.userId,
    otherCharacterId: memberChar.characterId,
    now: new Date(),
  });

  // --- Skill queues (opt-in on some characters) ------------------------------
  const queued = await seedSkills(db, { characters: allChars, now: new Date() });

  // --- Industry jobs (a few characters build, research and invent) -----------
  const industryCount = await seedIndustry(db, { characters: allChars, now: new Date() });

  // --- Market orders (a few characters trade in stations and structures) ------
  const orderCount = await seedMarket(db, { characters: allChars, now: new Date() });

  await setSetting("corp.homeCorporationId", HOME_CORP.corporationId);
  await setSetting("demo.users", demoUserIds);
  await setSetting("setup.completedAt", new Date().toISOString());
  await setSetting("eve.serverStatus", {
    players: 31842,
    serverVersion: "demo",
    startTime: new Date(today.getTime() + 11 * 3600_000).toISOString(),
    checkedAt: new Date().toISOString(),
  });
  await db.insert(auditLog).values([
    { actorUserId: demoUserIds.admin, actorName: "Aria Vexmoor", action: "user.registered", targetType: "character", targetId: String(DEMO_CHARACTER_BASE + 1) },
    { actorUserId: demoUserIds.admin, actorName: "Aria Vexmoor", action: "settings.updated", targetType: "setting", targetId: "mining.valuationSource", details: { value: "jita_buy" } },
    { actorUserId: demoUserIds.director, actorName: "Tovan Rhask", action: "user.role.changed", targetType: "user", targetId: demoUserIds.viewer, details: { from: "member", to: "viewer" } },
  ]);

  // Needs the home corporation setting, so it runs last.
  const report = await generateSituationReport(db, HOME_CORP.corporationId, new Date(), { force: true });
  const intel = await seedIntel(db, { homeCorporationId: HOME_CORP.corporationId, userId: demoUserIds.director, userName: "Tovan Rhask", now: new Date() });

  console.log(
    `Seeded ${DEMO_USERS.length} users, ${allChars.length} characters, ${personalRows.length} personal and ${observerRows.length} observer ledger rows, ` +
      `${killboard.killmails} killmails, ${gatecheck.kills} gate check kills, ${fleetCount} fleets, ${pnl.transactions} wallet transactions, ${pnl.windows} ` +
      `activity windows, ${corpWallet.entries} corporation journal entries, ${mails} mail rows, ${queued} queued skills, ${industryCount} industry jobs, ${orderCount} market orders, a ${report.source} situation report and a threat intel scan of ${intel.pilots} pilots.`,
  );
  console.log("Start the app with KEYSTAR_DEMO_MODE=true and open /login to sign in as any demo role.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
