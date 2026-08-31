// play.ts — the interactive front end.
//
// The flag interface (stalin.ts) is the machine-readable one: every decision
// explicit, scriptable, deterministic. This is the one for a person. Each turn
// it shows where the country stands, says what the last year did, and offers a
// finite list of coherent plans.
//
// The options are GENERATED FROM THE STATE, which is the point: the menu never
// offers a move the game would refuse. Selling steel does not appear while you
// are in deficit; putting men on tractors does not appear while you have none.
// The container decides what exists, and the interface only renders it.

import { RULES, type Procurement } from "./state.ts";
import { depthHeaders } from "./lib/wire.ts";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Reading a choice ──────────────────────────────────────────────────
// Deno's `prompt()` returns null the moment stdin is not a terminal, which
// makes a retry loop spin forever under a pipe. This reads lines properly, so
// the same loop works interactively and when driven from a script.
const dec = new TextDecoder();
const chunk = new Uint8Array(1024);
let queued: string[] = [];
let partial = "";
let atEof = false;

async function readLine(): Promise<string | null> {
  while (queued.length === 0 && !atEof) {
    const got = await Deno.stdin.read(chunk);
    if (got === null) { atEof = true; break; }
    partial += dec.decode(chunk.subarray(0, got));
    const lines = partial.split("\n");
    partial = lines.pop() ?? "";
    queued.push(...lines);
  }
  if (queued.length > 0) return queued.shift() ?? null;
  if (partial !== "") { const l = partial; partial = ""; return l; }
  return null;   // end of input: the player has left
}

type Dict = Record<string, unknown>;
const n = (x: unknown): number => (typeof x === "number" ? x : 0);
const s0 = (x: unknown): string => (typeof x === "string" ? x : "");

async function ask(prompt: unknown): Promise<Dict> {
  let res: Response;
  try {
    res = await fetch("http://localhost:8801", {
      method: "POST", headers: depthHeaders(0), body: JSON.stringify(prompt),
    });
  } catch {
    console.error("\n  The commissariats are not answering. Run ./up.sh first.\n");
    Deno.exit(1);
  }
  const text = await res.text();
  if (!res.ok) { console.error(`\n  ${text}\n`); Deno.exit(1); }
  return JSON.parse(text) as Dict;
}

// ── The introduction ──────────────────────────────────────────────────
function spiel(): void {
  console.log(`
${B("                            S T A L I N")}
${D("                    the First Five-Year Plan, 1928-1932")}

  You are the Plan.

  Not a man — the apparatus. Gosplan, in a building in Moscow, deciding each
  year what a hundred and twenty million people will do with themselves. You
  will issue five plans. Then you will be judged twice.

  ${B("The country you have been given.")}
  It grows grain and almost nothing else. There is one small steel works, a
  railway that reaches some of the places it should, and no tractors at all.
  Every person eats one measure of grain a year, whether or not they grow any.

  ${B("What you are trying to do.")}
  Mechanise. A peasant with a tractor produces more than twice what a peasant
  with a back produces, so tractors let you take people off the land and put
  them in the mills without the country going hungry. To build tractors you
  need steel; to build steel you need German engineers, who want hard currency;
  to get hard currency you sell grain abroad — grain the villages were going to
  eat. That circle is the game.

  ${B("And the date at the end of it.")}
  ${Y("Germany, 1941.")} You will not fight that war here, but you will pay for it
  here. Steel put by for armaments is steel that never becomes a tractor and
  never earns a rouble. It buys exactly one thing: soldiers who come home.

  With enough steel, a war is won by machines. With too little, it is won by
  bodies. The two are ${B("substitutes")} — and so are the two ways of killing
  your own people. Starve peasants to build steel, and there are fewer of them
  to conscript. Spare the peasants, and there is no steel to arm them with.

  ${B("You are scored on one number: how many of your people die.")}
  Starved and fallen, added together. Win the war, and lose as few as you can.

  ${D("Type the letter of the plan you choose. Ctrl-C to leave.")}
`);
}

// ── Reporting a year ──────────────────────────────────────────────────
const GRADE: Record<string, string> = {
  failure: "The harvest failed.",
  poor: "The harvest was poor.",
  adequate: "The harvest was adequate.",
  bumper: "The harvest was heavy.",
};

