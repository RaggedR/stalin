// state.ts — the domain, and the grades the Plan thinks in.
//
// Everything the game must reason about at the TYPE level is discretised into
// a finite union. That is not a stylistic choice: the container algebra next
// door gives Sigma-types over finite index sets only, so a rule expressed over
// a grade can be typed, and the same rule expressed over a tonnage cannot.
//
// It is also how the apparatus actually worked. Quotas were set against
// reported categories, not measured tonnes.

// ── Quantities: the things the simulation counts ──────────────────────
export type Grain = number;   // one unit feeds one worker-unit for one year
export type Steel = number;
export type Gold = number;
export type People = number;  // worker-units

export interface Stocks {
  grain: Grain;
  steel: Steel;
  gold: Gold;
  tractors: number;
  engineers: number;
  railCapacity: number;   // grain-units movable per year (to industry + port)
  millCapacity: number;   // steel-units producible per year
  plantCapacity: number;  // tractors buildable per year
  warReserve: Steel;      // steel put by for armaments — returns NOTHING
  cadre: People;          // accumulated army-years: men who have been trained
}

/** Where the workforce is. Only `dead` is a loss; the rest is the transition
 *  the whole plan is for. */
export interface Workforce {
  fields: People;
  drivers: People;   // a tractor without a driver is a monument
  mill: People;
  rail: People;
  army: People;      // eat, produce nothing, and are the only hedge on 1941
  dead: People;
}

export const living = (w: Workforce): People =>
  w.fields + w.drivers + w.mill + w.rail + w.army;
export const rural = (w: Workforce): People => w.fields + w.drivers;
export const industrial = (w: Workforce): People => w.mill + w.rail;

// ── Grades: the finite indices that make the rules typeable ───────────

/** What the fields returned. The first half of `harvest <| trade`: which
 *  export shapes exist at all is decided by this. */
export type HarvestGrade = "failure" | "poor" | "adequate" | "bumper";
export const HARVEST_GRADES: HarvestGrade[] = ["failure", "poor", "adequate", "bumper"];

/** Where the country stands on steel. The first half of `assess <| trade`,
 *  and the arc of the whole game: you begin in deficit and buy, you end in
 *  surplus and sell. */
export type SteelPosition = "deficit" | "balanced" | "surplus";

/** The verdict on 1941, projected from where the plan leaves the country.
 *  Part II is not built; the DEADLINE is, because knowing it is coming is what
 *  makes the 1928 decision hard. Steel spent on armaments returns nothing at
 *  all unless the date is real. */
export type Readiness = "defenceless" | "vulnerable" | "prepared";

/** How hard grain is taken from the villages. */
export type Procurement = "light" | "firm" | "total";

/** What the trade delegation may carry. `narrow` is one contract — a product,
 *  offer both and answer one. `wide` is enough throughput to the port to ship
 *  both — a tensor. Rail capacity decides which. */
export type Throughput = "narrow" | "wide";

// ── The constants the economy runs on ─────────────────────────────────
export const RULES = {
  startYear: 1928,
  years: 5,

  fieldYield: 2.6,        // grain per field worker
  tractorYield: 6.0,      // grain per operated tractor (needs one driver)
  eats: 1.0,              // grain per living worker-unit per year

  millPerWorker: 3.0,     // steel per mill worker, capped by millCapacity
  engineerCapacity: 25,   // mill capacity unlocked per engineer
  railPerWorker: 2.0,     // rail capacity built per rail worker...
  railSteelCost: 0.5,     // ...costing this much steel per capacity unit

  tractorSteel: 2.0,
  // Armaments: steel straight into the reserve, and men who must be trained
  // for years before they are soldiers rather than peasants holding rifles.
  warQuota: 40,           // reserve below which the war is simply lost
  cadreQuota: 10,         // army-years below which the troops are raw
  warYear: 1941,
  plantSteel: 20.0,
  plantRail: 10.0,
  plantCapacity: 20,      // tractors per year per plant

  engineerGold: 15,
  toolsGold: 25,          // machine tools: +10 plant capacity, no upkeep

  grainPerGold: 3.0,      // grain sold to buy one gold
  steelPerGold: 2.0,      // steel is worth twice grain — the point of the arc
  grainPerSteelImport: 5.0, // buying steel abroad is a bad deal, deliberately

  wideThroughput: 90,     // rail capacity at which the trade becomes a tensor

  // What the state takes; the remainder is what the village eats. `total` is
  // meant to be what it says: at this rate the countryside does not feed
  // itself, and the arithmetic of that is the point of the game.
  procurement: { light: 0.15, firm: 0.33, total: 0.65 } as Record<Procurement, number>,

  // ── 1941 ────────────────────────────────────────────────────────────
  // The war is one computation, not a campaign. Steel and men are
  // SUBSTITUTES: the same victory can be bought with more of one or more of
  // the other, and the price of the second is paid in lives. Everything the
  // plan does is ultimately a decision about which currency to pay in.
  war: {
    mobilisableFraction: 0.5, // the rest must farm, or the army starves too
    enemyPower: 70,
    manPower: 0.5,            // power of one soldier with nothing to fire
    steelPower: 1.2,          // power added by steel, up to one unit per man
    baseAttrition: 0.55,      // fraction lost with no steel at all
    steelShield: 0.9,         // how fast attrition falls as steel per man rises
    rawPenalty: 0.35,         // extra attrition for an untrained army
  },
} as const;

