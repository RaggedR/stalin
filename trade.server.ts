// trade.server.ts (:8805) — the frontier, and the arc of the whole game.
//
// You begin in deficit and BUY steel with grain at a punitive rate. You end in
// surplus and SELL steel, which is worth twice what grain is. The transition
// from the first to the second is what the plan is for — and in containers.ts
// it is a change of FIBRE, not an `if`: `SteelTrade<"deficit">` does not
// contain "sell", so selling steel you do not have is a move that cannot be
// written down.

import { type Gold, type Grain, type Steel, RULES, isNum, isRecord, isStr } from "./state.ts";
import type { CensusReturn, Dispatch, PurchaseReport, SaleReport } from "./containers.ts";
import { Books, round } from "./commissariat.ts";
import { serveContainer } from "./lib/wire.ts";

export type TdPrompt =
  | { tag: "SellGrain"; grain: Grain; year: number }
  | { tag: "SellSteel"; steel: Steel; year: number }
  | { tag: "BuySteel"; grain: Grain; year: number }
  | { tag: "Hire"; gold: Gold; want: "engineers" | "tools"; year: number }
  | { tag: "Report"; year: number }
  | { tag: "Census" };

export interface TdResponses {
  SellGrain: SaleReport;
  SellSteel: SaleReport;
  BuySteel: PurchaseReport;
  Hire: { engineers: number; plantCapacity: number; goldUsed: number };
  Report: Dispatch;
  Census: CensusReturn;
}
type Reply<K extends TdPrompt["tag"]> = TdResponses[K];

const seed = Number(Deno.env.get("STALIN_SEED") ?? "1928");
// The trade delegation had the least room to lie: the gold either arrived or
// it did not.
const books = new Books("Narkomvneshtorg", seed + 5, 0.1, 1.0);

let goldEarned = 0;
let grainSold = 0;
let steelSold = 0;
let steelBought = 0;

/** 1930: the world grain price collapses. This is the Depression, and it is
 *  the event that punishes a plan built on stable prices — historically it is
 *  why the same tonnage of grain bought steadily less machinery each year. */
function grainPrice(year: number): number {
  if (year >= 1931) return RULES.grainPerGold * 2.2;
  if (year === 1930) return RULES.grainPerGold * 2.0;
  return RULES.grainPerGold;
}

type Handlers = { [K in TdPrompt["tag"]]: (p: Extract<TdPrompt, { tag: K }>) => Reply<K> };

const handlers: Handlers = {
  SellGrain: (p) => {
    const price = grainPrice(p.year);
    const gold = round(p.grain / price);
    goldEarned += gold;
    grainSold += p.grain;
    return { gold, price: round(price), sold: round(p.grain) };
  },

  // Steel holds its value while grain collapses. That divergence is the whole
  // argument for the transition, and the player can watch it happen.
  SellSteel: (p) => {
    const gold = round(p.steel / RULES.steelPerGold);
    goldEarned += gold;
    steelSold += p.steel;
    return { gold, price: RULES.steelPerGold, sold: round(p.steel) };
  },

  BuySteel: (p) => {
    const steel = round(p.grain / RULES.grainPerSteelImport);
    steelBought += steel;
    return { steel, grainUsed: round(p.grain) };
  },

  // The second product: engineers raise the ceiling on steel for good;
  // machine tools raise the ceiling on tractors. One budget, one choice.
  Hire: (p) => {
    if (p.want === "engineers") {
      const n = Math.floor(p.gold / RULES.engineerGold);
      return { engineers: n, plantCapacity: 0, goldUsed: n * RULES.engineerGold };
    }
    const n = Math.floor(p.gold / RULES.toolsGold);
    return { engineers: 0, plantCapacity: n * 10, goldUsed: n * RULES.toolsGold };
  },

  Report: (p) => books.record(p.year, round(goldEarned), round(goldEarned)),
  Census: (_p): CensusReturn =>
    books.census({
      workforce: { fields: 0, drivers: 0, mill: 0, rail: 0, army: 0, dead: 0 },
      stocks: { gold: round(goldEarned), steel: round(steelBought) },
    }),
};

function answer<P extends TdPrompt>(p: P): Reply<P["tag"]> {
  const h = handlers[p.tag] as (q: TdPrompt) => Reply<P["tag"]>;
  return h(p);
}

export function parseTd(u: unknown): TdPrompt | null {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "SellGrain":
      return isNum(u.grain) && isNum(u.year) ? { tag: "SellGrain", grain: u.grain, year: u.year } : null;
    case "SellSteel":
      return isNum(u.steel) && isNum(u.year) ? { tag: "SellSteel", steel: u.steel, year: u.year } : null;
    case "BuySteel":
      return isNum(u.grain) && isNum(u.year) ? { tag: "BuySteel", grain: u.grain, year: u.year } : null;
    case "Hire":
      return isNum(u.gold) && isNum(u.year) && (u.want === "engineers" || u.want === "tools")
        ? { tag: "Hire", gold: u.gold, want: u.want, year: u.year } : null;
    case "Report":
      return isNum(u.year) ? { tag: "Report", year: u.year } : null;
    case "Census":
      return { tag: "Census" };
    default:
      return null;
  }
}

if (import.meta.main) {
  serveContainer({ name: "trade", port: 8805, parse: parseTd,
    answer: (p) => Promise.resolve(answer(p)) });
}
