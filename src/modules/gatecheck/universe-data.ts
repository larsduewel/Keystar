import gateData from "../../../public/data/map-gates.json";
import systemData from "../../../public/data/map-systems.json";
import type { MapSystem } from "@/modules/map/model";
import type { MapGate } from "@/modules/map/travel";
import { buildUniverse, type Universe } from "./universe";

let cached: Universe | undefined;

/** The stargate network, built once per process (app and worker) from the bundled static data. */
export function getUniverse(): Universe {
  cached ??= buildUniverse(systemData as MapSystem[], gateData as MapGate[]);
  return cached;
}