export interface WarOutcome {
  won: boolean;
  mobilised: People;
  steelPerSoldier: number;
  power: number;
  required: number;
  attrition: number;
  fallen: People;
  trained: boolean;
}

/** The reckoning of 1941. Note where the two halves of the game meet: the
 *  manpower pool is the population that SURVIVED the plan, so every peasant
 *  starved to make steel is also a soldier absent from the line. The trade-off
 *  is not between two independent quantities; pushing on one degrades the
 *  other, which is what puts the optimum in the interior. */
export function fightWar(survivors: People, warReserve: Steel, cadre: People): WarOutcome {
  const w = RULES.war;
  const mobilised = Math.max(1, Math.floor(survivors * w.mobilisableFraction));
  const steelPerSoldier = warReserve / mobilised;
  const equipped = Math.min(steelPerSoldier, 1);
  const power = mobilised * (w.manPower + w.steelPower * equipped);
  const trained = cadre >= RULES.cadreQuota;
  // Steel buys lives back, but not without limit: past about a rifle and a
  // half per man, more steel in the depot saves nobody. Hoarding is not a
  // substitute for having an army.
  const useful = Math.min(steelPerSoldier, 1.5);
  const attrition = Math.min(
    1,
    (w.baseAttrition / (1 + w.steelShield * useful)) * (trained ? 1 : 1 + w.rawPenalty),
  );
  const won = power >= w.enemyPower;
  // A war lost is not a war with fewer casualties.
  const fallen = won ? Math.round(mobilised * attrition) : mobilised;
  return { won, mobilised, steelPerSoldier, power, required: w.enemyPower,
           attrition, fallen, trained };
}

// ── The grade of a harvest, from the tonnage and the mouths ───────────
export function gradeHarvest(grain: Grain, mouths: People): HarvestGrade {
  const ratio = mouths <= 0 ? 99 : grain / mouths;
  if (ratio < 1.0) return "failure";
  if (ratio < 1.5) return "poor";
  if (ratio < 2.2) return "adequate";
  return "bumper";
}

export function gradeSteel(steel: Steel, committed: Steel): SteelPosition {
  if (steel < committed) return "deficit";
  if (steel < committed * 1.5) return "balanced";
  return "surplus";
}

export const throughputOf = (railCapacity: number): Throughput =>
  railCapacity >= RULES.wideThroughput ? "wide" : "narrow";

/** The verdict is the WORSE of steel and men: a reserve nobody is trained to
 *  use is a stockpile, and a cadre with nothing to fire is a parade. */
export function gradeReadiness(warReserve: Steel, cadre: People): Readiness {
  const steelGrade: Readiness = warReserve >= RULES.warQuota
    ? "prepared"
    : warReserve >= RULES.warQuota / 3 ? "vulnerable" : "defenceless";
  const menGrade: Readiness = cadre >= RULES.cadreQuota
    ? "prepared"
    : cadre >= RULES.cadreQuota / 3 ? "vulnerable" : "defenceless";
  const rank = { defenceless: 0, vulnerable: 1, prepared: 2 };
  return rank[steelGrade] <= rank[menGrade] ? steelGrade : menGrade;
}

// ── A deterministic generator, so a playthrough is a regression test ──
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

// ── Validators, for the wire ──────────────────────────────────────────
export const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);
export const isNum = (u: unknown): u is number =>
  typeof u === "number" && Number.isFinite(u);
export const isStr = (u: unknown): u is string => typeof u === "string";

export const isHarvestGrade = (u: unknown): u is HarvestGrade =>
  u === "failure" || u === "poor" || u === "adequate" || u === "bumper";
export const isSteelPosition = (u: unknown): u is SteelPosition =>
  u === "deficit" || u === "balanced" || u === "surplus";
export const isProcurement = (u: unknown): u is Procurement =>
  u === "light" || u === "firm" || u === "total";
export const isReadiness = (u: unknown): u is Readiness =>
  u === "defenceless" || u === "vulnerable" || u === "prepared";

export function asStocks(u: unknown): Stocks | null {
  if (!isRecord(u)) return null;
  const keys = ["grain", "steel", "gold", "tractors", "engineers",
                "railCapacity", "millCapacity", "plantCapacity",
                "warReserve", "cadre"] as const;
  const out = {} as Stocks;
  for (const k of keys) {
    if (!isNum(u[k])) return null;
    out[k] = u[k];
  }
  return out;
}

export function asWorkforce(u: unknown): Workforce | null {
  if (!isRecord(u)) return null;
  const keys = ["fields", "drivers", "mill", "rail", "army", "dead"] as const;
  const out = {} as Workforce;
  for (const k of keys) {
    if (!isNum(u[k])) return null;
    out[k] = u[k];
  }
  return out;
}
