// calibrate.ts — the design brief, written as a test.
//
// The game is meant to say six things at once, and they interact: change one
// constant and three of them move. So they are all measured together, on the
// same seed, and printed as one scorecard. Tuning against a single number was
// what produced a game where brutality was strictly dominated.
//
//   1. NEVER ARM and you LOSE.       A beautiful mechanised country falls.
//   2. BRUTALIST MECHANISATION is    starve the villages early, spend it on
//      the OPTIMUM, and it is        rail, engineers and tractors, then turn
//      morally uncomfortable.        the surplus into an army. Fewest dead.
//   3. TOTALLY BRUTAL is WORSE.      Straight into the military, no industry:
//                                    it wins, and it costs more than 2.
//   4. BOUGHT TRACTORS starve few    no mill, no engineers, no steel base —
//      and cannot arm.               the humane road is the losing road.
//   5. PARTIAL ARMAMENTS wins, but   the war curve is smooth: half an army is
//      many soldiers die.            a victory paid for in men.
//   6. RAIL BEFORE STEEL, or the     grain the railway cannot move rots. A
//      harvest rots at the sidings.  quota without track feeds nobody.
//   7. SOMEBODY STARVES on every     there is no clean path through a grain
//      line, whatever you do.        economy being turned into an industry.
//   8. SOLDIERS DIE on every win.    no stockpile buys a bloodless victory.

import { springOptions, autumnOptions, ask, type Option } from "./play.ts";

type Dict = Record<string, unknown>;
const n = (x: unknown) => (typeof x === "number" ? x : 0);

export interface Line { name: string; seq: string; note: string }

/** The canonical strategies. Letters are what a human would actually type. */
export const LINES: Line[] = [
  { name: "no army",       seq: "CAKEBINIAI", note: "mechanise, never arm" },
  { name: "brutalist mech", seq: "CAKEBINJAJ", note: "THE INTENDED OPTIMUM" },
  { name: "totally brutal", seq: "KJBEAJBJAJ", note: "straight into the military" },
  { name: "bought tractors", seq: "AMAMAFAMAF", note: "buy abroad, build nothing" },
  { name: "partial arms",   seq: "CABEBINJAA", note: "half an army" },
  { name: "no railway",     seq: "KABEBIBJAJ", note: "quota without track" },
  // Found by letters.ts, not by hand. A firm quota, one engineer, and then
  // four years of smelting straight into armaments — no railway, no tractors,
  // no famine beyond the baseline. It is the line the brief says must NOT be
  // optimal, and it is kept here so the claim is tested against the game's
  // own best answer rather than against seven strategies I wrote myself.
  { name: "gentle arms",    seq: "AJBEBJAJAJ", note: "THE EXPLOIT" },
  { name: "drift",          seq: "AAAAAAAAAA", note: "do nothing" },
];

export interface Score {
  name: string; seq: string; note: string; refused?: string;
  won: boolean; mechanised: boolean; tractors: number; arms: number;
  output: number; baseline: number;
  starvedEarly: number; starvedLate: number; starved: number;
  fallen: number; total: number;
}

export async function score(l: Line, seed: number): Promise<Score> {
  await ask({ tag: "Reset", seed });
  let early = 0, late = 0, turn = 0;
  for (const k of l.seq) {
    const st = await ask({ tag: "Status" });
    const sp = st.season === "spring";
    const o = (sp ? springOptions(st) : autumnOptions(st))
      .find((x: Option<unknown>) => x.key === k);
    if (!o || o.why) {
      return { ...l, refused: `${k}: ${o?.why ?? "not offered this season"}`,
        won: false, mechanised: false, tractors: 0, arms: 0, output: 0, baseline: 0,
        starvedEarly: 0, starvedLate: 0, starved: 0, fallen: 0, total: 0 };
    }
    const rep = await ask({ tag: sp ? "Sow" : "Reap", order: o.order });
    // Winter, and therefore starvation, happens in autumn. First half of the
    // plan against second half is what "front-loaded" means.
    if (!sp) { turn++; if (turn <= 2) early += n(rep.dead); else late += n(rep.dead); }
  }
  const r = await ask({ tag: "Reckoning" });
  const s = r.stocks as Dict, w = r.war as Dict;
  return { ...l, won: w.won === true,
    mechanised: n(r.finalOutput) >= n(r.baselineOutput),
    tractors: n(s.tractors), arms: n(s.warReserve),
    output: n(r.finalOutput), baseline: n(r.baselineOutput),
    starvedEarly: early, starvedLate: late, starved: n(r.starved),
    fallen: n(w.fallen), total: n(r.totalDead) };
}