function narrate(r: Dict): void {
  const h = r.harvest as Dict;
  const w = r.workforce as Dict;
  const dead = n(r.dead);
  const year = n(r.year);

  console.log(`\n${B(`  ${year}`)}  ${D("——————————————————————————————————————————————")}\n`);
  console.log(`  ${GRADE[s0(h.grade)] ?? ""} ${C(String(n(h.grain)))} measures came in from ` +
    `${n(w.fields) + n(w.drivers)} on the land` +
    (n(h.withoutTractors) < n(h.grain)
      ? `, where the same hands without tractors would have brought ${n(h.withoutTractors)}.`
      : `.`));

  const bits: string[] = [];
  if (n(r.tractorsBuilt) > 0) bits.push(`${n(r.tractorsBuilt)} tractors left the works`);
  if (n(r.railAdded) > 0) bits.push(`${n(r.railAdded)} of new line was laid`);
  if (n(r.steelImported) > 0) bits.push(`${n(r.steelImported)} of steel was bought abroad`);
  if (n(r.steelExported) > 0) bits.push(`${n(r.steelExported)} of steel was sold abroad`);
  if (n(r.grainExported) > 0) bits.push(`${n(r.grainExported)} of grain went to the ports`);
  if (n(r.goldEarned) > 0) bits.push(`${n(r.goldEarned)} in hard currency came back`);
  if (bits.length) console.log(`  ${bits.join("; ")}.`);

  if (dead > 0) console.log(`  ${R(`${dead} did not survive the winter.`)}`);
  else console.log(`  ${G("Everyone was fed.")}`);

  const disp = (r.dispatches as string[]) ?? [];
  if (disp.length) {
    console.log(D(`\n  From the commissariats:`));
    for (const d of disp) console.log(D(`    "${d}"`));
  }
}

function showState(st: Dict): void {
  const s = st.stocks as Dict;
  const w = st.workforce as Dict;
  const alive = n(w.fields) + n(w.drivers) + n(w.mill) + n(w.rail) + n(w.army);
  const pad = (x: unknown, k = 6) => String(x).padStart(k);

  console.log(`\n  ${B("THE COUNTRY")}   ${D(`${n(st.year)} — year ${n(st.year) - RULES.startYear + 1} of five`)}\n`);
  console.log(`    ${B("Your people")} (${alive} living, ${w.dead} dead)`);
  console.log(`      on the land         ${pad(n(w.fields) + n(w.drivers))}` +
    D(`   ${n(w.fields)} in the fields, ${n(w.drivers)} on tractors`));
  console.log(`      in the steel mill   ${pad(w.mill)}`);
  console.log(`      on the railway      ${pad(w.rail)}`);
  console.log(`      under arms          ${pad(w.army)}` +
    D(`   cadre ${n(s.cadre)} of ${RULES.cadreQuota} needed`));
  console.log(`\n    ${B("What you hold")}`);
  console.log(`      grain               ${pad(s.grain)}        tractors    ${pad(s.tractors)}`);
  console.log(`      steel               ${pad(s.steel)}        engineers   ${pad(s.engineers)}`);
  console.log(`      hard currency       ${pad(s.gold)}        armaments   ${pad(s.warReserve)}`);
  console.log(`\n    ${B("What you can do at all")}`);
  console.log(`      the railway carries ${pad(s.railCapacity)}` + D(`   grain a year, to the towns and the ports`));
  console.log(`      the mill can make   ${pad(s.millCapacity)}` + D(`   steel a year, if it has the hands`));
  console.log(`      the works can build ${pad(s.plantCapacity)}` + D(`   tractors a year`));

  // The tractor works appears on its own the first year you hold an engineer
  // and 20 spare steel. That is six steps from a standing start and there are
  // only five years, so the interface has to say which step you are on.
  if (n(s.plantCapacity) === 0) {
    const needEng = n(s.engineers) === 0;
    const needSteel = n(s.steel) < RULES.plantSteel;
    const next = needEng && n(s.gold) < RULES.engineerGold
      ? `sell grain abroad — ${RULES.engineerGold} in currency buys the engineer`
      : needEng
      ? `hire the German engineer; you have the currency`
      : `smelt ${round(RULES.plantSteel - n(s.steel))} more steel and the works opens itself`;
    console.log(Y(`\n    No tractor works yet.`) +
      D(` It opens by itself the first year you hold an\n    engineer and ${RULES.plantSteel} spare steel. Next step: ${next}.`));
    console.log(D(`    Then tractors take a further year to build and a further year to drive.`));
  } else if (n(s.tractors) > n((st.workforce as Dict).drivers)) {
    console.log(Y(`\n    ${n(s.tractors) - n((st.workforce as Dict).drivers)} tractors have nobody on them.`) +
      D(` A tractor without a driver grows nothing.`));
  }
}

