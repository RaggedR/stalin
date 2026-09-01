// trace.ts — play a lettered line and print the economy turn by turn, so the
// weak link in grain -> gold -> engineers -> steel -> armaments is visible
// rather than inferred.
import { springOptions, autumnOptions, ask, type Option } from "./play.ts";

const seq = Deno.args[0];
const quiet = Deno.args.includes("--quiet");
const seedArg = Deno.args.find((a, i) => i > 0 && /^\d+$/.test(a));
await ask({ tag: "Reset", seed: Number(seedArg ?? 1928) });
for (const k of seq) {
  const st = await ask({ tag: "Status" });
  const sp = st.season === "spring";
  const s = st.stocks as Record<string, number>;
  const h = st.harvest as Record<string, number> | null;
  const w = st.workforce as Record<string, number>;
  if (!quiet && !sp) {
    console.log(`  ${st.year}  harvest ${(h?.grain ?? 0).toFixed(0).padStart(4)}` +
      `  state ${s.grain.toFixed(0).padStart(4)}  gold ${s.gold.toFixed(0).padStart(3)}` +
      `  cap ${String(s.millCapacity).padStart(3)}  steel ${s.steel.toFixed(0).padStart(3)}` +
      `  mill ${String(w.mill).padStart(3)}  tractors ${String(s.tractors).padStart(2)}  rail ${s.railCapacity.toFixed(0).padStart(3)}  arms ${s.warReserve.toFixed(0).padStart(3)}`);
  }
  const o = (sp ? springOptions(st) : autumnOptions(st))
    .find((x: Option<unknown>) => x.key === k);
  if (!o || o.why) { console.log(`  ${seq}: refused ${k} — ${o?.why ?? "not this season"}`); Deno.exit(0); }
  await ask({ tag: sp ? "Sow" : "Reap", order: o.order });
}
const r = await ask({ tag: "Reckoning" });
const s = r.stocks as Record<string, unknown>, w = r.war as Record<string, unknown>;
const mech = Number(r.finalOutput) >= Number(r.baselineOutput);
console.log(`${seq}  out ${Number(r.finalOutput).toFixed(0).padStart(4)}/${Number(r.baselineOutput).toFixed(0)}` +
  `  mill ${String(w.mill).padStart(3)}  tractors ${String(s.tractors).padStart(2)}  arms ${Number(s.warReserve).toFixed(0).padStart(3)}` +
  `  fallen ${String(w.fallen).padStart(2)}  starved ${String(r.starved).padStart(2)}` +
  `  TOTAL ${String(r.totalDead).padStart(3)}  ${w.won ? "won " : "LOST"}  ${mech ? "mechanised" : ""}`);
