import {
  affiliationsJob,
  characterRolesJob,
  corporationMembersJob,
  housekeepingJob,
  marketPricesJob,
  serverStatusJob,
  universeSystemsJob,
} from "@/core/sync/core-jobs";
import type { JobDefinition, PriceInterestProvider } from "@/core/sync/types";
import type { Messages } from "@/i18n/messages";
import { fleetJobs } from "./fleet/jobs";
import { industrySyncJobs } from "./industry/jobs";
import { intelJobs } from "./intel/jobs";
import { killboardJobs } from "./killboard/jobs";
import { mapNamesJob } from "./map/jobs";
import { mapSkyhooksJob } from "./map/skyhook-job";
import { miningJobs, miningPriceInterest } from "./mining/jobs";
import { skillsJobs } from "./skills/jobs";
import { socialJobs } from "./social/jobs";
import { walletJobs } from "./wallet/jobs";

/**
 * Background jobs run by the worker. Add a module's jobs and price interest
 * providers here. Server-only: never import this from client components.
 */
const PRICE_INTEREST: PriceInterestProvider[] = [miningPriceInterest];

export const JOBS: JobDefinition[] = [
  serverStatusJob,
  affiliationsJob,
  characterRolesJob,
  corporationMembersJob,
  marketPricesJob(PRICE_INTEREST),
  housekeepingJob,
  universeSystemsJob,
  mapNamesJob,
  mapSkyhooksJob,
  ...miningJobs,
  ...industrySyncJobs,
  ...killboardJobs,
  ...fleetJobs,
  ...intelJobs,
  ...walletJobs,
  ...socialJobs,
  ...skillsJobs,
];

const JOBS_BY_KEY = new Map(JOBS.map((j) => [j.key, j]));

/** Display name of a job in the viewer's language; unknown (removed) jobs show their key. */
export function jobLabel(key: string, t: Messages): string {
  return JOBS_BY_KEY.get(key)?.label(t) ?? key;
}
