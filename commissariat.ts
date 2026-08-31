// commissariat.ts — what every commissariat shares.
//
// Each one holds two things the Plan cannot see: how well it is actually doing
// (a hidden efficiency) and how much it inflates its dispatches. Gosplan keeps
// the true ledger, because the grain physically exists; what diverges is the
// REPORT, and the player plans against the report.
//
// This is §6's caveat about the LLM oracle, relocated. The type of a dispatch
// guarantees its shape and says nothing whatever about its truth.

import { rng } from "./state.ts";
import type { CensusReturn, Dispatch } from "./containers.ts";

export interface Ledger {
  quota: number;
  delivered: number;
  reported: number;
}

export class Books {
  readonly name: string;
  /** How much this commissariat inflates a shortfall, 0 = honest. */
  readonly bias: number;
  /** Hidden local efficiency: the Plan never learns this number. */
  readonly efficiency: number;
  private readonly history: Ledger[] = [];
  private readonly noise: () => number;

  constructor(name: string, seed: number, bias: number, efficiency: number) {
    this.name = name;
    this.bias = bias;
    this.efficiency = efficiency;
    this.noise = rng(seed);
  }

  /** Record a year, and decide what to say about it.
   *  A commissariat that met its quota reports honestly; one that missed
   *  closes the gap by the fraction it dares. */
  record(year: number, quota: number, delivered: number): Dispatch {
    const gap = Math.max(0, quota - delivered);
    const reported = delivered + gap * this.bias * (0.7 + 0.6 * this.noise());
    this.history.push({ quota, delivered, reported });
    const quotaMet = reported >= quota - 1e-9;
    return {
      year,
      quotaMet,
      output: round(reported),
      note: this.note(quota, delivered, reported),
    };
  }

  private note(quota: number, delivered: number, reported: number): string {
    if (delivered >= quota) return `${this.name}: quota fulfilled.`;
    if (reported >= quota) return `${this.name}: quota fulfilled, with difficulties overcome.`;
    const pct = quota <= 0 ? 100 : Math.round((reported / quota) * 100);
    return `${this.name}: ${pct}% of quota; wreckers and weather are blamed.`;
  }

  census(extra: Omit<CensusReturn, "trueOutput">): CensusReturn {
    return { ...extra, trueOutput: round(this.totalDelivered()) };
  }

  totalDelivered(): number { return this.history.reduce((n, l) => n + l.delivered, 0); }
  totalReported(): number { return this.history.reduce((n, l) => n + l.reported, 0); }
  /** The accumulated lie. Only the reckoning sees this. */
  overstatement(): number { return round(this.totalReported() - this.totalDelivered()); }
}

export const round = (n: number): number => Math.round(n * 100) / 100;
export const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));