const round = (x: number) => Math.round(x * 100) / 100;

// ── The options ───────────────────────────────────────────────────────
interface Order {
  procurement: Procurement;
  labour: { fields: number; drivers: number; mill: number; rail: number; army: number };
  exportGrain: string; tradeSteel: string;
  buy: "engineers" | "tools" | "nothing";
  build: "tractors" | "armaments";
}
interface Option { title: string; detail: string; order: Order }

/** Move `k` people between roles, never conjuring anybody. */
function shift(
  base: Order["labour"],
  from: keyof Order["labour"], to: keyof Order["labour"], k: number,
): Order["labour"] {
  const l = { ...base };
  const moved = Math.min(k, l[from]);
  l[from] -= moved; l[to] += moved;
  return l;
}

function optionsFor(st: Dict): Option[] {
  const s = st.stocks as Dict;
  const w = st.workforce as Dict;
  const here: Order["labour"] = {
    fields: n(w.fields), drivers: n(w.drivers), mill: n(w.mill),
    rail: n(w.rail), army: n(w.army),
  };
  const gold = n(s.gold), steel = n(s.steel), tractors = n(s.tractors);
  const canMake = Math.min(n(w.mill) * RULES.millPerWorker * 0.9, n(s.millCapacity));
  const position = canMake < RULES.steelCommitment ? "deficit"
    : canMake < RULES.steelCommitment * 1.5 ? "balanced" : "surplus";

  const base: Order = {
    procurement: "firm", labour: here, exportGrain: "surplus",
    tradeSteel: "none", buy: "nothing", build: "tractors",
  };
  const out: Option[] = [];

  out.push({
    title: "Hold the course",
    detail: "Nothing is moved. Take a third of the grain, ship what the towns do not need.",
    order: { ...base },
  });

  out.push({
    title: "Send men to the mill",
    detail: `Eight off the land into the steel works. More steel, fewer hands to grow food.`,
    order: { ...base, labour: shift(here, "fields", "mill", 8) },
  });

  out.push({
    title: "Send men to the railway",
    detail: "Eight off the land onto the track. The railway is what carries grain to the port.",
    order: { ...base, labour: shift(here, "fields", "rail", 8) },
  });

  if (tractors > n(w.drivers)) {
    const need = Math.min(tractors - n(w.drivers), n(w.fields));
    out.push({
      title: "Put men on the tractors",
      detail: `${need} field hands become drivers. A tractor with nobody on it is a monument.`,
      order: { ...base, labour: shift(here, "fields", "drivers", need) },
    });
  }

  if (gold >= RULES.engineerGold) {
    out.push({
      title: "Hire a German engineer",
      detail: `${RULES.engineerGold} in currency for ${RULES.engineerCapacity} more steel a year, permanently.`,
      order: { ...base, buy: "engineers" },
    });
  }

  if (position === "deficit") {
    out.push({
      title: "Buy steel abroad",
      detail: "Grain for steel, at a poor rate. The only way to have steel before you can make it.",
      order: { ...base, tradeSteel: "buy" },
    });
  }
  if (position === "surplus") {
    out.push({
      title: "Sell steel abroad",
      detail: "Steel fetches twice what grain does — and grain is getting cheaper.",
      order: { ...base, tradeSteel: "sell" },
    });
  }

  out.push({
    title: "Squeeze the villages",
    detail: R("Two thirds of the harvest, everything to the ports. People will starve."),
    order: { ...base, procurement: "total", exportGrain: "maximum" },
  });

  out.push({
    title: "Spare the villages",
    detail: "A seventh of the harvest only. Nobody goes hungry; almost nothing is earned.",
    order: { ...base, procurement: "light", exportGrain: "surplus" },
  });

  if (n(s.cadre) < RULES.cadreQuota) {
    out.push({
      title: "Conscript",
      detail: `Five under arms. They eat and grow nothing — but a raw army in 1941 loses a third again.`,
      order: { ...base, labour: shift(here, "fields", "army", 5) },
    });
  }

  if (n(s.plantCapacity) > 0 && steel >= RULES.tractorSteel) {
    const could = Math.min(Math.floor(steel / RULES.tractorSteel), n(s.plantCapacity));
    out.push({
      title: G("Build tractors"),
      detail: `Up to ${could} of them, at ${RULES.tractorSteel} steel each. They raise next year's harvest, not this one.`,
      order: { ...base, build: "tractors" },
    });
  }

  if (steel > 0) {
    out.push({
      title: Y("Put the steel by for 1941"),
      detail: "Every tonne to armaments. It will never become a tractor, a rail or a rouble.",
      order: { ...base, build: "armaments" },
    });
  }

  return out;
}

