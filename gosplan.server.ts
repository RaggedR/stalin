// gosplan.server.ts (:8801) — the State Planning Committee.
//
// Level 0 of the tower. It produces nothing: for every decision it computes a
// lower-level prompt (the delegate leg u), fires it, and assembles what comes
// back into the answer it owes (the amalgamate leg f). All four combinators
// appear, each where the structure of the year puts it:
//
//     produce  = harvest (x) smelt (x) lay        -- the tensor: all three, at once
//     supply   = produce <| haul                  -- the chain: what moves depends on what was reaped
//     build    = tractors x armaments             -- the product: one steel, one contract
//     sale     = grain x steel   (narrow rail)    -- the product again...
//              = grain (x) steel (wide rail)      -- ...until the port line can carry both
//
// It also keeps two ledgers. The TRUE one, because the grain physically
// exists; and the REPORTED one, assembled from dispatches, which is what the
// player is shown while playing. The gap between them is only revealed at the
// reckoning.

import {
  type Grain, type HarvestGrade, type Procurement, type Steel, type Stocks,
  type Workforce, RULES, fightWar, gradeSteel, isNum, isProcurement, isRecord,
  isStr, living, rural, throughputOf,
} from "./state.ts";
import {
  type AgricultureC, type ArmamentsC, type ForeignTradeC, type GrainSaleC,
  type SmelterC, type SteelSaleC, type SteelTrade, type TractorWorksC,
  type TransportC, type YearReport,
  exportPlan, steelPlan,
} from "./containers.ts";
import { leaf, productC, seqC, tensorC } from "./lib/algebra.ts";
import { serveContainer, trace } from "./lib/wire.ts";
import { round } from "./commissariat.ts";

const AGRI = 8802, IND = 8803, TR = 8804, TD = 8805;

// ── Decoders: `unknown` off the wire, back to a position ──────────────
const num = (u: unknown) => (isNum(u) ? u : null);
const rec = <T>(keys: readonly string[], u: unknown): T | null => {
  if (!isRecord(u)) return null;
  for (const k of keys) if (!(k in u)) return null;
  return u as T;
};

const agri = leaf<AgricultureC>("agri", AGRI, {
  Harvest: (u) => rec(["grain", "grade", "perWorker", "withoutTractors"], u),
  Winter: (u) => rec(["fed", "dead", "shortfall"], u),
  Report: (u) => rec(["year", "quotaMet", "output", "note"], u),
  Census: (u) => rec(["workforce", "stocks", "trueOutput"], u),
  Reset: (u) => rec(["ok"], u),
});
const smelter = leaf<SmelterC>("smelter", IND, {
  Smelt: (u) => rec(["steel", "idleCapacity"], u),
  Report: (u) => rec(["year", "quotaMet", "output", "note"], u),
  Census: (u) => rec(["workforce", "stocks", "trueOutput"], u),
  Reset: (u) => rec(["ok"], u),
});
const tractorWorks = leaf<TractorWorksC>("tractors", IND, {
  BuildTractors: (u) => rec(["built", "steelUsed"], u),
});
const armaments = leaf<ArmamentsC>("armaments", IND, {
  BuildArmaments: (u) => rec(["reserved", "steelUsed"], u),
});
const transport = leaf<TransportC>("transport", TR, {
  Lay: (u) => rec(["added", "steelUsed"], u),
  Haul: (u) => rec(["toIndustry", "toPort", "stranded", "short"], u),
  Report: (u) => rec(["year", "quotaMet", "output", "note"], u),
  Census: (u) => rec(["workforce", "stocks", "trueOutput"], u),
  Reset: (u) => rec(["ok"], u),
});
const grainSale = leaf<GrainSaleC>("grainSale", TD, {
  SellGrain: (u) => rec(["gold", "price", "sold"], u),
});
const steelSale = leaf<SteelSaleC>("steelSale", TD, {
  SellSteel: (u) => rec(["gold", "price", "sold"], u),
});
const trade = leaf<ForeignTradeC>("trade", TD, {
  SellGrain: (u) => rec(["gold", "price", "sold"], u),
  SellSteel: (u) => rec(["gold", "price", "sold"], u),
  BuySteel: (u) => rec(["steel", "grainUsed"], u),
  Hire: (u) => rec(["engineers", "plantCapacity", "goldUsed"], u),
  BuyTractors: (u) => rec(["tractors", "goldUsed"], u),
  Report: (u) => rec(["year", "quotaMet", "output", "note"], u),
  Census: (u) => rec(["workforce", "stocks", "trueOutput"], u),
  Reset: (u) => rec(["ok"], u),
});

