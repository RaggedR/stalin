// search.ts — play the game many times and report what wins.
//
// Talks to Gosplan directly (no process per command) so a game costs one
// round of HTTP per year rather than five deno startups. A strategy is a
// policy function: given the state at the start of a year, produce that
// year's orders. That is the same shape as a player, which is the point —
// `(s : P) -> R p` is what a player IS.

import { RULES } from "./state.ts";
import { depthHeaders } from "./lib/wire.ts";

type Dict = Record<string, unknown>;
const n = (x: unknown) => (typeof x === "number" ? x : 0);

async function ask(prompt: unknown): Promise<Dict> {
  const res = await fetch("http://localhost:8801", {
    method: "POST", headers: depthHeaders(99), body: JSON.stringify(prompt),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t);
  return JSON.parse(t) as Dict;
}

export interface Knobs {
  procure: "light" | "firm" | "total";
  exportAs: "surplus" | "full" | "maximum";
  mill: number;          // target mill workers
  rail: number;          // target rail workers
  armsFrom: number;      // first year (1..5) whose steel goes to armaments; 9 = never
  millTarget: number;    // stop buying engineers once mill capacity reaches this
  /** What hard currency is spent on. `engineers` builds the capacity to make
   *  tractors; `tractors` buys them ready-made and builds nothing; `mixed`
   *  buys engineers until the mill target, then tractors with the rest. */
  spend: "engineers" | "tractors" | "mixed";
}

/** Spring: where the hands go, and how hard the villages are squeezed. The
 *  weather is not known yet, and neither is the harvest the quota bites into. */
function sowOrder(k: Knobs, st: Dict) {
  const s = st.stocks as Dict, w = st.workforce as Dict;
  const alive = n(w.fields) + n(w.drivers) + n(w.mill) + n(w.rail);

  // A driver is only worth anything if there is a tractor for him.
  const drivers = Math.min(n(s.tractors), Math.max(0, alive - k.mill - k.rail - 20));
  const mill = Math.min(k.mill, Math.max(0, alive - drivers - 10));
  const rail = Math.min(k.rail, Math.max(0, alive - drivers - mill - 10));
  const fields = Math.max(0, alive - drivers - mill - rail);

  // The quota stands, so re-declaring it every spring is harmless but the
  // knob's meaning is "the decree in force", not "this year's share".
  return { procurement: k.procure, labour: { fields, drivers, mill, rail } };
}

/** Autumn: the harvest is in and graded, the steel is made. Everything here is
 *  decided against numbers that actually exist, which is why the steel position
 *  is read off the state rather than predicted from mill workers. */
function reapOrder(k: Knobs, year: number, st: Dict) {
  const s = st.stocks as Dict;
  const pos = String(st.steelPosition ?? "balanced");
  return {
    exportGrain: k.exportAs,
    tradeSteel: pos === "deficit" ? "buy" : pos === "surplus" ? "sell" : "none",
    buy: k.spend === "tractors"
      ? (n(s.gold) >= RULES.tractorGold ? "tractors" : "nothing")
      : n(s.millCapacity) < k.millTarget && n(s.gold) >= RULES.engineerGold
      ? "engineers"
      : k.spend === "mixed" && n(s.gold) >= RULES.tractorGold
      ? "tractors" : "nothing",
    build: year >= k.armsFrom ? "armaments" : "tractors",
  };
}

export async function playOne(k: Knobs, seed: number) {
  await ask({ tag: "Reset", seed });
  for (let i = 0; i < RULES.years; i++) {
    const spring = await ask({ tag: "Status" });
    await ask({ tag: "Sow", order: sowOrder(k, spring) });
    const autumn = await ask({ tag: "Status" });
    await ask({ tag: "Reap", order: reapOrder(k, i + 1, autumn) });
  }
  const r = await ask({ tag: "Reckoning" });
  const war = r.war as Dict;
  return {
    won: war.won === true,
    starved: n(r.starved),
    fallen: n(war.fallen),
    total: n(r.totalDead),
    mechanised: n(r.finalOutput) >= n(r.baselineOutput) && n(r.finalRural) < n(r.baselineRural),
    output: n(r.finalOutput),
    rural: n(r.finalRural),
    reserve: n((r.stocks as Dict).warReserve),
    tractors: n((r.stocks as Dict).tractors),
  };
}

// ── The sweep ─────────────────────────────────────────────────────────
if (import.meta.main) {
  const seeds = (Deno.args[0] ?? "1928").split(",").map(Number);
  const grid: Knobs[] = [];
  for (const procure of ["light", "firm", "total"] as const)
    for (const mill of [16, 22])
      for (const rail of [8, 12])
        for (const armsFrom of [4, 5])
            for (const spend of ["engineers", "tractors", "mixed"] as const)
              grid.push({ procure, exportAs: procure === "total" ? "full" : "surplus",
                          mill, rail, armsFrom, millTarget: 60, spend });

  console.log(`sweeping ${grid.length} strategies x ${seeds.length} seed(s)\n`);
  const rows: { k: Knobs; won: number; total: number; mech: number }[] = [];
  for (const k of grid) {
    let won = 0, total = 0, mech = 0;
    for (const seed of seeds) {
      const r = await playOne(k, seed);
      won += r.won ? 1 : 0; total += r.total; mech += r.mechanised ? 1 : 0;
    }
    rows.push({ k, won, total: total / seeds.length, mech });
  }

  // Winning the war is a gate; among winners, fewest dead.
  rows.sort((a, b) => (b.won - a.won) || (a.total - b.total));
  const show = (r: typeof rows[0]) =>
    `${r.won === seeds.length ? "WON " : r.won === 0 ? "LOST" : `${r.won}/${seeds.length}`}` +
    `  dead ${String(Math.round(r.total)).padStart(3)}  mech ${r.mech}/${seeds.length}` +
    `  | ${r.k.procure.padEnd(5)} mill ${String(r.k.mill).padStart(2)} rail ${String(r.k.rail).padStart(2)}` +
    ` arms@${r.k.armsFrom === 9 ? "-" : r.k.armsFrom}` +
    ` spend:${r.k.spend}`;

  console.log("BEST 12");
  for (const r of rows.slice(0, 12)) console.log("  " + show(r));
  console.log("\nWORST 5");
  for (const r of rows.slice(-5)) console.log("  " + show(r));
}
