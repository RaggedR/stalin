// containers.ts — the five interfaces of the command economy, as their graphs.
//
// Each server below is a container (P, R): a type of prompts the Plan may
// issue, and for each prompt the type of report that answers it. Written as a
// union of fibres, exactly as in ../tower/algebra.ts.

import type { Fib } from "./lib/algebra.ts";
import type {
  Grain, HarvestGrade, People, Procurement, Readiness, Steel,
  SteelPosition, Stocks, Workforce,
} from "./state.ts";

// ── Reports ───────────────────────────────────────────────────────────
export interface HarvestReport {
  grain: Grain;
  grade: HarvestGrade;
  perWorker: number;
  /** What the SAME rural workforce would have reaped with no tractors at all.
   *  The counterfactual the whole plan is judged against. */
  withoutTractors: Grain;
}
export interface WinterReport {
  fed: People;
  starvedRural: People;
  starvedIndustrial: People;
  dead: People;
  shortfall: Grain;
}
export interface SmeltReport { steel: Steel; idleCapacity: number }
export interface TractorReport { built: number; steelUsed: Steel }
export interface ArmamentReport { reserved: Steel; steelUsed: Steel }
export interface RailReport { added: number; steelUsed: Steel }
export interface HaulReport { toIndustry: Grain; toPort: Grain; stranded: Grain; short: Grain }
export interface SaleReport { gold: number; price: number; sold: number }
export interface PurchaseReport { steel: Steel; grainUsed: Grain }

/** What a commissariat says. Identical in TYPE to what is true. */
export interface Dispatch {
  year: number;
  quotaMet: boolean;
  output: number;
  note: string;
}
/** What is true. Same shape. The reckoning prints both columns. */
export interface CensusReturn {
  workforce: Workforce;
  stocks: Partial<Stocks>;
  trueOutput: number;
}

// ── The gates: which moves EXIST, as a function of a grade ────────────
//
// This is the rule the type system is asked to carry. `ExportChoice<G>` is a
// conditional type over a finite union, so it computes: after a failed harvest
// the only export shape that exists is "none", and `exportPlan("failure",
// "full")` is not a move that can be rejected — it is a move that cannot be
// written down. See type-tests.ts.

export type ExportChoice<G extends HarvestGrade> =
  G extends "failure" ? "none"
  : G extends "poor" ? "none" | "surplus"
  : G extends "adequate" ? "none" | "surplus" | "full"
  : "none" | "surplus" | "full" | "maximum";

/** The same trick on the game's central arc. You may buy steel only while in
 *  deficit and sell it only in surplus, so the transition from importing steel
 *  to exporting it is a change of FIBRE, not an `if`. */
export type SteelTrade<P extends SteelPosition> =
  P extends "deficit" ? "none" | "buy"
  : P extends "balanced" ? "none"
  : "none" | "sell";

/** Introduction rule for a grain-export decision. `G` is inferred from the
 *  grade, so `choice` is contextually typed at that grade alone. */
export function exportPlan<G extends HarvestGrade>(
  grade: G,
  choice: ExportChoice<G>,
): { grade: G; choice: ExportChoice<G> } {
  return { grade, choice };
}

export function steelPlan<P extends SteelPosition>(
  position: P,
  choice: SteelTrade<P>,
): { position: P; choice: SteelTrade<P> } {
  return { position, choice };
}

// ── Agriculture (:8802) ───────────────────────────────────────────────
export type AgricultureC =
  | Fib<{ tag: "Harvest"; workforce: Workforce; tractors: number; year: number },
        HarvestReport>
  | Fib<{ tag: "Winter"; ruralRations: Grain; industrialRations: Grain; year: number }, WinterReport>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>;

// ── Heavy industry (:8803) ────────────────────────────────────────────
export type SmelterC =
  | Fib<{ tag: "Smelt"; workers: People; millCapacity: number; year: number }, SmeltReport>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>;

/** The two sides of the game's central product. Same steel, one contract. */
export type TractorWorksC =
  Fib<{ tag: "BuildTractors"; steel: Steel; plantCapacity: number; year: number }, TractorReport>;
export type ArmamentsC =
  Fib<{ tag: "BuildArmaments"; steel: Steel; year: number }, ArmamentReport>;

// ── Transport (:8804) ─────────────────────────────────────────────────
export type TransportC =
  | Fib<{ tag: "Lay"; workers: People; steel: Steel; year: number }, RailReport>
  | Fib<{ tag: "Haul"; railCapacity: number; available: Grain; needIndustry: Grain; offerPort: Grain; year: number }, HaulReport>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>;

// ── Foreign trade (:8805) ─────────────────────────────────────────────
// The two sale containers are separate so the trade can be a PRODUCT when the
// railway to the port is narrow (one contract, offer both answer one) and a
// TENSOR when it is wide (ship both). Rail capacity decides which — §5's own
// distinction between x and (x), used as a game progression.
export type GrainSaleC =
  Fib<{ tag: "SellGrain"; grain: Grain; year: number }, SaleReport>;
export type SteelSaleC =
  Fib<{ tag: "SellSteel"; steel: Steel; year: number }, SaleReport>;

export type ForeignTradeC =
  | GrainSaleC
  | SteelSaleC
  | Fib<{ tag: "BuySteel"; grain: Grain; year: number }, PurchaseReport>
  | Fib<{ tag: "Hire"; gold: number; want: "engineers" | "tools"; year: number },
        { engineers: number; plantCapacity: number; goldUsed: number }>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>;

// ── The verdict on 1941 ───────────────────────────────────────────────
export interface Verdict {
  readiness: Readiness;
  warReserve: Steel;
  cadre: People;
  quota: Steel;
  projectedYear: number | null;
}

// ── The year's report, amalgamated at the top ─────────────────────────
export interface YearReport {
  year: number;
  harvest: HarvestReport;
  steel: Steel;
  steelPosition: SteelPosition;
  tractorsBuilt: number;
  railAdded: number;
  goldEarned: number;
  grainExported: Grain;
  steelExported: Steel;
  steelImported: Steel;
  dead: People;
  workforce: Workforce;
  stocks: Stocks;
  dispatches: string[];
}
