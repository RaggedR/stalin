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
}

/** Where the workforce is. Only `dead` is a loss; the rest is the transition
 *  the whole plan is for. */
export interface Workforce {
  fields: People;
  drivers: People;   // a tractor without a driver is a monument
  mill: People;
  rail: People;
  dead: People;
}

export const living = (w: Workforce): People =>
  w.fields + w.drivers + w.mill + w.rail;
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
  /** What a tonne of steel is worth as armaments. Not a tonne: guns need
   *  tooling, machining and swarf, and an ingot is not a rifle. At one to one
   *  a plan that spent only its last two years arming still ended lavishly
   *  equipped, and the war cost it nothing — which is not what being short of
   *  steel is supposed to feel like. */
  armamentYield: 0.5,

  /** The steel the plan has already promised elsewhere — rail upkeep and the
   *  tractor works — against which a stock is judged deficit, balanced or
   *  surplus. It is what makes 1928 an importing year: you begin below it, so
   *  the only steel trade that exists is `buy`. */
  steelCommitment: 15.0,
  // Armaments: steel straight into the reserve, and men who must be trained
  // for years before they are soldiers rather than peasants holding rifles.
  warYear: 1941,
  plantSteel: 20.0,
  plantRail: 10.0,
  plantCapacity: 20,      // tractors per year per plant

  engineerGold: 15,
  /** A tractor bought abroad, ready to drive. Expensive against building your
   *  own (2 steel), and it buys no capacity — but it needs no engineer, no
   *  mill and no works, so it is the only mechanisation available in the first
   *  years. The Fordsons came in by the thousand before Stalingrad opened. */
  tractorGold: 10,
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
    // What one soldier is worth with nothing to fire. This is the number that
    // decides whether men alone can win. Too low and a well-fed, lightly-armed
    // country loses outright, which forces every player down the armaments
    // road and collapses the game to one strategy. Set here so that a large
    // population CAN win on numbers — and pays for it in bodies.
    manPower: 0.8,
    steelPower: 1.2,          // power added by steel
    // How far materiel can stand in for men. This number decides whether the
    // game is a morality play. Capped at 1, a famine is strategically fatal —
    // cruelty punished by defeat, which is comfortable and false. Set high
    // enough, a small lavishly-equipped army wins, and starving the villages
    // becomes what it actually was: a way to win the war that cost more lives
    // than the alternative. The game keeps the body count and passes no
    // judgement on it.
    maxSubstitution: 2.0,
    baseAttrition: 0.55,      // fraction lost with no steel at all
    steelShield: 0.9,         // how fast attrition falls as steel per man rises
  },
} as const;

export interface WarOutcome {
  won: boolean;
  mobilised: People;
  available: People;
  steelPerSoldier: number;
  attrition: number;
  fallen: People;
}

/** The reckoning of 1941.
 *
 *  You never conscript during the plan. When the war comes the country calls
 *  up exactly as many men as it takes to reach the enemy's strength, given the
 *  armaments it has — and no more. So the armaments decide the size of the
 *  army, and the size of the army decides the dead.
 *
 *  Power is  m · manPower + steelPower · min(W, m · maxSubstitution):  each man
 *  is worth something on his own, and worth more up to the point where he is
 *  fully equipped. Solving for the smallest m that reaches the threshold gives
 *  two regimes — steel-rich, where a small lavish army suffices, and steel-poor,
 *  where the shortfall is made up in bodies. If even the whole available
 *  manpower cannot reach it, the war is lost.
 */
export function fightWar(survivors: People, warReserve: Steel): WarOutcome {
  const w = RULES.war;
  const available = Math.max(1, Math.floor(survivors * w.mobilisableFraction));
  const E = w.enemyPower;

  // Regime 1: enough steel to equip everyone called up.
  const lavish = E / (w.manPower + w.steelPower * w.maxSubstitution);
  // Regime 2: the steel runs out, and the rest is made up in men.
  const lean = (E - w.steelPower * warReserve) / w.manPower;
  const needed = lavish <= warReserve / w.maxSubstitution ? lavish : lean;

  const mobilised = Math.max(1, Math.ceil(needed));
  const won = mobilised <= available;
  const called = won ? mobilised : available;
  const steelPerSoldier = warReserve / called;
  const attrition = Math.min(
    1, w.baseAttrition / (1 + w.steelShield * Math.min(steelPerSoldier, 1.5)),
  );
  // A war lost is not a war with fewer casualties.
  const fallen = won ? Math.round(called * attrition) : called;
  return { won, mobilised: called, available, steelPerSoldier, attrition, fallen };
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

export function asStocks(u: unknown): Stocks | null {
  if (!isRecord(u)) return null;
  const keys = ["grain", "steel", "gold", "tractors", "engineers",
                "railCapacity", "millCapacity", "plantCapacity",
                "warReserve"] as const;
  const out = {} as Stocks;
  for (const k of keys) {
    if (!isNum(u[k])) return null;
    out[k] = u[k];
  }
  return out;
}

export function asWorkforce(u: unknown): Workforce | null {
  if (!isRecord(u)) return null;
  const keys = ["fields", "drivers", "mill", "rail", "dead"] as const;
  const out = {} as Workforce;
  for (const k of keys) {
    if (!isNum(u[k])) return null;
    out[k] = u[k];
  }
  return out;
}
