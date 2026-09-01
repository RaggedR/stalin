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
  type HarvestGrade, type Procurement, type Steel, type SteelPosition, type Stocks,
  type Workforce, RULES, fightWar, gradeSteel, isNum, isProcurement, isRecord,
  isStr, living, rural,
} from "./state.ts";
import type { HarvestReport, RailReport, SaleReport, SmeltReport } from "./containers.ts";
import {
  type AgricultureC, type ArmamentsC, type ForeignTradeC,
  type SmelterC, type SteelTrade, type TractorWorksC,
  type TransportC, type YearReport,
  exportPlan, steelPlan,
} from "./containers.ts";
import { leaf, productC, seqC, tensorC } from "./lib/algebra.ts";
import { serveContainer, trace } from "./lib/wire.ts";
import { round } from "./commissariat.ts";

const AGRI = 8802, IND = 8803, TR = 8804, TD = 8805;

// ── Decoders: `unknown` off the wire, back to a position ──────────────
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
const trade = leaf<ForeignTradeC>("trade", TD, {
  SellGrain: (u) => rec(["gold", "price", "sold"], u),
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
// <|  What can be SOLD depends on what the railway actually managed to move,
// which is not known until the haul has answered. Before the year was split
// this was seqC(produce, transport) — haul what was reaped — but produce now
// happens in spring and the haul in autumn, with a player decision between
// them, so that composite can no longer be run in one call. The dependent pair
// did not disappear, it moved one link down the chain: haul, then sell what
// reached the port.
const supply        = seqC(transport, trade);
const build         = productC(tractorWorks, armaments,       //  x  one steel, one contract
  // The policy reads the decision off the shape: the side that was offered
  // the steel is the side that answers.
  ({ a }) => (a.steel > 0 ? "a" : "b"));

export const flowLabel = `${supply.label} ; ${build.label}`;

// ── The Plan's own state ──────────────────────────────────────────────
/** What spring committed and autumn has yet to dispose of. */
interface Pending {
  workforce: Workforce;
  take: number;
  harvest: HarvestReport;
  smelt: SmeltReport;
  rail: RailReport;
  stateGrain: number;
  villageGrain: number;
  indMouths: number;
}

interface Game {
  year: number;
  season: "spring" | "autumn";
  pending: Pending | null;
  /** The quota is a STANDING decree, not an annual negotiation. It was per-turn
   *  when a year was one turn, which was harmless then: labour and quota went
   *  out in the same order. Splitting the year made them compete for the same
   *  spring slot, and squeezing the villages became strictly dominated — you
   *  could set a total quota or staff the mill, never both, so the grain you
   *  took had nothing to smelt with. Carrying it forward restores the choice
   *  the game is built around, and matches how procurement actually worked:
   *  a decree stands until another decree replaces it. */
  procurement: Procurement;
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
  season: "spring",
  pending: null,
  procurement: "firm",
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
      // Nothing to decide: steel in hand is the point of the plan.
      const c = steelPlan("surplus", "none");
      return { choice: c.choice, refused: want !== "none" };
    }
  }
}

/** Spring. You commit the hands and fix the quota BEFORE you know what the
 *  weather will do — which is not a game mechanic, it is what a quota is. A
 *  procurement set in March against a harvest that fails in August is the
 *  whole of how a famine is administered. */
export interface SowOrder {
  procurement: Procurement;
  labour: { fields: number; drivers: number; mill: number; rail: number };
}

/** Autumn. The harvest is in and graded, and now you dispose of it. Every
 *  decision here is made knowing what spring's gamble returned. */