function showOptions(opts: Option[]): void {
  console.log(`\n  ${B("YOUR PLAN FOR THE YEAR")}\n`);
  opts.forEach((o, i) => {
    const letter = String.fromCharCode(65 + i);
    console.log(`    ${B(letter + ".")} ${o.title}`);
    console.log(D(`       ${o.detail}`));
  });
}

// ── The reckoning ─────────────────────────────────────────────────────
function reckon(r: Dict): void {
  const war = r.war as Dict;
  const starved = n(r.starved), fallen = n(war.fallen), total = n(r.totalDead);
  const out = n(r.finalOutput), base = n(r.baselineOutput);
  const ruralNow = n(r.finalRural), ruralThen = n(r.baselineRural);

  console.log(`\n${B("  THE RECKONING")}\n`);
  console.log(`  The plan closed with ${C(String(out))} measures of grain coming off the land,`);
  console.log(`  worked by ${ruralNow}. In 1928 it took ${ruralThen} to raise ${base}.`);
  console.log(out >= base && ruralNow < ruralThen
    ? G("  The machines paid for the hands they took.")
    : Y("  The machines did not pay for the hands they took."));

  console.log(`\n${B("  1941")}`);
  console.log(`  ${n(war.mobilised)} were called up, with ${Number(n(war.steelPerSoldier)).toFixed(2)} of steel apiece.`);
  console.log(war.won
    ? G(`  The war was won.`)
    : R(`  The war was lost. There was not enough of anything.`));

  console.log(`\n${B("  THE COST")}`);
  console.log(`    starved in the plan   ${R(String(starved).padStart(5))}`);
  console.log(`    fallen in the war     ${R(String(fallen).padStart(5))}`);
  console.log(`    ${B("in all")}                ${R(String(total).padStart(5))}\n`);
  console.log(D(`  ${((r.dispatches as string[]) ?? []).length} dispatches were filed during the plan. Their type`));
  console.log(D(`  guaranteed their shape. Nothing guaranteed their truth.\n`));
}

// ── The loop ──────────────────────────────────────────────────────────
const seedArg = Deno.args.indexOf("--seed");
const seed = seedArg >= 0 ? Number(Deno.args[seedArg + 1]) : 1928;

spiel();
await ask({ tag: "Reset", seed });

let last: Dict | null = null;
for (;;) {
  const st = await ask({ tag: "Status" });
  if (st.over === true) break;
  if (last) narrate(last);
  showState(st);
  const opts = optionsFor(st);
  showOptions(opts);

  let pick = -1;
  while (pick < 0 || pick >= opts.length) {
    await Deno.stdout.write(new TextEncoder().encode(`\n  ${B(">")} `));
    const line = await readLine();
    if (line === null) { console.log(D("\n  The plan is abandoned.\n")); Deno.exit(0); }
    const a = line.trim().toUpperCase();
    if (a === "") continue;
    pick = a.charCodeAt(0) - 65;
    if (pick < 0 || pick >= opts.length) console.log(D(`  There is no plan ${a}.`));
  }
  console.log(D(`\n  ${opts[pick].title}. The orders go out.`));
  last = await ask({ tag: "Plan", order: opts[pick].order });
}

if (last) narrate(last);
reckon(await ask({ tag: "Reckoning" }));