// ── The workflow algebra ──────────────────────────────────────────────
const fieldsAndMill = tensorC(agri, smelter);
const produce       = tensorC(fieldsAndMill, transport);      // (x) three sides
const supply        = seqC(produce, transport);               // <| haul what was reaped
const build         = productC(tractorWorks, armaments,       //  x  one steel, one contract
  // The policy reads the decision off the shape: the side that was offered
  // the steel is the side that answers.
  ({ a }) => (a.steel > 0 ? "a" : "b"));
const narrowSale    = productC(grainSale, steelSale,          //  x  one contract
  ({ a }) => (a.grain > 0 ? "a" : "b"));
const wideSale      = tensorC(grainSale, steelSale);          // (x) both, once the port line is wide

export const flowLabel = `${supply.label} ; ${build.label} ; ${narrowSale.label} | ${wideSale.label}`;

// ── The Plan's own state ──────────────────────────────────────────────
interface Game {
  year: number;
  seed: number;
  stocks: Stocks;
  workforce: Workforce;
  baselineOutput: number;   // 1928's harvest — what mechanisation must beat
  baselineRural: number;
  history: YearReport[];
  dispatches: string[];
  reportedGrain: number;    // what the Plan believes, from dispatches
  over: boolean;
}

const fresh = (seed: number): Game => ({
  year: RULES.startYear,
  seed,
  // 1928 was not year zero: there was a little steel, one foreign engineer,
  // and a railway that already reached somewhere.
  stocks: { grain: 40, steel: 10, gold: 0, tractors: 0, engineers: 0,
            railCapacity: 60, millCapacity: 8, plantCapacity: 0,
            warReserve: 0 },
  workforce: { fields: 105, drivers: 0, mill: 8, rail: 7, dead: 0 },
  baselineOutput: 0,
  baselineRural: 105,
  history: [],
  dispatches: [],
  reportedGrain: 0,
  over: false,
});

let game = fresh(1928);

// ── The typed gate, eliminated ────────────────────────────────────────
// The player types a string; at the ingress it is a `string`. Inside the
// engine it is not: narrowing on the grade puts us in ONE fibre, and
// `exportPlan` then only accepts the choices that fibre has. A request the
// harvest does not permit is refused here and cannot travel further.
function resolveExport(grade: HarvestGrade, want: string): { choice: string; refused: boolean } {
  switch (grade) {
    case "failure": {
      const c = exportPlan("failure", "none");
      return { choice: c.choice, refused: want !== "none" };
    }
    case "poor": {
      const ok = want === "surplus";
      const c = exportPlan("poor", ok ? "surplus" : "none");
      return { choice: c.choice, refused: !ok && want !== "none" };
    }
    case "adequate": {
      const ok = want === "surplus" || want === "full";
      const c = exportPlan("adequate", ok ? (want as "surplus" | "full") : "none");
      return { choice: c.choice, refused: !ok && want !== "none" };
    }
    case "bumper": {
      const ok = want === "surplus" || want === "full" || want === "maximum";
      const c = exportPlan("bumper", ok ? (want as "surplus" | "full" | "maximum") : "none");
      return { choice: c.choice, refused: !ok && want !== "none" };
    }
  }
}

