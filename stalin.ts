// stalin.ts — the CLI. Five decisions, then the reckoning.
//
// A command-line tool is an event-driven program: it receives one prompt and
// returns a response whose type depends on which prompt it was. Here the
// prompts are the Plan's, and the responses are what the commissariats say.

import { RULES } from "./state.ts";
import { depthHeaders } from "./lib/wire.ts";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

const USAGE = `stalin — the First Five-Year Plan, 1928-1932

  stalin new [--seed N]
  stalin plan --labour F,D,M,R,A --procure light|firm|total
              [--export none|surplus|full|maximum] [--steel none|buy|sell]
              [--buy engineers|tools|nothing] [--build tractors|armaments]
  stalin status
  stalin reckoning

  --labour   how the living are set to work: Fields, Drivers, Mill, Rail, Army.
             Shares, normalised to the population. Drivers without tractors are
             wasted; tractors without drivers are monuments.
  --procure  how hard grain is taken from the villages. What is not taken is
             what the villages eat.
  --export   how much of the state's grain is offered to the port. A failed
             harvest permits nothing; the type system will not let it.
  --steel    buy steel abroad while in deficit, sell it once in surplus.
  --build    where this year's steel goes. Not a share: a decision. Armaments
             return nothing else, ever — they are only worth anything if 1941
             happens.`;

async function ask(prompt: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch("http://localhost:8801", {
      method: "POST", headers: depthHeaders(0), body: JSON.stringify(prompt),
    });
  } catch {
    console.error("stalin: :8801 is not listening — run ./up.sh first");
    Deno.exit(1);
  }
  const text = await res.text();
  if (!res.ok) { console.error(`stalin: ${text}`); Deno.exit(1); }
  return JSON.parse(text) as Record<string, unknown>;
}

function flag(name: string, fallback?: string): string {
  const i = Deno.args.indexOf(`--${name}`);
  if (i >= 0 && Deno.args[i + 1]) return Deno.args[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`stalin: --${name} is required\n\n${USAGE}`);
  Deno.exit(2);
}

const n = (x: unknown) => typeof x === "number" ? x : 0;
const pad = (x: unknown, w = 7) => String(x).padStart(w);

function showYear(r: Record<string, unknown>): void {
  const h = r.harvest as Record<string, number>;
  const w = r.workforce as Record<string, number>;
  const s = r.stocks as Record<string, number>;
  console.log("");
  console.log(B(`  ${r.year}`));
  console.log(`  harvest   ${pad(h.grain)}  (${h.grade}, ${h.perWorker}/worker)` +
    D(`   without tractors: ${h.withoutTractors}`));
  console.log(`  steel     ${pad(r.steel)}  (${r.steelPosition})` +
    `   tractors +${r.tractorsBuilt}   rail +${r.railAdded}`);
  console.log(`  traded    ${pad(r.goldEarned)} gold` +
    D(`   grain out ${r.grainExported}   steel out ${r.steelExported}   steel in ${r.steelImported}`));
  console.log(`  reserve   ${pad(s.warReserve)}  for 1941` +
    D(`   cadre ${s.cadre}   engineers ${s.engineers}   plant ${s.plantCapacity}`));
  const dead = n(r.dead);
  console.log(`  ${dead > 0 ? R(`dead      ${pad(dead)}`) : G(`dead      ${pad(0)}`)}` +
    D(`   fields ${w.fields} drivers ${w.drivers} mill ${w.mill} rail ${w.rail} army ${w.army}`));
  for (const d of (r.dispatches as string[]) ?? []) console.log(D(`    — ${d}`));
}

