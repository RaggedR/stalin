// industry.server.ts (:8803) — the mill, and the two things steel can become.
//
// It serves three containers on one port: the smelter, the tractor works, and
// the armaments shop. The last two are separate containers precisely so the
// Plan can take their PRODUCT — same steel, one contract, offer both and
// answer one.

import { type People, type Steel, RULES, isNum, isRecord, isStr } from "./state.ts";
import type {
  ArmamentReport, CensusReturn, Dispatch, SmeltReport, TractorReport,
} from "./containers.ts";
import { Books, round } from "./commissariat.ts";
import { serveContainer } from "./lib/wire.ts";

export type IndPrompt =
  | { tag: "Smelt"; workers: People; millCapacity: number; year: number }
  | { tag: "BuildTractors"; steel: Steel; plantCapacity: number; year: number }
  | { tag: "BuildArmaments"; steel: Steel; year: number }
  | { tag: "Report"; year: number }
  | { tag: "Census" };

export interface IndResponses {
  Smelt: SmeltReport;
  BuildTractors: TractorReport;
  BuildArmaments: ArmamentReport;
  Report: Dispatch;
  Census: CensusReturn;
}
type Reply<K extends IndPrompt["tag"]> = IndResponses[K];

const seed = Number(Deno.env.get("STALIN_SEED") ?? "1928");
// Heavy industry was the loudest and the least honest of the commissariats.
const books = new Books("Narkomtiazhprom", seed + 3, 0.75, 0.9);

let lastSteel = 0;
let lastQuota = 0;
let tractorsBuilt = 0;
let reserved = 0;

type Handlers = { [K in IndPrompt["tag"]]: (p: Extract<IndPrompt, { tag: K }>) => Reply<K> };

const handlers: Handlers = {
  // Steel is capped twice: by hands and by plant. Engineers bought abroad are
  // what raise the second cap, which is why the early game must export grain.
  Smelt: (p) => {
    const byLabour = p.workers * RULES.millPerWorker * books.efficiency;
    const steel = round(Math.min(byLabour, p.millCapacity));
    lastSteel = steel;
    lastQuota = round(p.millCapacity);
    return { steel, idleCapacity: round(Math.max(0, p.millCapacity - byLabour)) };
  },

  BuildTractors: (p) => {
    const affordable = Math.floor(p.steel / RULES.tractorSteel);
    const built = Math.min(affordable, Math.floor(p.plantCapacity));
    tractorsBuilt += built;
    return { built, steelUsed: round(built * RULES.tractorSteel) };
  },

  // Armaments return nothing. No grain, no throughput, no gold. They are only
  // worth anything if 1941 happens — which is the point.
  BuildArmaments: (p) => {
    const put = round(Math.max(0, p.steel));
    reserved += put;
    return { reserved: put, steelUsed: put };
  },

  Report: (p) => books.record(p.year, lastQuota, lastSteel),

  Census: (_p): CensusReturn =>
    books.census({
      workforce: { fields: 0, drivers: 0, mill: 0, rail: 0, army: 0, dead: 0 },
      stocks: { steel: lastSteel, tractors: tractorsBuilt, warReserve: reserved },
    }),
};

function answer<P extends IndPrompt>(p: P): Reply<P["tag"]> {
  const h = handlers[p.tag] as (q: IndPrompt) => Reply<P["tag"]>;
  return h(p);
}

export function parseInd(u: unknown): IndPrompt | null {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "Smelt":
      return isNum(u.workers) && isNum(u.millCapacity) && isNum(u.year)
        ? { tag: "Smelt", workers: u.workers, millCapacity: u.millCapacity, year: u.year } : null;
    case "BuildTractors":
      return isNum(u.steel) && isNum(u.plantCapacity) && isNum(u.year)
        ? { tag: "BuildTractors", steel: u.steel, plantCapacity: u.plantCapacity, year: u.year } : null;
    case "BuildArmaments":
      return isNum(u.steel) && isNum(u.year)
        ? { tag: "BuildArmaments", steel: u.steel, year: u.year } : null;
    case "Report":
      return isNum(u.year) ? { tag: "Report", year: u.year } : null;
    case "Census":
      return { tag: "Census" };
    default:
      return null;
  }
}

if (import.meta.main) {
  serveContainer({ name: "industry", port: 8803, parse: parseInd,
    answer: (p) => Promise.resolve(answer(p)) });
}