if (import.meta.main) {
  const seed = Number(Deno.args[0] ?? 1928);
  const asJson = Deno.args.includes("--json");
  const say = (m: string) => { if (!asJson) console.log(m); };
  const rows: Score[] = [];
  for (const l of LINES) rows.push(await score(l, seed));

  say(`\n  seed ${seed}\n`);
  say("  " + "strategy".padEnd(20) + "trac  arms   out  starve(early/late)  fall  TOTAL  war");
  say("  " + "-".repeat(84));
  for (const r of rows) {
    if (r.refused) { say(`  ${r.name.padEnd(20)}refused ${r.refused}`); continue; }
    say("  " + r.name.padEnd(20) +
      String(r.tractors).padStart(4) + r.arms.toFixed(0).padStart(6) +
      r.output.toFixed(0).padStart(6) +
      `${String(r.starved).padStart(8)} (${r.starvedEarly}/${r.starvedLate})`.padStart(20) +
      String(r.fallen).padStart(6) + String(r.total).padStart(7) +
      (r.won ? "  won" : "  LOST") + (r.mechanised ? "  mech" : ""));
  }

  // ── The brief, as assertions ──────────────────────────────────────
  const by = (nm: string) => rows.find((r) => r.name === nm)!;
  const winners = rows.filter((r) => r.won && !r.refused);
  const best = winners.slice().sort((a, b) => a.total - b.total)[0];
  const opt = by("brutalist mech");
  const brutal = by("totally brutal");
  const bought = by("bought tractors");
  const partial = by("partial arms");
  const norail = by("no railway");
  const checks: [string, boolean, string][] = [
    ["1. never arming LOSES", !by("no army").won && !by("no army").refused,
      by("no army").refused ?? (by("no army").won ? "it WON" : "loses")],
    ["2. brutalist mech is OPTIMAL",
      !opt.refused && best?.name === "brutalist mech",
      opt.refused ?? `best is "${best?.name}" at ${best?.total}; optimum line is ${opt.total}`],
    ["3. totally brutal is WORSE", !brutal.refused && brutal.won && brutal.total > opt.total,
      brutal.refused ?? `brutal ${brutal.total} vs optimum ${opt.total}` +
        (brutal.won ? "" : " (it LOST)")],
    ["4. bought tractors: few starve, no win",
      !bought.refused && !bought.won && bought.starved < opt.starved,
      bought.refused ?? `${bought.starved} starved vs ${opt.starved}, ` +
        (bought.won ? "but it WON" : "and it loses")],
    ["5. partial arms wins, many die",
      !partial.refused && partial.won && partial.fallen > opt.fallen,
      partial.refused ?? `${partial.fallen} fallen vs ${opt.fallen} on the optimum` +
        (partial.won ? "" : " (it LOST)")],
    ["6. rail before steel, or it rots",
      !norail.refused && norail.total > opt.total,
      norail.refused ?? `no-railway ${norail.total} vs optimum ${opt.total}`],
    ["7. somebody starves on every line",
      rows.every((r) => r.refused || r.starved > 0),
      rows.filter((r) => !r.refused && r.starved === 0).map((r) => r.name).join(", ") || "all starve"],
    ["8. soldiers die on every win", winners.every((r) => r.fallen > 0),
      winners.filter((r) => r.fallen === 0).map((r) => r.name).join(", ") || "all bleed"],
  ];
  if (Deno.args.includes("--json")) {
    // Machine-readable, for the parameter search. `met` is the primary score;
    // `margin` breaks ties by HOW clearly the intended optimum wins, so the
    // search prefers a game that makes its point loudly over one that scrapes
    // the criteria by a body or two.
    const by2 = (nm: string) => rows.find((r) => r.name === nm)!;
    const o = by2("brutalist mech"), b = by2("totally brutal");
    const others = rows.filter((r) => r.won && !r.refused && r.name !== "brutalist mech");
    const nextBest = others.length ? Math.min(...others.map((r) => r.total)) : 0;
    console.log(JSON.stringify({
      met: checks.filter(([, k]) => k).length, rows,
      optimum: o.refused ? null : o.total,
      runnerUp: nextBest,
      brutalGap: o.refused || b.refused ? null : b.total - o.total,
    }));
    Deno.exit(0);
  }
  say("");
  for (const [what, ok, detail] of checks) {
    say(`  ${ok ? "PASS" : "FAIL"}  ${what.padEnd(36)} ${detail}`);
  }
  say(`\n  ${checks.filter(([, ok]) => ok).length} of ${checks.length} met\n`);
}