function resolveSteel(steel: Steel, committed: Steel, want: string):
  { choice: string; refused: boolean } {
  const position = gradeSteel(steel, committed);
  switch (position) {
    case "deficit": {
      const ok = want === "buy";
      const c: { choice: SteelTrade<"deficit"> } = steelPlan("deficit", ok ? "buy" : "none");
      return { choice: c.choice, refused: !ok && want !== "none" };
    }
    case "balanced": {
      const c = steelPlan("balanced", "none");
      return { choice: c.choice, refused: want !== "none" };
    }
    case "surplus": {
      const ok = want === "sell";
      const c = steelPlan("surplus", ok ? "sell" : "none");
      return { choice: c.choice, refused: !ok && want !== "none" };
    }
  }
}

export interface PlanOrder {
  procurement: Procurement;
  labour: { fields: number; drivers: number; mill: number; rail: number };
  exportGrain: string;
  tradeSteel: string;
  buy: "engineers" | "tools" | "tractors" | "nothing";
  /** Where this year's steel goes. Not a share: a decision. The two works are
   *  separate containers so the Plan takes their PRODUCT — both offered, one
   *  answered — and a year's steel cannot be quietly spent on both. */
  build: "tractors" | "armaments";
}

export type GosPrompt =
  | { tag: "Reset"; seed: number }
  | { tag: "Plan"; order: PlanOrder }
  | { tag: "Status" }
  | { tag: "Reckoning" };