export interface ReapOrder {
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
  | { tag: "Sow"; order: SowOrder }
  | { tag: "Reap"; order: ReapOrder }
  | { tag: "Status" }
  | { tag: "Reckoning" };

/** SPRING. Commit the hands, fix the quota, and let the year happen. The
 *  tensor runs here — fields, mill and railway all work through the season and
 *  all three owe a report — and what comes back is the news you will have to
 *  dispose of in autumn. You do not get to see it first. */
async function runSpring(order: SowOrder, depth: number) {
  const year = game.year;
  const s = game.stocks;

  const alive = living(game.workforce);
  const l = order.labour;
  const asked = l.fields + l.drivers + l.mill + l.rail;
  const k = asked > 0 ? alive / asked : 0;
  // Flooring four shares independently loses up to three people a year, and
  // they never come back. Whatever the rounding drops goes to the fields.
  const w: Workforce = {
    fields: Math.floor(l.fields * k), drivers: Math.floor(l.drivers * k),
    mill: Math.floor(l.mill * k), rail: Math.floor(l.rail * k),
    dead: game.workforce.dead,
  };
  w.fields += alive - (w.fields + w.drivers + w.mill + w.rail);
  game.workforce = w;

  // ── TENSOR: the three sectors work at once and all three owe a report.
  trace(depth, "down", "gosplan", produce.label);
  const railSteel = Math.min(s.steel, w.rail * RULES.railPerWorker * RULES.railSteelCost);
  const produced = await produce.run(
    produce.both(
      fieldsAndMill.both(
        { tag: "Harvest", workforce: w, tractors: s.tractors, year },
        { tag: "Smelt", workers: w.mill, millCapacity: s.millCapacity, year },
      ),
      { tag: "Lay", workers: w.rail, steel: railSteel, year },
    ),
    depth,
  );
  const harvest = produced.left.left;
  const smelt = produced.left.right;
  const rail = produced.right;

  s.steel = round(s.steel - rail.steelUsed + smelt.steel);
  s.railCapacity = round(s.railCapacity + rail.added);

  game.procurement = order.procurement;
  const take = RULES.procurement[game.procurement];
  const stateGrain = round(harvest.grain * take + s.grain);
  const villageGrain = round(harvest.grain * (1 - take));

  game.pending = {
    workforce: w, take, harvest, smelt, rail, stateGrain, villageGrain,
    indMouths: w.mill + w.rail,
  };
  game.season = "autumn";
  return {
    kind: "sown" as const, year, harvest,
    steel: s.steel, steelPosition: gradeSteel(smelt.steel, RULES.steelCommitment),
    railAdded: rail.added, stateGrain, villageGrain,
    /** What the quota, fixed in spring, has left the villages against what
     *  they need to eat. This is the number that kills people. */
    villageShortfall: round(Math.max(0, (w.fields + w.drivers) * RULES.eats - villageGrain)),
    workforce: w, stocks: { ...s },
  };
}

/** AUTUMN. The grain is in and graded; now it is disposed of. Which export
 *  decisions exist at all was settled by the grade — see `resolveExport` — so
 *  this is where the harvest's fibre does its work. */
async function runAutumn(order: ReapOrder, depth: number): Promise<YearReport> {
  const pend = game.pending;
  if (pend === null) throw new Error("autumn before spring");
  const year = game.year;
  const s = game.stocks;
  const { workforce: w, harvest, smelt, rail, stateGrain, villageGrain, indMouths } = pend;

  const exp = resolveExport(harvest.grade, order.exportGrain);
  const offerPort = exp.choice === "none" ? 0
    : exp.choice === "surplus" ? Math.max(0, stateGrain - indMouths)
    : exp.choice === "full" ? stateGrain * 0.6
    : stateGrain * 0.9;

  // The sequential composition, run. The composite shape is a first prompt
  // TOGETHER WITH a function choosing the second from the first's reply: how
  // much grain to offer the port is decided by how much the railway got there,
  // and `next` is where that is applied. What the trade delegation is asked is
  // therefore not knowable when the haul is dispatched.
  let sold: SaleReport = { gold: 0, price: 0, sold: 0 };
  let buyGrain = 0;
  const committed = RULES.steelCommitment;
  const st = resolveSteel(smelt.steel, committed, order.tradeSteel);

  const supplied = await supply.run(
    supply.step(
      { tag: "Haul" as const, railCapacity: s.railCapacity, available: round(stateGrain),
        needIndustry: indMouths, offerPort: round(offerPort), year },
      (moved) => {
        // Buying steel abroad spends grain that reached the port, so it is
        // capped by the haul and not by the harvest.
        buyGrain = st.choice === "buy"
          ? Math.min(moved.toPort, round(stateGrain * 0.15)) : 0;
        return { tag: "SellGrain" as const,
                 grain: round(Math.max(0, moved.toPort - buyGrain)), year };
      },
    ),
    depth,
  );
  const haul = supplied.first;      // typed a HaulReport, uncast
  sold = supplied.second;           // typed a SaleReport, uncast

  let importedTractors = 0;
  let gold = 0, grainExported = 0, steelImported = 0;

  if (buyGrain > 0) {
    const bought = await trade.run({ tag: "BuySteel", grain: buyGrain, year }, depth);
    s.steel = round(s.steel + bought.steel);
    steelImported = bought.steel;
    grainExported += bought.grainUsed;
  }
  // Grain is the only thing that leaves the country. Steel used to be
  // sellable, and the port sale was a product when the railway was narrow
  // (grain OR steel) and a tensor when it was wide (both). Selling steel is
  // gone — a plan that exports its steel is not industrialising — and with it
  // those two demonstrations, rather than leave them running on a quantity
  // that is now always zero.
  gold += sold.gold;
  grainExported += sold.sold;

  s.gold = round(s.gold + gold);

  if (order.buy === "tractors" && s.gold > 0) {
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
  trace(depth, "down", "gosplan", build.label);
  // The works must open BEFORE the build, not after it. Opening it afterwards
  // was an ordering bug with two heads. First, `build` spends ALL the steel,
  // so by the time the old check ran there was never 20 left and the works
  // only ever opened in a year whose build happened to consume nothing —
  // which is to say, in a year you asked for tractors and had no works to
  // make them in. Second, a works that opens after the build cannot produce
  // in the year it opens, so the plant was always a year later than it looked.
  // Both disappear if the plant takes its steel first, which is also the
  // sensible reading: you build the factory, then you run it.
  if (s.plantCapacity === 0 && s.engineers > 0 && s.steel >= RULES.plantSteel) {
    s.steel = round(s.steel - RULES.plantSteel);
    s.plantCapacity = RULES.plantCapacity;
  }

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
    if (made.side === "a") {
      tractorsBuilt = made.value.built;
      s.tractors += made.value.built;
      s.steel = round(s.steel - made.value.steelUsed);
    } else {
      s.warReserve = round(s.warReserve + made.value.reserved);
      s.steel = round(s.steel - made.value.steelUsed);
    }
  }

  const winter = await agri.run({
    tag: "Winter", ruralRations: villageGrain,
    industrialRations: haul.toIndustry, year,
  }, depth);

  const dead = winter.dead;
  const shrink = (nn: number, loss: number, pool: number) =>
    pool <= 0 ? nn : Math.max(0, nn - Math.round(loss * (nn / pool)));
  const ruralPool = w.fields + w.drivers;
  const indPool = w.mill + w.rail;
  game.workforce = {
    fields: shrink(w.fields, winter.starvedRural, ruralPool),
    drivers: shrink(w.drivers, winter.starvedRural, ruralPool),
    mill: shrink(w.mill, winter.starvedIndustrial, indPool),
    rail: shrink(w.rail, winter.starvedIndustrial, indPool),
    dead: w.dead + dead,
  };

  // Grain the railway could not move ROTS. It was reported as "left at the
  // sidings" and then quietly kept on the books, which made the railway
  // optional: you could requisition a mountain and collect it later. It is
  // the railway that turns a harvest into a resource, so procurement without
  // track is not thrift, it is a heap of grain going bad in a field.
  s.grain = round(Math.max(0,
    stateGrain - haul.toIndustry - grainExported - haul.stranded));
  if (game.baselineOutput === 0) game.baselineOutput = harvest.grain;

  const notes: string[] = [
    (await agri.run({ tag: "Report", year }, depth)).note,
    (await smelter.run({ tag: "Report", year }, depth)).note,
    (await transport.run({ tag: "Report", year }, depth)).note,
  ];
  game.dispatches.push(...notes);

  const report: YearReport = {
    year, harvest, steel: s.steel, importedTractors,
    steelPosition: gradeSteel(smelt.steel, committed),
    tractorsBuilt, railAdded: rail.added, goldEarned: gold,
    grainExported: round(grainExported), steelExported: 0, steelImported,
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
  game.pending = null;
  game.season = "spring";
  game.year += 1;
  if (game.history.length >= RULES.years) game.over = true;
  return report;
}

// ── The Books interface of the game ───────────────────────────────────
export type GosReply =
  | { kind: "sown"; [k: string]: unknown }
  | YearReport
  | { kind: "status"; year: number; season: "spring" | "autumn"; over: boolean;
      stocks: Stocks; workforce: Workforce; believed: number; baseline: number;
      harvest: HarvestReport | null; villageGrain: number; villageShortfall: number;
      procurement: Procurement; steelPosition: SteelPosition }
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
      return { kind: "status", year: game.year, season: game.season, over: false,
               stocks: game.stocks, workforce: game.workforce, believed: 0, baseline: 0,
               harvest: null, villageGrain: 0, villageShortfall: 0,
               procurement: game.procurement,
               steelPosition: gradeSteel(game.stocks.steel, RULES.steelCommitment) };
    case "Sow":
      if (game.over) throw new Error("the plan is concluded; call reckoning");
      if (game.season !== "spring") throw new Error("it is autumn; the harvest is in and must be disposed of");
      return await runSpring(p.order, depth);
    case "Reap":
      if (game.over) throw new Error("the plan is concluded; call reckoning");
      if (game.season !== "autumn") throw new Error("it is spring; nothing has been sown yet");
      return await runAutumn(p.order, depth);
    case "Status":
      return { kind: "status", year: game.year, season: game.season, over: game.over,
               stocks: game.stocks, workforce: game.workforce,
               believed: game.reportedGrain, baseline: game.baselineOutput,
               // The standing quota, so a spring menu can keep it rather than
               // silently reverting to "firm" every turn.
               procurement: game.procurement,
               // In autumn this is a FACT — the smelting has already run. A
               // menu that predicts it from mill workers instead is resolving
               // its gate against a number the game has moved past, which is
               // the stale-gate bug this file has produced three times.
               steelPosition: game.pending
                 ? gradeSteel(game.pending.smelt.steel, RULES.steelCommitment)
                 : gradeSteel(game.stocks.steel, RULES.steelCommitment),
               // Autumn needs to know what came in before it can be disposed of.
               harvest: game.pending?.harvest ?? null,
               villageGrain: game.pending?.villageGrain ?? 0,
               villageShortfall: game.pending
                 ? round(Math.max(0, (game.pending.workforce.fields + game.pending.workforce.drivers)
                     * RULES.eats - game.pending.villageGrain))
                 : 0 };
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
    case "Sow": {
      const o = u.order;
      if (!isRecord(o) || !isProcurement(o.procurement)) return null;
      const l = o.labour;
      if (!isRecord(l)) return null;
      for (const k of ["fields", "drivers", "mill", "rail"]) {
        if (!isNum(l[k])) return null;
      }
      return { tag: "Sow", order: {
        procurement: o.procurement,
        labour: { fields: l.fields as number, drivers: l.drivers as number,
                  mill: l.mill as number, rail: l.rail as number },
      } };
    }
    case "Reap": {
      const o = u.order;
      if (!isRecord(o) || !isStr(o.exportGrain) || !isStr(o.tradeSteel)) return null;
      if (o.buy !== "engineers" && o.buy !== "tools" && o.buy !== "tractors" &&
          o.buy !== "nothing") return null;
      if (o.build !== "tractors" && o.build !== "armaments") return null;
      return { tag: "Reap", order: {
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
