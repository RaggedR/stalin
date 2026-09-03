// containers.ts — the five interfaces of the command economy, as their graphs.
//
// Each server below is a container (P, R): a type of prompts the Plan may
// issue, and for each prompt the type of report that answers it. Written as a
// union of fibres, exactly as in ../tower/algebra.ts.

import type { Fib } from "./lib/algebra.ts";
import type {
  Grain, HarvestGrade, People, Steel,
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
export interface ImportReport { tractors: number; goldUsed: number }

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
 *  deficit. Steel is never sold — it is the thing the whole plan exists to
 *  accumulate, and a country that sells it is not industrialising. Which
 *  choices EXIST is therefore a change of FIBRE, not an `if`: in balance and
 *  in surplus there is simply nothing to decide. */
export type SteelTrade<P extends SteelPosition> =
  P extends "deficit" ? "none" | "buy"
  : "none";

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
/** Every commissariat can be told to forget. Without this, `stalin new` resets
 *  only the Plan's own ledger while the commissariats carry their weather
 *  stream, their books and their accumulated lies into the next game — so two
 *  games on one server are not comparable, which makes both playtesting and
 *  any search over strategies meaningless. */
export interface ResetAck { ok: boolean }

export type AgricultureC =
  | Fib<{ tag: "Harvest"; workforce: Workforce; tractors: number; year: number },
        HarvestReport>
  | Fib<{ tag: "Winter"; ruralRations: Grain; industrialRations: Grain; year: number }, WinterReport>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>
  | Fib<{ tag: "Reset"; seed: number }, ResetAck>;

// ── Heavy industry (:8803) ────────────────────────────────────────────
export type SmelterC =
  | Fib<{ tag: "Smelt"; workers: People; millCapacity: number; year: number }, SmeltReport>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>
  | Fib<{ tag: "Reset"; seed: number }, ResetAck>;

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
  | Fib<{ tag: "Census" }, CensusReturn>
  | Fib<{ tag: "Reset"; seed: number }, ResetAck>;

// ── Foreign trade (:8805) ─────────────────────────────────────────────
// Grain is the only thing that leaves the country. There were two sale
// containers once, so that the port could be a PRODUCT when the railway to it
// was narrow (one contract: offer both, answer one) and a TENSOR when it was
// wide (ship both) — rail capacity choosing between the two. Selling steel is
// gone, so both collapsed to this single fibre rather than run on a quantity
// that is always zero.
export type ForeignTradeC =
  | Fib<{ tag: "SellGrain"; grain: Grain; year: number }, SaleReport>
  | Fib<{ tag: "BuySteel"; grain: Grain; year: number }, PurchaseReport>
  | Fib<{ tag: "Hire"; gold: number; want: "engineers" | "tools"; year: number },
        { engineers: number; plantCapacity: number; goldUsed: number }>
  | Fib<{ tag: "BuyTractors"; gold: number; year: number }, ImportReport>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Census" }, CensusReturn>
  | Fib<{ tag: "Reset"; seed: number }, ResetAck>;

/** Foreign tractors again, alone. Same port and same handler as the fibre
 *  above, split out as a container of its own for exactly the reason
 *  `TractorWorksC` and `ArmamentsC` are split out of heavy industry: a
 *  combinator takes two containers, so a thing that is to be one side of a
 *  composite must be a container and not a fibre of a larger one. This is the
 *  right-hand summand of the routing decision in `gosplan.server.ts`. */
export type ImportC =
  Fib<{ tag: "BuyTractors"; gold: number; year: number }, ImportReport>;

// ── The commissar for tractor policy (:8806) ──────────────────────────
/** What the commissar answers when asked where tractors should come from.
 *
 *  The field `recommend` is one of three words and nothing in the system
 *  enforces that. This container is served by a process that spawns the
 *  `claude` binary, so its reply is written by a language model, arrives as
 *  text, and is a position of this container only because the decoder in
 *  `gosplan.server.ts` says so. The field `note` is prose. It is worth exactly
 *  what the dispatches are worth, which is nothing.
 *
 *  This is the untyped oracle of the note, made executable. Every other
 *  commissariat could in principle be trusted because a person wrote its
 *  arithmetic. This one cannot, and the decoder is the only place that
 *  difference is ever checked. */
export interface Advice {
  recommend: "tractors" | "armaments" | "buy";
  note: string;
}

export type CommissarC =
  | Fib<{ tag: "Advise"; year: number; steel: Steel; gold: number;
          tractors: number; warReserve: Steel }, Advice>
  | Fib<{ tag: "Report"; year: number }, Dispatch>
  | Fib<{ tag: "Reset"; seed: number }, ResetAck>;

// ── The verdict on 1941 ───────────────────────────────────────────────
// ── The year's report, amalgamated at the top ─────────────────────────
export interface YearReport {
  year: number;
  harvest: HarvestReport;
  steel: Steel;
  steelPosition: SteelPosition;
  tractorsBuilt: number;
  importedTractors: number;
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