async function runYear(order: PlanOrder, depth: number): Promise<YearReport> {
  const year = game.year;
  const s = game.stocks;

  // Allocate. Nobody may be conjured: the shares are normalised to the living.
  const alive = living(game.workforce);
  const l = order.labour;
  const asked = l.fields + l.drivers + l.mill + l.rail;
  const k = asked > 0 ? alive / asked : 0;
  // Flooring four shares independently loses up to three people a year, and
  // they never come back. Whatever the rounding drops goes to the fields, so
  // an allocation moves people around and never destroys any: the only thing
  // in this game that reduces the population is starvation.
  const w: Workforce = {
    fields: Math.floor(l.fields * k), drivers: Math.floor(l.drivers * k),
    mill: Math.floor(l.mill * k), rail: Math.floor(l.rail * k),
    dead: game.workforce.dead,
  };
  w.fields += alive - (w.fields + w.drivers + w.mill + w.rail);
  game.workforce = w;

  // ── TENSOR then CHAIN. The three sectors work at once and all three owe a
  //    report; then what the railway is asked to haul is computed FROM those
  //    reports. That computation is the second component of the composite
  //    shape — `next` — and running it is the whole content of <|.
  trace(depth, "down", "gosplan", supply.label);
  const railSteel = Math.min(s.steel, w.rail * RULES.railPerWorker * RULES.railSteelCost);
  const take = RULES.procurement[order.procurement];
  const indMouths = w.mill + w.rail;

  // `next` is a pure function of the first container's position, so what it
  // decides has to be recovered afterwards rather than assigned inside it.
  let exp: { choice: string; refused: boolean } = { choice: "none", refused: false };

  const supplied = await supply.run(
    supply.step(
      produce.both(
        fieldsAndMill.both(
          { tag: "Harvest", workforce: w, tractors: s.tractors, year },
          { tag: "Smelt", workers: w.mill, millCapacity: s.millCapacity, year },
        ),
        { tag: "Lay", workers: w.rail, steel: railSteel, year },
      ),
      // The dependency, doing its work: `produced` is typed at the fibre we
      // prompted, so `produced.left.left` is a HarvestReport and its `grade`
      // is what decides which export decisions exist at all.
      (produced) => {
        const h = produced.left.left;
        const stateGrain = h.grain * take + s.grain;
        exp = resolveExport(h.grade, order.exportGrain);
        const offerPort = exp.choice === "none" ? 0
          : exp.choice === "surplus" ? Math.max(0, stateGrain - indMouths)
          : exp.choice === "full" ? stateGrain * 0.6
          : stateGrain * 0.9;
        return {
          tag: "Haul" as const,
          railCapacity: s.railCapacity + produced.right.added,
          available: round(stateGrain),
          needIndustry: indMouths,
          offerPort: round(offerPort),
          year,
        };
      },
    ),
    depth,
  );

  // The composite position is the product of the two fibres' positions: the
  // triple that came back from the tensor, and the haul that the triple chose.
  const harvest = supplied.first.left.left;
  const smelt = supplied.first.left.right;
  const rail = supplied.first.right;
  const haul = supplied.second;

  s.steel = round(s.steel - rail.steelUsed + smelt.steel);
  s.railCapacity = round(s.railCapacity + rail.added);

  const stateGrain = round(harvest.grain * take + s.grain);
  const villageGrain = round(harvest.grain * (1 - take));

  // ── The trade. Which moves exist here was decided by the harvest grade and
  //    the steel position; `resolveExport`/`resolveSteel` are where the finite
  //    Sigma is eliminated, and past them nothing illegal can be constructed.
  let importedTractors = 0;
  const committed = RULES.steelCommitment;
  // The position is production against commitment, not the residue after a
  // year's spending. A country that smelts thirty and spends thirty is not in
  // deficit; it is working. Deficit means the mill cannot make what the plan
  // has already promised — which is exactly when you must buy abroad.
  const st = resolveSteel(smelt.steel, committed, order.tradeSteel);
  const sellSteel = st.choice === "sell" ? round(s.steel * 0.5) : 0;
  const buyGrain = st.choice === "buy" ? Math.min(haul.toPort, round(stateGrain * 0.15)) : 0;

  let gold = 0, grainExported = 0, steelExported = 0, steelImported = 0;
  const wide = throughputOf(s.railCapacity) === "wide";
  const grainToSell = round(Math.max(0, haul.toPort - buyGrain));

  if (buyGrain > 0) {
    const bought = await trade.run({ tag: "BuySteel", grain: buyGrain, year }, depth);
    s.steel = round(s.steel + bought.steel);
    steelImported = bought.steel;
    grainExported += bought.grainUsed;
  }
  if (grainToSell > 0 || sellSteel > 0) {
    // PRODUCT or TENSOR, decided by the railway to the port. One contract
    // while the line is narrow; both once it can carry them.
    trace(depth, "down", "gosplan", wide ? wideSale.label : narrowSale.label);
    if (wide) {
      const both = await wideSale.run(
        wideSale.both({ tag: "SellGrain", grain: grainToSell, year },
                      { tag: "SellSteel", steel: sellSteel, year }), depth);
      gold = round(both.left.gold + both.right.gold);
      grainExported += both.left.sold;
      steelExported = both.right.sold;
    } else {
      const sale = await narrowSale.run(
        narrowSale.offer({ tag: "SellGrain", grain: grainToSell, year },
                         { tag: "SellSteel", steel: sellSteel, year }), depth);
      gold = sale.value.gold;
      if (sale.side === "a") grainExported += sale.value.sold;
      else steelExported = sale.value.sold;
    }
    s.steel = round(s.steel - steelExported);
  }
  s.gold = round(s.gold + gold);

  if (order.buy === "tractors" && s.gold > 0) {
    // The other road to mechanisation: buy them ready-made. It needs no
    // engineer, no mill and no works — and it builds none of those either.
    const bought = await trade.run({ tag: "BuyTractors", gold: s.gold, year }, depth);
    s.gold = round(s.gold - bought.goldUsed);
    s.tractors += bought.tractors;
    importedTractors = bought.tractors;
  } else if (order.buy !== "nothing" && s.gold > 0) {
    const bought = await trade.run(
      { tag: "Hire", gold: s.gold, want: order.buy as "engineers" | "tools", year }, depth);
    s.gold = round(s.gold - bought.goldUsed);
    s.engineers += bought.engineers;
    s.millCapacity = round(s.millCapacity + bought.engineers * RULES.engineerCapacity);
    s.plantCapacity = round(s.plantCapacity + bought.plantCapacity);
  }

  // ── PRODUCT: tractors x armaments. The same steel; offer both, answer one.
  //    Armaments return nothing at all unless 1941 happens — which is what
  //    makes this the one decision in the game with no economic hedge.
  trace(depth, "down", "gosplan", build.label);
  const toTractors = order.build === "tractors";
  let tractorsBuilt = 0;
  if (s.steel > 0) {
    const made = await build.run(
      build.offer(
        { tag: "BuildTractors", steel: toTractors ? s.steel : 0,
          plantCapacity: s.plantCapacity, year },
        { tag: "BuildArmaments", steel: toTractors ? 0 : s.steel, year },
      ),
      depth,
    );
    // The position is a reply from exactly ONE side. Narrowing on `side` is
    // the elimination of Either (R p) (T q).
    if (made.side === "a") {
      tractorsBuilt = made.value.built;
      s.tractors += made.value.built;
      s.steel = round(s.steel - made.value.steelUsed);
    } else {
      s.warReserve = round(s.warReserve + made.value.reserved);
      s.steel = round(s.steel - made.value.steelUsed);
    }
  }
  if (s.plantCapacity === 0 && s.engineers > 0 && s.steel >= RULES.plantSteel) {
    s.steel = round(s.steel - RULES.plantSteel);
    s.plantCapacity = RULES.plantCapacity;
  }

  // ── Winter. Two populations, two rations, two ways to die.
  const winter = await agri.run({
    tag: "Winter", ruralRations: villageGrain,
    industrialRations: haul.toIndustry, year,
  }, depth);

  const dead = winter.dead;
  const ruralLoss = winter.starvedRural;
  const indLoss = winter.starvedIndustrial;
  const shrink = (n: number, loss: number, pool: number) =>
    pool <= 0 ? n : Math.max(0, n - Math.round(loss * (n / pool)));
  const ruralPool = w.fields + w.drivers;
  const indPool = w.mill + w.rail;
  game.workforce = {
    fields: shrink(w.fields, ruralLoss, ruralPool),
    drivers: shrink(w.drivers, ruralLoss, ruralPool),
    mill: shrink(w.mill, indLoss, indPool),
    rail: shrink(w.rail, indLoss, indPool),
    dead: w.dead + dead,
  };

  s.grain = round(Math.max(0, stateGrain - haul.toIndustry - grainExported));
  if (game.baselineOutput === 0) game.baselineOutput = harvest.grain;

  // The dispatches: what each commissariat chooses to say it did.
  // Each runner is called on its own, not in a loop: iterating heterogeneous
  // runners would union their generic signatures, and a union of generic
  // signatures is not callable.
  const notes: string[] = [
    (await agri.run({ tag: "Report", year }, depth)).note,
    (await smelter.run({ tag: "Report", year }, depth)).note,
    (await transport.run({ tag: "Report", year }, depth)).note,
  ];
  game.dispatches.push(...notes);

  const report: YearReport = {
    year, harvest, steel: s.steel, importedTractors, steelPosition: gradeSteel(smelt.steel, committed),
    tractorsBuilt, railAdded: rail.added, goldEarned: gold,
    grainExported: round(grainExported), steelExported, steelImported,
    dead, workforce: game.workforce, stocks: { ...s },
    dispatches: [
      ...notes,
      ...(exp.refused ? [`Narkomvneshtorg: an export of "${order.exportGrain}" is not possible on a ${harvest.grade} harvest; none was shipped.`] : []),
      ...(st.refused ? [`Narkomvneshtorg: steel is in ${gradeSteel(smelt.steel, committed)}; "${order.tradeSteel}" is not a trade that exists this year.`] : []),
      ...(haul.stranded > 0 ? [`Narkomput: ${haul.stranded} of grain could not be moved and was left at the sidings.`] : []),
      ...(haul.short > 0 ? [`Narkomput: ${haul.short} short of what the towns needed; the state had not procured it.`] : []),
    ],
  };
  game.history.push(report);
  game.year += 1;
  if (game.history.length >= RULES.years) game.over = true;
  return report;
}

