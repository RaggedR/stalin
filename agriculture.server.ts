// agriculture.server.ts (:8802) — the fields, and the people in them.
//
// A leaf: it answers directly and delegates to nobody, which in §4's terms
// makes it an event handler into the do-nothing interface.

import {
  type Grain, type HarvestGrade, type People, type Workforce,
  RULES, gradeHarvest, isNum, isRecord, isStr, asWorkforce, rng,
} from "./state.ts";
import type {
  AgricultureC, CensusReturn, Dispatch, HarvestReport, WinterReport,
  ResetAck,
} from "./containers.ts";
import { Books, clamp, round } from "./commissariat.ts";
import { serveContainer } from "./lib/wire.ts";

export type AgPrompt =
  | { tag: "Harvest"; workforce: Workforce; tractors: number; year: number }
  | { tag: "Winter"; ruralRations: Grain; industrialRations: Grain; year: number }
  | { tag: "Report"; year: number }
  | { tag: "Census" }
  | { tag: "Reset"; seed: number };

export interface AgResponses {
  Harvest: HarvestReport;
  Winter: WinterReport;
  Report: Dispatch;
  Census: CensusReturn;
  Reset: ResetAck;
}
type Reply<K extends AgPrompt["tag"]> = AgResponses[K];

let seed = Number(Deno.env.get("STALIN_SEED") ?? "1928");
let books = new Books("Narkomzem", seed + 2, 0.55, 0.95);
let weather = rng(seed + 11);

let lastHarvest: HarvestReport | null = null;
let lastWorkforce: Workforce | null = null;
let starved = 0;

type Handlers = {
  [K in AgPrompt["tag"]]: (p: Extract<AgPrompt, { tag: K }>) => Reply<K>;
};

const handlers: Handlers = {
  // Output is field labour PLUS tractors that have someone to drive them.
  // A tractor without a driver is a monument; that is the constraint that
  // makes moving peasants into the mill costly in two directions at once.
  Harvest: (p) => {
    const w = p.workforce;
    const operated = Math.min(p.tractors, w.drivers);
    // 1931: drought. A scripted event, because a plan that assumed fair
    // weather is a plan that has not been tested.
    const drought = p.year === 1931 ? 0.72 : 1;
    const luck = 0.9 + 0.2 * weather();
    const modifier = books.efficiency * drought * luck;

    const grain = round((w.fields * RULES.fieldYield + operated * RULES.tractorYield) * modifier);
    // The counterfactual: what these same hands would have reaped with no
    // tractors at all. Drivers go back to the fields; the machines rust.
    const withoutTractors = round((w.fields + w.drivers) * RULES.fieldYield * modifier);

    const mouths = w.fields + w.drivers + w.mill + w.rail;
    const report: HarvestReport = {
      grain,
      grade: gradeHarvest(grain, mouths),
      perWorker: round(grain / Math.max(1, w.fields + w.drivers)),
      withoutTractors,
    };
    lastHarvest = report;
    lastWorkforce = w;
    return report;
  },

  // Everyone eats: field hands, drivers, steel workers, railwaymen, soldiers.
  // Only the first two grow anything. That asymmetry is the whole squeeze of
  // industrialisation, and it is why moving a peasant costs twice.
  Winter: (p) => {
    const w = lastWorkforce;
    if (w === null) throw new Error("winter before harvest");
    // Two populations, two rations, two ways to die. Peasants eat what
    // procurement left in the village; workers and soldiers eat only what the
    // railway actually delivered. Moving a peasant to the mill moves him from
    // the first column to the second.
    const ruralMouths = w.fields + w.drivers;
    const indMouths = w.mill + w.rail;

    const ruralShort = Math.max(0, ruralMouths * RULES.eats - p.ruralRations);
    const indShort = Math.max(0, indMouths * RULES.eats - p.industrialRations);
    const starvedRural = Math.min(ruralMouths, Math.round(ruralShort / RULES.eats));
    const starvedIndustrial = Math.min(indMouths, Math.round(indShort / RULES.eats));
    const dead = starvedRural + starvedIndustrial;
    starved += dead;
    return {
      fed: ruralMouths + indMouths - dead,
      starvedRural, starvedIndustrial, dead,
      shortfall: round(ruralShort + indShort),
    };
  },

  Report: (p) => {
    const h = lastHarvest;
    const quota = (lastWorkforce ? lastWorkforce.fields + lastWorkforce.drivers : 0)
      * RULES.fieldYield * 1.15;
    return books.record(p.year, round(quota), h ? h.grain : 0);
  },

  // Forget everything. `stalin new` must reach the commissariats too, or the
  // weather stream and the books carry over into the next game.
  Reset: (p) => {
    seed = p.seed;
    books = new Books("Narkomzem", seed + 2, 0.55, 0.95);
    weather = rng(seed + 11);
    lastHarvest = null;
    lastWorkforce = null;
    starved = 0;
    return { ok: true };
  },

  Census: (_p): CensusReturn =>
    books.census({
      workforce: lastWorkforce ?? { fields: 0, drivers: 0, mill: 0, rail: 0, dead: starved },
      stocks: { grain: lastHarvest ? lastHarvest.grain : 0 },
    }),
};

function answer<P extends AgPrompt>(p: P): Reply<P["tag"]> {
  const h = handlers[p.tag] as (q: AgPrompt) => Reply<P["tag"]>;
  return h(p);
}

export function parseAg(u: unknown): AgPrompt | null {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "Harvest": {
      const w = asWorkforce(u.workforce);
      return w && isNum(u.tractors) && isNum(u.year)
        ? { tag: "Harvest", workforce: w, tractors: u.tractors, year: u.year } : null;
    }
    case "Winter":
      return isNum(u.ruralRations) && isNum(u.industrialRations) && isNum(u.year)
        ? { tag: "Winter", ruralRations: u.ruralRations,
            industrialRations: u.industrialRations, year: u.year } : null;
    case "Report":
      return isNum(u.year) ? { tag: "Report", year: u.year } : null;
    case "Census":
      return { tag: "Census" };
    case "Reset":
      return isNum(u.seed) ? { tag: "Reset", seed: u.seed } : null;
    default:
      return null;
  }
}

if (import.meta.main) {
  serveContainer({ name: "agri", port: 8802, parse: parseAg,
    answer: (p) => Promise.resolve(answer(p)) });
}
