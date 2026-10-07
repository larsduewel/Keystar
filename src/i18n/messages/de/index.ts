import { map } from "./map";
import type { Messages } from "../en";
import { admin } from "./admin";
import { auth } from "./auth";
import { characters } from "./characters";
import { common } from "./common";
import { core } from "./core";
import { dashboard } from "./dashboard";
import { eve } from "./eve";
import { fleet } from "./fleet";
import { gatecheck } from "./gatecheck";
import { industry } from "./industry";
import { intel } from "./intel";
import { killboard } from "./killboard";
import { market } from "./market";
import { mining } from "./mining";
import { pnl } from "./pnl";
import { setup } from "./setup";
import { shell } from "./shell";
import { skills } from "./skills";
import { social } from "./social";
import { trade } from "./trade";
import { wallet } from "./wallet";
import { help } from "./help";
import { whatsNew } from "./whats-new";

/** German dictionary. Informal "du", EVE terms as German players use them (Corporation, Killboard, ISK, ESI). */
export const de: Messages = {
  map,
  common,
  shell,
  auth,
  setup,
  core,
  eve,
  dashboard,
  characters,
  admin,
  mining,
  pnl,
  killboard,
  fleet,
  industry,
  intel,
  gatecheck,
  trade,
  market,
  wallet,
  social,
  skills,
  help,
  whatsNew,
};