// ── The Books interface of the game ───────────────────────────────────
export type GosReply =
  | YearReport
  | { kind: "status"; year: number; over: boolean; stocks: Stocks; workforce: Workforce;
      believed: number; baseline: number }
  | { kind: "reckoning"; [k: string]: unknown };

async function answer(p: GosPrompt, depth: number): Promise<GosReply> {
  switch (p.tag) {
    case "Reset":
      // The Plan forgetting is not enough: each commissariat carries its own
      // weather stream, its own books and its own accumulated overstatement.
      // Without this fan-out, two games on one server are not comparable.
      await agri.run({ tag: "Reset", seed: p.seed }, depth);
      await smelter.run({ tag: "Reset", seed: p.seed }, depth);
      await transport.run({ tag: "Reset", seed: p.seed }, depth);
      await trade.run({ tag: "Reset", seed: p.seed }, depth);
      game = fresh(p.seed);
      return { kind: "status", year: game.year, over: false, stocks: game.stocks,
               workforce: game.workforce, believed: 0, baseline: 0 };
    case "Plan":
      if (game.over) throw new Error("the plan is concluded; call reckoning");
      return await runYear(p.order, depth);
    case "Status":
      return { kind: "status", year: game.year, over: game.over, stocks: game.stocks,
               workforce: game.workforce, believed: game.reportedGrain,
               baseline: game.baselineOutput };
    case "Reckoning": {
      const survivors = living(game.workforce);
      const war = fightWar(survivors, game.stocks.warReserve);
      const last = game.history[game.history.length - 1];
      const censuses = [
        await agri.run({ tag: "Census" }, depth),
        await smelter.run({ tag: "Census" }, depth),
        await transport.run({ tag: "Census" }, depth),
        await trade.run({ tag: "Census" }, depth),
      ];
      return {
        kind: "reckoning",
        baselineOutput: game.baselineOutput,
        baselineRural: game.baselineRural,
        finalOutput: last ? last.harvest.grain : 0,
        finalRural: rural(game.workforce),
        withoutTractors: last ? last.harvest.withoutTractors : 0,
        starved: game.workforce.dead,
        war,
        totalDead: game.workforce.dead + war.fallen,
        stocks: game.stocks,
        workforce: game.workforce,
        censuses,
        dispatches: game.dispatches,
      };
    }
  }
}

