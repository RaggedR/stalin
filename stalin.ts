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
  stalin sow  --labour F,D,M,R --procure light|firm|total
  stalin reap [--export none|surplus|full|maximum] [--steel none|buy]
              [--buy engineers|tools|tractors|nothing] [--build tractors|armaments]

  stalin status
  stalin reckoning

  A year is two turns. In SPRING you fix the hands and the quota, before you
  know the weather. In AUTUMN the harvest is in and graded, and you dispose
  of it knowing exactly what it was.

  --labour   how the living are set to work: Fields, Drivers, Mill, Rail.
             Shares, normalised to the population. Drivers without tractors are
             wasted; tractors without drivers are monuments. You never conscript:
             in 1941 the country calls up exactly as many men as the armaments
             require, and no more.
  --procure  how hard grain is taken from the villages. What is not taken is
             what the villages eat.
  --export   how much of the state's grain is offered to the port. A failed
             harvest permits nothing; the type system will not let it.
  --steel    buy steel abroad while in deficit. Steel is never sold: a plan
             that exports its steel is not industrialising.
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
  const imp = n(r.importedTractors);
  console.log(`  steel     ${pad(r.steel)}  (${r.steelPosition})` +
    `   tractors +${n(r.tractorsBuilt) + imp}${imp > 0 ? ` (${imp} imported)` : ""}   rail +${r.railAdded}`);
  console.log(`  traded    ${pad(r.goldEarned)} gold` +
    D(`   grain out ${r.grainExported}   steel in ${r.steelImported}`));
  console.log(`  reserve   ${pad(s.warReserve)}  for 1941` +
    D(`   engineers ${s.engineers}   plant ${s.plantCapacity}`));
  const dead = n(r.dead);
  console.log(`  ${dead > 0 ? R(`dead      ${pad(dead)}`) : G(`dead      ${pad(0)}`)}` +
    D(`   fields ${w.fields} drivers ${w.drivers} mill ${w.mill} rail ${w.rail}`));
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
  case "sow": {
    const [f, d, m, rr] = flag("labour").split(",").map(Number);
    if ([f, d, m, rr].some((x) => !Number.isFinite(x))) {
      console.error("stalin: --labour wants four numbers, e.g. 90,5,10,10");
      Deno.exit(2);
    }
    const r = await ask({ tag: "Sow", order: {
      procurement: flag("procure"),
      labour: { fields: f, drivers: d, mill: m, rail: rr },
    } });
    const h = r.harvest as Record<string, number>;
    console.log("");
    console.log(B(`  ${r.year} — sown`));
    console.log(`  harvest   ${pad(h.grain)}  (${h.grade}, ${h.perWorker}/worker)` +
      D(`   without tractors: ${h.withoutTractors}`));
    console.log(`  steel     ${pad(r.steel)}  (${r.steelPosition})   rail +${r.railAdded}`);
    console.log(`  the quota leaves the villages ${pad(r.villageGrain)}` +
      (n(r.villageShortfall) > 0
        ? R(`   ${n(r.villageShortfall)} short of what they eat`)
        : G("   enough")));
    console.log("");
    break;
  }
  case "reap": {
    const r = await ask({ tag: "Reap", order: {
      exportGrain: flag("export", "surplus"),
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
    const alive = w.fields + w.drivers + w.mill + w.rail + w.army;
    const row = (a: string, av: unknown, b = "", bv: unknown = "") =>
      `    ${a.padEnd(11)}${String(av).padStart(5)}` +
      (b ? `        ${b.padEnd(11)}${String(bv).padStart(5)}` : "");

    console.log(`\n  ${B(String(r.year))}   ${r.over ? Y("the plan is concluded") : D("in plan")}\n`);
    console.log(`    ${B("LABOUR")}                    ${B("STOCKS")}`);
    console.log(row("fields:", w.fields, "grain:", s.grain));
    console.log(row("drivers:", w.drivers, "steel:", s.steel));
    console.log(row("mill:", w.mill, "gold:", s.gold));
    console.log(row("rail:", w.rail, "tractors:", s.tractors));
    console.log(row("engineers:", s.engineers));
    console.log(D(`    ${"living:".padEnd(11)}${String(alive).padStart(5)}`));
    console.log(D(`    ${"dead:".padEnd(11)}${String(w.dead).padStart(5)}`));
    console.log(`\n    ${B("CAPACITY")}                  ${B("FOR 1941")}`);
    console.log(row("rail:", s.railCapacity, "reserve:", s.warReserve));
    console.log(row("mill:", s.millCapacity));
    console.log(row("plant:", s.plantCapacity));

    if (!r.over) {
      // Which steel trades exist is decided by the steel position, and that is
      // known now. Which grain exports exist is decided by the harvest grade,
      // and that is not known until the fields report — so it is left open.
      const committed = RULES.steelCommitment;
      // Judged on what the mill can make, not on what is left in the yard.
      const canMake = Math.min(w.mill * RULES.millPerWorker * 0.9, s.millCapacity);
      const pos = canMake < committed ? "deficit"
        : canMake < committed * 1.5 ? "balanced" : "surplus";
      const mark = (ok: boolean, t: string) => (ok ? t : D(t));

      console.log(`\n    ${B("YOUR ORDERS")}   ${D(`(steel is in ${pos} as of January)`)}\n`);
      console.log(`    --labour   F,D,M,R,A   ${D(`how the ${alive} living are set to work`)}`);
      console.log(`    --procure  light | firm | total`);
      console.log(D(`                 15% | 33%  | 65% of the harvest taken; the rest is what the village eats`));
      console.log(`    --export   none | surplus | full | maximum`);
      console.log(D(`                 decided against the harvest grade; a failed harvest permits only "none"`));
      console.log(`    --steel    none | ${mark(pos === "deficit", "buy")}`);
      console.log(D(`                 buy only in deficit. The mill runs BEFORE the`));
      console.log(D(`                 trade delegation, so this is re-judged in autumn — a January deficit`));
      console.log(D(`                 can be an autumn surplus. Dimmed is what January says, not autumn.`));
      console.log(`    --buy      engineers | tools | tractors | nothing`);
      console.log(D(`                 engineer ${RULES.engineerGold}g -> +${RULES.engineerCapacity} mill;  tools ${RULES.toolsGold}g -> +10 plant;`));
      console.log(D(`                 tractors ${RULES.tractorGold}g each, ready to drive — no engineer or works needed`));
      console.log(`    --build    tractors | armaments`);
      console.log(D(`                 where ALL this year's steel goes. Armaments return nothing else, ever.`));
      const gate: string[] = [];
      if (s.plantCapacity === 0) gate.push("no plant yet: tractors cannot be built until you hold an engineer and 20 spare steel");
      if (s.tractors === 0) gate.push("no tractors: any driver you assign produces nothing and still eats");
      if (gate.length) {
        console.log("");
        for (const g of gate) console.log(Y(`    ! ${g}`));
      }
    }
    console.log("");
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
    console.log(`  called up     ${pad(war.mobilised)}  of ${war.available} available` +
      D(`   ${Number(war.steelPerSoldier).toFixed(2)} of steel each`));
    console.log(`  outcome       ${war.won ? G("      WON") : R("     LOST")}`);

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
