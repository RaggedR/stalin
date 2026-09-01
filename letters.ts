// letters.ts — search the lettered menu for the cheapest way to win.
//
// It plays through `springOptions`/`autumnOptions` — the very tables a human is
// shown in ./play — so whatever it finds is a sequence you can actually type.
// Any letter the game would refuse aborts that candidate rather than silently
// doing something else, which is the failure the stable-letter change was made
// to prevent.
//
// A year is now two turns, so a full game is ten letters and the raw space is
// 6×8 to the fifth — about 250 million. Exhaustive enumeration is out. What
// replaces it is a beam search whose score is not a hand-weighted proxy but a
// ROLLOUT: every prefix is finished off with a fixed default tail and the real
// reckoning is read from the server. A prefix is judged by the game, not by me.

import { springOptions, autumnOptions, ask, type Option } from "./play.ts";

type Dict = Record<string, unknown>;
const n = (x: unknown) => (typeof x === "number" ? x : 0);

// Each Gosplan prompt fans out to four commissariats. With the default
// process-per-hop a rollout costs about forty spawns and the beam has to be
// tiny; run the servers under STALIN_INPROC=1 and the same search is twenty
// times faster, which is what makes a beam this wide affordable.
const BEAM = 20;
const TURNS = 10;
// The tail a prefix is finished with when we score it. Sowing as we stand and
// putting the steel by is the least-committal thing the game will let you do,
// so a prefix is scored on its own merits rather than on a clever tail.
const TAIL_SPRING = "A", TAIL_AUTUMN = "J";

interface Result { won: boolean; starved: number; fallen: number; total: number;
                   mech: boolean; refused: boolean }

const REFUSED: Result =
  { won: false, starved: 0, fallen: 0, total: 9999, mech: false, refused: true };

/** Play a literal sequence of letters, alternating seasons. */
async function play(seq: string, seed: number): Promise<Result> {
  await ask({ tag: "Reset", seed });
  for (const key of seq) {
    const st = await ask({ tag: "Status" });
    if (st.over === true) break;
    const spring = st.season === "spring";
    const opts: Option<unknown>[] = spring ? springOptions(st) : autumnOptions(st);
    const opt = opts.find((o) => o.key === key);
    if (!opt || opt.why) return REFUSED;
    await ask({ tag: spring ? "Sow" : "Reap", order: opt.order });
  }
  const r = await ask({ tag: "Reckoning" });
  const war = r.war as Dict;
  return {
    won: war.won === true, starved: n(r.starved), fallen: n(war.fallen),
    total: n(r.totalDead),
    mech: n(r.finalOutput) >= n(r.baselineOutput) && n(r.finalRural) < n(r.baselineRural),
    refused: false,
  };
}

/** Finish a prefix with the default tail and score the whole game. */
function rollout(prefix: string, seed: number): Promise<Result> {
  let s = prefix;
  while (s.length < TURNS) s += s.length % 2 === 0 ? TAIL_SPRING : TAIL_AUTUMN;
  return play(s, seed);
}

/** Which letters the game offers at this depth, cheapest first to try. */
// D (men back to the fields) and L (a light quota) are dominated openings —
// there is nobody to send back on turn one and a light quota only ever loses
// grain the state needs. Dropping them is a pruning, not a claim.
const SPRING = ["A", "B", "C", "K", "N"];
// Every autumn letter that changes the economy. H (sell steel) is gone from
// the game; G (buy steel abroad) is dropped as dominated — it spends at 5:1
// the grain that would have been the engineer.
const AUTUMN = ["A", "E", "F", "I", "J", "M"];

const seed = Number(Deno.args[0] ?? "1928");
console.log(`beam ${BEAM}, ten turns, seed ${seed}\n`);

let beam: { seq: string; r: Result }[] = [{ seq: "", r: await rollout("", seed) }];
const seen = new Set<string>();

for (let depth = 0; depth < TURNS; depth++) {
  const alphabet = depth % 2 === 0 ? SPRING : AUTUMN;
  const next: { seq: string; r: Result }[] = [];
  for (const { seq } of beam) {
    for (const k of alphabet) {
      const cand = seq + k;
      if (seen.has(cand)) continue;
      seen.add(cand);
      const r = await rollout(cand, seed);
      if (!r.refused) next.push({ seq: cand, r });
    }
  }
  // Rank: winning first, then fewest dead overall, then fewest starved — the
  // two orderings the game deliberately refuses to reconcile, applied in the
  // order the brief states the goal.
  next.sort((a, b) =>
    (Number(b.r.won) - Number(a.r.won)) || (a.r.total - b.r.total) ||
    (a.r.starved - b.r.starved));
  beam = next.slice(0, BEAM);
  const best = beam[0];
  console.log(`  turn ${String(depth + 1).padStart(2)}  best prefix ${best.seq.padEnd(10)}` +
    ` rollout: ${best.r.won ? "won " : "LOST"} dead ${String(best.r.total).padStart(3)}` +
    ` (starved ${best.r.starved}, fallen ${best.r.fallen})`);
}

const won = beam.filter((b) => b.r.won);
console.log(`\nCHEAPEST WINS  (${won.length} of the final ${beam.length} beam)`);
for (const { seq, r } of won.slice(0, 12)) {
  console.log(`  ${seq}   dead ${String(r.total).padStart(3)}` +
    `  (starved ${String(r.starved).padStart(2)}, fallen ${String(r.fallen).padStart(2)})` +
    `  ${r.mech ? "mechanised" : ""}`);
}
const mech = won.filter((b) => b.r.mech);
if (mech.length) {
  console.log(`\nCHEAPEST THAT ALSO MECHANISED  (${mech.length} of ${won.length})`);
  for (const { seq, r } of mech.slice(0, 6)) console.log(`  ${seq}   dead ${r.total}`);
}
