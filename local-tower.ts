// local-tower.ts — the container algebra with NO http, NO processes, NO event
// loop, NO async. Just function calls. The typing is identical.
import type { Fib } from "./lib/algebra.ts";

type Cont = Fib<unknown, unknown>;
type Shape<C extends Cont> = C extends Fib<infer S, unknown> ? S : never;
type PosAt<C extends Cont, S> =
  C extends Fib<infer S1, infer P> ? (S extends S1 ? P : never) : never;

interface Runner<C extends Cont> {
  readonly fibres?: C;
  readonly label: string;
  run<S extends Shape<C>>(shape: S): PosAt<C, S>;
}

/** A leaf that is just a handler table. No port, no wire, no JSON. */
function local<C extends Cont>(
  label: string,
  handlers: Record<string, (p: never) => unknown>,
): Runner<C> {
  return { label, run: <S extends Shape<C>>(shape: S) =>
    handlers[(shape as { tag: string }).tag](shape as never) as PosAt<C, S> };
}

function tensor<A extends Cont, B extends Cont>(a: Runner<A>, b: Runner<B>) {
  return {
    label: `(${a.label} (x) ${b.label})`,
    both: <SA extends Shape<A>, SB extends Shape<B>>(l: SA, r: SB) => ({ left: l, right: r }),
    run: <SA extends Shape<A>, SB extends Shape<B>>(s: { left: SA; right: SB }) =>
      ({ left: a.run(s.left), right: b.run(s.right) }),
  };
}

function seq<A extends Cont, B extends Cont>(a: Runner<A>, b: Runner<B>) {
  return {
    label: `(${a.label} <| ${b.label})`,
    step: <SA extends Shape<A>, SB extends Shape<B>>(first: SA, next: (r: PosAt<A, SA>) => SB) =>
      ({ first, next }),
    run: <SA extends Shape<A>, SB extends Shape<B>>(s: { first: SA; next: (r: PosAt<A, SA>) => SB }) => {
      const first = a.run(s.first);
      return { first, second: b.run(s.next(first)) };
    },
  };
}

// ── two containers ────────────────────────────────────────────────────
type FieldC =
  | Fib<{ tag: "Harvest"; hands: number }, { grain: number; grade: "poor" | "good" }>
  | Fib<{ tag: "Census" }, { hands: number }>;
type RailC = Fib<{ tag: "Haul"; grain: number }, { moved: number; stranded: number }>;

const fields = local<FieldC>("fields", {
  Harvest: (p: { hands: number }) => ({ grain: p.hands * 2.4, grade: p.hands > 50 ? "good" : "poor" }),
  Census: () => ({ hands: 105 }),
});
const rail = local<RailC>("rail", {
  Haul: (p: { grain: number }) => ({ moved: Math.min(p.grain, 80), stranded: Math.max(0, p.grain - 80) }),
});

// tensor: both asked, both answer
const t = tensor(fields, fields);
const pair = t.run(t.both({ tag: "Harvest", hands: 105 }, { tag: "Census" }));
const g: number = pair.left.grain;      // typed HarvestReport — uncast
const h: number = pair.right.hands;     // typed CensusReturn  — uncast

// seq: the second prompt is BUILT from the first reply
const s = seq(fields, rail);
const chain = s.run(s.step({ tag: "Harvest", hands: 105 }, (r) => ({ tag: "Haul", grain: r.grain })));

console.log("no http, no processes, no event loop, no async:");
console.log(`   tensor  grain ${g}  hands ${h}`);
console.log(`   seq     reaped ${chain.first.grain} (${chain.first.grade})` +
            `  ->  moved ${chain.second.moved}, stranded ${chain.second.stranded}`);
