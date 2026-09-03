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

/** Whether the typed agent on :8806 was started. The menu never offers a move
 *  that cannot be made, so the commissar is listed with a reason instead. */
const agentEnabled = Deno.env.get("STALIN_AGENT") === "1";
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Reading a choice ──────────────────────────────────────────────────
// Deno's `prompt()` returns null the moment stdin is not a terminal, which
// makes a retry loop spin forever under a pipe. This reads lines properly, so
// the same loop works interactively and when driven from a script.
const dec = new TextDecoder();
const chunk = new Uint8Array(1024);
const queued: string[] = [];
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

export async function ask(prompt: unknown): Promise<Dict> {
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
  year what a hundred and twenty million people will do with themselves. Five
  years, and each year you speak twice.

  ${B("In spring")} you decide where the hands go and how hard the villages are
  squeezed. You do this ${B("before you know the weather")}. The quota you fix in
  March is the quota that stands in August, whatever August brings.

  ${B("In autumn")} the harvest is in and graded, and you dispose of it: what is
  shipped, what is bought, what the steel becomes. Here you know everything.

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
  bodies. Neither ever fully replaces the other — a rifle needs a hand, a hand
  needs a rifle — but every extra ton buys back some men, and it never stops
  buying.

  Which means you have two ways of killing your own people, and you must pick
  the mix. Starve peasants to build steel, and there are fewer of them left to
  conscript. Spare the peasants, and there is no steel to arm them with.

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
  const alive = n(w.fields) + n(w.drivers) + n(w.mill) + n(w.rail);
  const pad = (x: unknown, k = 6) => String(x).padStart(k);

  console.log(`\n  ${B("THE COUNTRY")}   ${D(`${n(st.year)} — year ${n(st.year) - RULES.startYear + 1} of five`)}\n`);
  console.log(`    ${B("Your people")} (${alive} living, ${w.dead} dead)`);
  console.log(`      on the land         ${pad(n(w.fields) + n(w.drivers))}` +
    D(`   ${n(w.fields)} in the fields, ${n(w.drivers)} on tractors`));
  console.log(`      in the steel mill   ${pad(w.mill)}`);
  console.log(`      on the railway      ${pad(w.rail)}`);
  console.log(D(`      (nobody is conscripted during the plan — in 1941 the country calls up`));
  console.log(D(`       exactly as many men as the armaments require, and no more)`));
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
  // only ten turns, so the interface has to say which step you are on.
  if (n(s.plantCapacity) === 0) {
    const needEng = n(s.engineers) === 0;
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
export interface SowOrder {
  procurement: Procurement;
  labour: { fields: number; drivers: number; mill: number; rail: number };
}
export interface ReapOrder {
  exportGrain: string; tradeSteel: string;
  buy: "engineers" | "tools" | "tractors" | "nothing";
  /** The fourth word hands the decision to the typed agent on :8806. */
  build: "tractors" | "armaments" | "commissar";
}
type Labour = SowOrder["labour"];
/** Move `k` people between roles, never conjuring anybody. */
function shift(base: Labour, from: keyof Labour, to: keyof Labour, k: number): Labour {
  const l = { ...base };
  const moved = Math.min(k, l[from]);
  l[from] -= moved; l[to] += moved;
  return l;
}

/** An option keeps its letter whether or not it is available this year.
 *  Letters that move are worse than no letters at all: a player who learns
 *  "E hires the engineer" and finds that E now squeezes the villages has been
 *  handed a trap, and the game has no undo. Unavailable plans are shown greyed
 *  with the reason, and refuse the keystroke. */
export interface Option<O> {
  key: string; title: string; detail: string; order: O; why?: string;
}

/** SPRING. Where the hands go, and how hard the villages are taxed — and both
 *  are fixed before anybody knows what the weather will do. A quota set in
 *  March against a harvest that fails in August is not a game mechanic; it is
 *  how a famine is administered. */
export function springOptions(st: Dict): Option<SowOrder>[] {
  const s = st.stocks as Dict, w = st.workforce as Dict;
  const here: Labour = {
    fields: n(w.fields), drivers: n(w.drivers), mill: n(w.mill), rail: n(w.rail),
  };
  // A tractor with nobody on it produces nothing and still eats, so drivers
  // are never a decision — they follow the machines.
  const autoDrivers = Math.max(0, Math.min(n(s.tractors) - n(w.drivers), n(w.fields)));
  const L = shift(here, "fields", "drivers", autoDrivers);
  // The quota STANDS. It is not re-chosen every spring; A/B/C/D keep whatever
  // decree is in force, and only K and L change it. When the quota was re-set
  // each turn, moving men to the mill silently repealed a total quota, so
  // squeezing the villages and building steel became mutually exclusive and
  // brutality was dominated by accident rather than by design.
  const standing = String(st.procurement ?? "firm") as Procurement;
  const base: SowOrder = { procurement: standing, labour: L };
  // How many field hands the operated tractors make redundant: each machine
  // out-produces a man by (tractorYield - fieldYield), which is that much
  // field labour no longer needed. Never empty the fields — 30 stay whatever
  // the arithmetic says, because a country of steelworkers starves.
  const operated = Math.min(n(s.tractors), L.drivers);
  const covered = Math.floor(
    operated * (RULES.tractorYield - RULES.fieldYield) / RULES.fieldYield);
  const freed = Math.max(0, Math.min(covered, L.fields - 30));
  const quota = standing === "total" ? "a total quota"
    : standing === "light" ? "a light quota" : "a firm quota";

  return [
    { key: "A", title: "Sow as we stand", detail: `Nobody is moved. ${quota} stands.`,
      order: { ...base } },
    { key: "B", title: "Send men to the mill",
      detail: `Eight off the land into the steel works. More steel this autumn, fewer hands to grow food. ${quota} stands.`,
      order: { ...base, labour: shift(L, "fields", "mill", 8) } },
    { key: "C", title: "Send men to the railway",
      detail: `Eight onto the track. The railway carries grain to the towns and the port. ${quota} stands.`,
      order: { ...base, labour: shift(L, "fields", "rail", 8) } },
    { key: "D", title: "Send men back to the fields",
      detail: `Eight back from the mill onto the land. Grain now, capacity later. ${quota} stands.`,
      order: { ...base, labour: shift(L, "mill", "fields", 8) },
      why: n(w.mill) < 8 ? "there are not eight men in the mill" : undefined },
    { key: "K", title: R("Set a total quota"),
      detail: "Two thirds of the harvest to the state, whatever the harvest turns out to be — and every spring after this one, until you repeal it.",
      order: { ...base, procurement: "total" },
      why: standing === "total" ? "the total quota is already in force" : undefined },
    // The point of a tractor is not the grain. It is the HANDS. A tractor
    // covers the output of several field workers, and those workers can then
    // go to the mill without the country eating less — which is the whole
    // sentence "peasants become steel workers", and the only way mechanising
    // pays back inside five years. Without this the tractor road produces a
    // magnificent final harvest in a year with nothing left to spend it on.
    { key: "N", title: G("Send the hands the tractors have freed"),
      detail: freed > 0
        ? `${freed} off the land into the mill. The machines cover what they grew, so nobody eats less for it.`
        : "No tractors, so no hands to spare.",
      order: { ...base, labour: shift(L, "fields", "mill", freed) },
      why: freed <= 0
        ? (n(s.tractors) === 0 ? "there are no tractors yet"
           : "the tractors do not yet cover a whole worker") : undefined },
    { key: "L", title: "Set a light quota",
      detail: "A seventh only, from now on. The villages will eat; almost nothing will be earned.",
      order: { ...base, procurement: "light" },
      why: standing === "light" ? "the light quota is already in force" : undefined },
  ];
}

/** AUTUMN. The grain is in and graded. Everything here is decided knowing what
 *  spring's gamble returned — and which export decisions exist at all was
 *  settled by the grade, not by you. */
export function autumnOptions(st: Dict): Option<ReapOrder>[] {
  const s = st.stocks as Dict;
  const gold = n(s.gold), steel = n(s.steel);
  // Read the position off the state, do not predict it from mill workers. By
  // autumn the smelting has already happened, so there is a fact to consult.
  // Predicting it here is the stale-gate bug that bit this file three times:
  // a gate resolved against a number the game had already moved past.
  const position = String(st.steelPosition ?? "balanced");
  const grade = String((st.harvest as Dict | null)?.grade ?? "adequate");
  // The works opens during THIS turn if there is an engineer and the steel for
  // it, so gate on what will be true when the order runs, not on what was true
  // when the menu was drawn. Reading plantCapacity straight off the state is
  // the stale-gate bug, and this is the fourth place it has appeared.
  const opensNow = n(s.plantCapacity) === 0 && n(s.engineers) > 0 &&
    steel >= RULES.plantSteel;
  const plant = n(s.plantCapacity) || (opensNow ? RULES.plantCapacity : 0);
  const steelForTractors = opensNow ? steel - RULES.plantSteel : steel;
  const mayExport = (c: string) =>
    grade === "failure" ? c === "none"
    : grade === "poor" ? c === "surplus"
    : grade === "adequate" ? c === "surplus" || c === "full" : true;

  const base: ReapOrder = {
    exportGrain: "surplus", tradeSteel: "none", buy: "nothing", build: "tractors",
  };
  return [
    { key: "A", title: "Ship the surplus and hold",
      detail: "Send abroad what the towns do not need. Nothing bought, nothing built.",
      order: { ...base },
      why: mayExport("surplus") ? undefined : `a ${grade} harvest permits no export at all` },
    { key: "E", title: "Hire a German engineer",
      detail: `${RULES.engineerGold} in currency for ${RULES.engineerCapacity} more steel a year, permanently.`,
      order: { ...base, buy: "engineers" },
      why: gold < RULES.engineerGold ? `needs ${RULES.engineerGold} in currency; you have ${gold}` : undefined },
    { key: "F", title: "Buy tractors abroad",
      detail: `${Math.floor(gold / RULES.tractorGold)} at ${RULES.tractorGold} apiece, ready to drive. No engineer, no mill, no works.`,
      order: { ...base, buy: "tractors" },
      why: gold < RULES.tractorGold ? `needs ${RULES.tractorGold} in currency; you have ${gold}` : undefined },
    { key: "G", title: "Buy steel abroad",
      detail: "Grain for steel at a poor rate — and that grain was the engineer.",
      order: { ...base, tradeSteel: "buy" },
      why: position !== "deficit" ? `the mill can meet its commitments (${position})` : undefined },
    { key: "I", title: G("Build tractors"),
      detail: opensNow
        ? `The works opens this autumn — ${RULES.plantSteel} of steel builds it — and turns out up to ` +
          `${Math.min(Math.floor(steelForTractors / RULES.tractorSteel), plant)} at once. They raise NEXT year's harvest.`
        : `Up to ${Math.min(Math.floor(steelForTractors / RULES.tractorSteel), plant)} of them. They raise NEXT year's harvest.`,
      order: { ...base, build: "tractors" },
      why: plant === 0
        ? (n(s.engineers) === 0
            ? "there is no tractor works, and no engineer to build one"
            : `there is no tractor works; ${round(RULES.plantSteel - steel)} more steel opens it`)
        : steelForTractors < RULES.tractorSteel ? "no steel left to build them from" : undefined },
    { key: "J", title: Y("Put the steel by for 1941"),
      detail: `Every tonne to armaments, at ${RULES.armamentYield} of a tonne of guns per tonne of steel. It decides how many men are called up.`,
      order: { ...base, build: "armaments", tradeSteel: "none" },
      why: steel <= 0 ? "no steel to put by" : undefined },
    { key: "K", title: Y("Ask the commissar where the tractors come from"),
      detail: "He is answered by a language model, and he may spend the steel " +
        "either way or refuse it and buy abroad with gold. Nothing checks that " +
        "what he says is true; only that it is one of three words.",
      order: { ...base, build: "commissar" },
      why: agentEnabled ? undefined : 'he is not running; start with "./up.sh --agent"' },
    { key: "M", title: R("Ship everything the grade allows"),
      detail: "The largest export the harvest permits, whatever the towns need.",
      order: { ...base, exportGrain: grade === "bumper" ? "maximum" : "full" },
      why: mayExport("full") ? undefined : `a ${grade} harvest permits nothing beyond the surplus` },
  ];
}

function showOptions<O>(opts: Option<O>[], title: string): void {
  console.log(`\n  ${B(title)}   ${D("(a plan keeps its letter all game)")}\n`);
  for (const o of opts) {
    if (o.why) {
      console.log(D(`    ${o.key}. ${o.title.replace(/\x1b\[[0-9;]*m/g, "")} — not this year: ${o.why}`));
    } else {
      console.log(`    ${B(o.key + ".")} ${o.title}`);
      console.log(D(`       ${o.detail}`));
    }
  }
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
  console.log(`  ${n(war.mobilised)} were called up of ${n(war.available)} available, with`);
  console.log(`  ${Number(n(war.steelPerSoldier)).toFixed(2)} of steel apiece. The armaments decided how many had to go.`);
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

// ── The loop ─────────────────────────────────────────────────────────
// Two turns a year, and they ask different questions. In spring you commit
// hands and quota without knowing the weather; in autumn you dispose of what
// came, knowing exactly what it was. Separating them is the whole point: a
// quota fixed before the harvest is what a quota IS.

async function choose<O>(opts: Option<O>[], title: string): Promise<O> {
  showOptions(opts, title);
  for (;;) {
    await Deno.stdout.write(new TextEncoder().encode(`\n  ${B(">")} `));
    const line = await readLine();
    if (line === null) { console.log(D("\n  The plan is abandoned.\n")); Deno.exit(0); }
    const a = line.trim().toUpperCase();
    if (a === "") continue;
    const o = opts.find((x) => x.key === a);
    if (!o) { console.log(D(`  There is no plan ${a}.`)); continue; }
    if (o.why) { console.log(D(`  Plan ${a} is not available: ${o.why}.`)); continue; }
    console.log(D(`\n  ${o.title.replace(/\x1b\[[0-9;]*m/g, "")}. The orders go out.`));
    return o.order;
  }
}

function harvestNews(st: Dict): void {
  const h = st.harvest as Dict | null;
  if (!h) return;
  console.log(`\n  ${B("THE HARVEST IS IN")}\n`);
  console.log(`  ${GRADE[s0(h.grade)] ?? ""} ${C(String(n(h.grain)))} measures, ` +
    `${n(h.perWorker)} for every pair of hands on the land.`);
  if (n(h.withoutTractors) < n(h.grain)) {
    console.log(D(`  The same hands without tractors would have brought ${n(h.withoutTractors)}.`));
  }
  const short = n(st.villageShortfall);
  console.log(`  The quota you fixed in spring leaves the villages ${C(String(n(st.villageGrain)))}.`);
  if (short > 0) {
    console.log(R(`  That is ${short} short of what they need to eat. The quota does not move.`));
  } else {
    console.log(G(`  They will eat.`));
  }
}

if (import.meta.main) {
  const seedArg = Deno.args.indexOf("--seed");
  const seed = seedArg >= 0 ? Number(Deno.args[seedArg + 1]) : 1928;

  spiel();
  await ask({ tag: "Reset", seed });

  let last: Dict | null = null;
  for (;;) {
    const st = await ask({ tag: "Status" });
    if (st.over === true) break;

    if (st.season === "spring") {
      if (last) narrate(last);
      showState(st);
      console.log(D(`\n  ${B("SPRING")} — the hands and the quota are fixed now, before the weather.`));
      const order = await choose(springOptions(st), "SPRING — WHERE THE HANDS GO");
      await ask({ tag: "Sow", order });
    } else {
      harvestNews(st);
      const order = await choose(autumnOptions(st), "AUTUMN — WHAT BECOMES OF IT");
      last = await ask({ tag: "Reap", order });
    }
  }

  if (last) narrate(last);
  reckon(await ask({ tag: "Reckoning" }));
}