export function parseGos(u: unknown): GosPrompt | null {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "Reset": return isNum(u.seed) ? { tag: "Reset", seed: u.seed } : null;
    case "Status": return { tag: "Status" };
    case "Reckoning": return { tag: "Reckoning" };
    case "Plan": {
      const o = u.order;
      if (!isRecord(o) || !isProcurement(o.procurement)) return null;
      const l = o.labour;
      if (!isRecord(l)) return null;
      for (const k of ["fields", "drivers", "mill", "rail"]) {
        if (!isNum(l[k])) return null;
      }
      if (!isStr(o.exportGrain) || !isStr(o.tradeSteel)) return null;
      if (o.buy !== "engineers" && o.buy !== "tools" && o.buy !== "tractors" &&
          o.buy !== "nothing") return null;
      if (o.build !== "tractors" && o.build !== "armaments") return null;
      return { tag: "Plan", order: {
        procurement: o.procurement,
        labour: { fields: l.fields as number, drivers: l.drivers as number,
                  mill: l.mill as number, rail: l.rail as number },
        exportGrain: o.exportGrain, tradeSteel: o.tradeSteel,
        buy: o.buy, build: o.build,
      } };
    }
    default: return null;
  }
}

if (import.meta.main) {
  serveContainer({ name: "gosplan", port: 8801, parse: parseGos, answer });
}
