// transport.server.ts (:8804) — the railway, which is throughput, not capital.
//
// Peasants eat where they stand. A steel worker in Magnitogorsk does not, and
// neither does a buyer in Hamburg. So rail capacity caps grain moved to
// industry PLUS grain moved to the port — and industrialising consumes the
// very capacity that pays for it.

import { type Grain, type People, type Steel, RULES, isNum, isRecord, isStr } from "./state.ts";
import type { CensusReturn, Dispatch, HaulReport, RailReport } from "./containers.ts";
import { Books, round } from "./commissariat.ts";
import { serveContainer } from "./lib/wire.ts";

export type TrPrompt =
  | { tag: "Lay"; workers: People; steel: Steel; year: number }
  | { tag: "Haul"; railCapacity: number; needIndustry: Grain; offerPort: Grain; year: number }
  | { tag: "Report"; year: number }
  | { tag: "Census" };

export interface TrResponses {
  Lay: RailReport;
  Haul: HaulReport;
  Report: Dispatch;
  Census: CensusReturn;
}
type Reply<K extends TrPrompt["tag"]> = TrResponses[K];

const seed = Number(Deno.env.get("STALIN_SEED") ?? "1928");
const books = new Books("Narkomput", seed + 4, 0.4, 0.92);

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
  Haul: (p) => {
    const toIndustry = Math.min(p.needIndustry, p.railCapacity);
    const spare = Math.max(0, p.railCapacity - toIndustry);
    const toPort = Math.min(p.offerPort, spare);
    const stranded = round(Math.max(0, p.offerPort - toPort));
    return { toIndustry: round(toIndustry), toPort: round(toPort), stranded };
  },

  Report: (p) => books.record(p.year, lastQuota, laid),
  Census: (_p): CensusReturn =>
    books.census({
      workforce: { fields: 0, drivers: 0, mill: 0, rail: 0, army: 0, dead: 0 },
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
      return isNum(u.railCapacity) && isNum(u.needIndustry) && isNum(u.offerPort) && isNum(u.year)
        ? { tag: "Haul", railCapacity: u.railCapacity, needIndustry: u.needIndustry,
            offerPort: u.offerPort, year: u.year } : null;
    case "Report":
      return isNum(u.year) ? { tag: "Report", year: u.year } : null;
    case "Census":
      return { tag: "Census" };
    default:
      return null;
  }
}

if (import.meta.main) {
  serveContainer({ name: "transport", port: 8804, parse: parseTr,
    answer: (p) => Promise.resolve(answer(p)) });
}
