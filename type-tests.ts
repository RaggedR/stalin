// type-tests.ts — the game's rules, asserted against the compiler.
//
// Checked, never run. Every `@ts-expect-error` asserts that the next line IS
// an error; TypeScript reports an unused directive as an error in its own
// right, so this file fails both if a legal move is rejected and if an illegal
// one is accepted.
//
// The claim: an illegal move is not something the engine rejects at run time.
// It is something that cannot be written down.

import {
  type Advice, type ArmamentsC, type ExportChoice, type ImportC,
  type SteelTrade, type TractorWorksC, exportPlan, steelPlan,
} from "./containers.ts";
import { leaf, productC, sumC } from "./lib/algebra.ts";

const expect = <T>(_x: T): void => {};

// ── The harvest gate ──────────────────────────────────────────────────
// After a failed harvest there is exactly one export decision in existence.
expect<ExportChoice<"failure">>("none");
// @ts-expect-error  and it is not this one
expect<ExportChoice<"failure">>("surplus");

// A poor harvest permits letting the genuine surplus go, and nothing beyond it.
expect<ExportChoice<"poor">>("surplus");
// @ts-expect-error  "full" means shipping the quota regardless; not on a poor year
expect<ExportChoice<"poor">>("full");

// Only a bumper harvest admits stripping the villages.
expect<ExportChoice<"bumper">>("maximum");
// @ts-expect-error  an adequate harvest does not
expect<ExportChoice<"adequate">>("maximum");

const legal1 = exportPlan("failure", "none");
const legal2 = exportPlan("bumper", "maximum");
const legal3 = exportPlan("adequate", "full");

// @ts-expect-error  the moral centre of the game, enforced by the checker
const famine = exportPlan("failure", "maximum");
// @ts-expect-error  and its lesser form
const squeeze = exportPlan("poor", "full");

// ── The steel gate: the arc of the whole game, as a change of fibre ───
expect<SteelTrade<"deficit">>("buy");
// @ts-expect-error  you cannot sell steel you have not got
expect<SteelTrade<"deficit">>("sell");

// Selling steel does not exist in any fibre. A country that exports its steel
// is not industrialising, so the option was removed from the game — and the
// type is where "removed" is enforced. Once out of deficit there is simply
// nothing to decide, which is a fibre with one inhabitant, not a disabled
// button.
expect<SteelTrade<"surplus">>("none");
// @ts-expect-error  there is no selling steel, in surplus or anywhere else
expect<SteelTrade<"surplus">>("sell");
// @ts-expect-error  and once in surplus there is nothing to buy either
expect<SteelTrade<"surplus">>("buy");

expect<SteelTrade<"balanced">>("none");
// @ts-expect-error
expect<SteelTrade<"balanced">>("sell");
// @ts-expect-error
expect<SteelTrade<"balanced">>("buy");

const buy = steelPlan("deficit", "buy");
const hold = steelPlan("surplus", "none");
// @ts-expect-error
const impossible = steelPlan("deficit", "sell");

// ── The gate is fibrewise, not a blanket restriction ──────────────────
// The same function, called at two different grades, accepts two different
// sets of arguments. That is the dependency: `choice` is typed at the grade
// you actually passed, not at the union of all grades.
const atFailure: { grade: "failure"; choice: "none" } = exportPlan("failure", "none");
const atBumper: { grade: "bumper"; choice: "none" | "surplus" | "full" | "maximum" } =
  exportPlan("bumper", "full");

// ── The sum keeps its summands apart ──────────────────────────────────
// Routing is a claim about which side a prompt belongs to, and the claim is
// checked. `route.left` takes a shape of the product and `route.right` a shape
// of the import container, and neither will take the other's.
const route = sumC(
  productC(
    leaf<TractorWorksC>("tractors", 8803, { BuildTractors: () => null }),
    leaf<ArmamentsC>("armaments", 8803, { BuildArmaments: () => null }),
    () => "a",
  ),
  leaf<ImportC>("import", 8805, { BuyTractors: () => null }),
);

const abroad = route.right({ tag: "BuyTractors", gold: 100, year: 1931 });
// @ts-expect-error  a domestic prompt is not a prompt of the right summand
const misrouted = route.right({ tag: "BuildTractors", steel: 10, plantCapacity: 20, year: 1931 });
// @ts-expect-error  and the import container has no such fibre either
const notAFibre = route.right({ tag: "BuildArmaments", steel: 10, year: 1931 });

// ── The commissar may say exactly three words ─────────────────────────
// Nothing enforces this at the far end: the reply is written by a language
// model and arrives as text. What the type does is oblige the decoder in
// `gosplan.server.ts` to establish it, and oblige every reader of an `Advice`
// to have handled only these three cases.
expect<Advice["recommend"]>("tractors");
expect<Advice["recommend"]>("armaments");
expect<Advice["recommend"]>("buy");
// @ts-expect-error  a fourth word is not a thing he can be understood to say
expect<Advice["recommend"]>("potatoes");
