// transport.server.ts (:8804) — the railway, which is throughput, not capital.
//
// Peasants eat where they stand. A steel worker in Magnitogorsk does not, and
// neither does a buyer in Hamburg. So rail capacity caps grain moved to
// industry PLUS grain moved to the port — and industrialising consumes the
// very capacity that pays for it.

import { type Grain, type People, type Steel, RULES, isNum, isRecord, isStr } from "./state.ts";
import type { CensusReturn, Dispatch, HaulReport, RailReport, ResetAck } from "./containers.ts";
import { Books, round } from "./commissariat.ts";
import { serveContainer } from "./lib/wire.ts";

export type TrPrompt =
  | { tag: "Lay"; workers: People; steel: Steel; year: number }
  | { tag: "Haul"; railCapacity: number; available: Grain; needIndustry: Grain; offerPort: Grain; year: number }
  | { tag: "Report"; year: number }
  | { tag: "Census" }
  | { tag: "Reset"; seed: number };

export interface TrResponses {
  Lay: RailReport;
  Haul: HaulReport;
  Report: Dispatch;
  Census: CensusReturn;
  Reset: ResetAck;
}
type Reply<K extends TrPrompt["tag"]> = TrResponses[K];

let seed = Number(Deno.env.get("STALIN_SEED") ?? "1928");
let books = new Books("Narkomput", seed + 4, 0.4, 0.92);

let laid = 0;
let lastQuota = 0;

type Handlers = { [K in TrPrompt["tag"]]: (p: Extract<TrPrompt, { tag: K }>) => Reply<K> };

const handlers: Handlers = {
  Lay: (p) => {
    const byLabour = p.workers * RULES.railPerWorker * books.efficiency;
    const bySteel = p.steel / RULES.railSteelCost;
    const added = round(Math.max(0, Math.min(byLabour, bySteel)));
    laid += added;
    lastQuota = round(byLabour);
    return { added, steelUsed: round(added * RULES.railSteelCost) };
  },

  // Feeding the workers comes first: a mill whose hands have starved smelts
  // nothing. Whatever capacity is left over can carry grain to the port.
  //
  // Three things bound a delivery, and all three must be applied. The railway
  // can only move so much; the workers only need so much; and — the one that
  // was missing — the state can only ship grain it actually procured. A light
  // procurement is not a free lunch for the mill.
  Haul: (p) => {
    const toIndustry = Math.min(p.needIndustry, p.railCapacity, p.available);
    const short = round(Math.max(0, p.needIndustry - toIndustry));
    const spareRail = Math.max(0, p.railCapacity - toIndustry);
    const spareGrain = Math.max(0, p.available - toIndustry);
    const toPort = Math.min(p.offerPort, spareRail, spareGrain);
    const stranded = round(Math.max(0, Math.min(p.offerPort, spareGrain) - toPort));
    return { toIndustry: round(toIndustry), toPort: round(toPort), stranded, short };
  },

  Report: (p) => books.record(p.year, lastQuota, laid),
  // Forget everything. `stalin new` must reach the commissariats too, or the
  // weather stream and the books carry over into the next game.
  Reset: (p) => {
    seed = p.seed;
    books = new Books("Narkomput", seed + 4, 0.4, 0.92);
    laid = 0;
    lastQuota = 0;
    return { ok: true };
  },

  Census: (_p): CensusReturn =>
    books.census({
      workforce: { fields: 0, drivers: 0, mill: 0, rail: 0, dead: 0 },
      stocks: { railCapacity: round(laid) },
    }),
};

function answer<P extends TrPrompt>(p: P): Reply<P["tag"]> {
  const h = handlers[p.tag] as (q: TrPrompt) => Reply<P["tag"]>;
  return h(p);
}

export function parseTr(u: unknown): TrPrompt | null {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "Lay":
      return isNum(u.workers) && isNum(u.steel) && isNum(u.year)
        ? { tag: "Lay", workers: u.workers, steel: u.steel, year: u.year } : null;
    case "Haul":
      return isNum(u.railCapacity) && isNum(u.available) && isNum(u.needIndustry) &&
             isNum(u.offerPort) && isNum(u.year)
        ? { tag: "Haul", railCapacity: u.railCapacity, available: u.available,
            needIndustry: u.needIndustry, offerPort: u.offerPort, year: u.year } : null;
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
  serveContainer({ name: "transport", port: 8804, parse: parseTr,
    answer: (p) => Promise.resolve(answer(p)) });
}