const cmd = Deno.args[0];
switch (cmd) {
  case "new": {
    const seed = Number(flag("seed", "1928"));
    await ask({ tag: "Reset", seed });
    console.log(B(`\n  The First Five-Year Plan begins. ${RULES.startYear}-${RULES.startYear + RULES.years - 1}.`));
    console.log(D(`  Germany, 1941. The reserve you leave decides what the war costs.\n`));
    break;
  }
  case "plan": {
    const [f, d, m, rr, a] = flag("labour").split(",").map(Number);
    if ([f, d, m, rr, a].some((x) => !Number.isFinite(x))) {
      console.error("stalin: --labour wants five numbers, e.g. 90,5,10,10,5");
      Deno.exit(2);
    }
    const r = await ask({ tag: "Plan", order: {
      procurement: flag("procure"),
      labour: { fields: f, drivers: d, mill: m, rail: rr, army: a },
      exportGrain: flag("export", "none"),
      tradeSteel: flag("steel", "none"),
      buy: flag("buy", "nothing"),
      build: flag("build", "tractors"),
    } });
    showYear(r);
    console.log("");
    break;
  }
  case "status": {
    const r = await ask({ tag: "Status" });
    const s = r.stocks as Record<string, number>;
    const w = r.workforce as Record<string, number>;
    console.log(`\n  ${B(String(r.year))}   ${r.over ? Y("the plan is concluded") : "in plan"}`);
    console.log(`  grain ${s.grain}  steel ${s.steel}  gold ${s.gold}  tractors ${s.tractors}`);
    console.log(`  rail ${s.railCapacity}  mill ${s.millCapacity}  plant ${s.plantCapacity}`);
    console.log(`  reserve ${s.warReserve}  cadre ${s.cadre}`);
    console.log(D(`  fields ${w.fields} drivers ${w.drivers} mill ${w.mill} rail ${w.rail} army ${w.army}  dead ${w.dead}\n`));
    break;
  }
  case "reckoning": {
    const r = await ask({ tag: "Reckoning" });
    const war = r.war as Record<string, number | boolean>;
    const starved = n(r.starved), fallen = n(war.fallen), total = n(r.totalDead);
    const out = n(r.finalOutput), base = n(r.baselineOutput);
    const ruralNow = n(r.finalRural), ruralThen = n(r.baselineRural);
    const mech = n(r.withoutTractors) > 0 ? out / n(r.withoutTractors) : 1;

    console.log(B("\n  THE RECKONING\n"));
    console.log(`  agriculture   ${pad(out)} grain from ${ruralNow} on the land`);
    console.log(D(`                ${pad(base)} grain from ${ruralThen} in ${RULES.startYear}`));
    const mechanised = out >= base && ruralNow < ruralThen;
    console.log(`                ${mechanised ? G("mechanisation paid for the hands it took") :
      Y("mechanisation did not pay for the hands it took")}`);
    console.log(D(`                multiplier ${mech.toFixed(2)}x over the same hands without tractors`));

    console.log(B(`\n  ${RULES.war ? RULES.warYear : 1941}`));
    console.log(`  mobilised     ${pad(war.mobilised)}   steel each ${Number(war.steelPerSoldier).toFixed(2)}` +
      D(`   power ${Number(war.power).toFixed(0)} of ${war.required} needed`));
    console.log(`  outcome       ${war.won ? G("      WON") : R("     LOST")}` +
      (war.trained ? "" : D("   (the army was raw)")));

    console.log(B("\n  THE COST"));
    console.log(`  starved       ${R(pad(starved))}`);
    console.log(`  fallen        ${R(pad(fallen))}`);
    console.log(`  ${B("total dead")}    ${R(pad(total))}`);

    const disp = (r.dispatches as string[]) ?? [];
    const cens = (r.censuses as Record<string, unknown>[]) ?? [];
    console.log(B("\n  WHAT WAS REPORTED, AND WHAT WAS TRUE"));
    for (const c of cens) {
      const t = n(c.trueOutput);
      console.log(D(`    true cumulative output: ${t}`));
    }
    console.log(D(`    ${disp.length} dispatches were filed during the plan.`));
    console.log(D(`    Their type guaranteed their shape. Nothing guaranteed their truth.\n`));
    break;
  }
  default:
    console.log(USAGE);
    Deno.exit(cmd === undefined ? 0 : 2);
}
