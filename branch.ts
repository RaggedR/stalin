// branch.ts — the sequential combinator, for a `next` that routes.
//
// This file exists because of one limitation, described in full in
// typed-agent-routing.pdf. The library's `seqC` requires that `next` land in a
// single fibre of its right argument. A container is written as the union of
// its fibres and every combinator is a conditional type, so every combinator
// distributes over that union. Where the second argument's shapes sit inside a
// PRODUCT, as they do for the tensor, the product and the sum, that
// distribution is an isomorphism and nothing is lost. In `seqC` they sit
// inside a FUNCTION TYPE, and `(P -> _)` is a right adjoint. It preserves
// products and does not preserve coproducts. So `seqC(a, sumC(b, c))` computes
//
//     (a <| b) + (a <| c)          -- decide, THEN ask
//
// where routing needs
//
//     a <| (b + c)                 -- ask, THEN decide
//
// and the rewrite has silently moved the decision to before the question.
//
// `seqBranchC` below builds the second expression. It does not distribute over
// the right argument's fibres: `next` may return any of them, and the price is
// paid in the position, which becomes the union of that container's positions
// rather than the one indexed by the shape `next` chose. Which side answered is
// then a run-time question, exactly as it is for a sum.
//
// It is deliberately NOT in lib/. That directory is vendored verbatim from the
// tower project and records exactly one divergence from upstream. This is a
// game-level addition, and `seqC` is untouched: the five composites that do not
// route keep their exact indexed positions and pay nothing for this file.

import type { Cont, Fib, PosAt, Runner, Shape } from "./lib/algebra.ts";

/** Every position of a container, as a union. This is the widening. `PosAt`
 *  asks which fibre a shape lies in and answers with that fibre's positions.
 *  This asks nothing and answers with all of them, because after a `next` that
 *  branches there is no shape left to ask about. */
export type Positions<C extends Cont> = C extends Fib<unknown, infer P> ? P : never;

/** The undistributed sequential composite, as a container.
 *
 *  Read it beside `SeqC` in lib/algebra.ts. The two differ in one place. There,
 *  `next` returns `SB`, bound fibre by fibre as the conditional type
 *  distributes over `B`. Here it returns `Shape<B>`, the whole union, and `B`
 *  is never distributed over at all. That single change is what admits a
 *  routing `next`, and it is also what costs the indexed position: `second` is
 *  `Positions<B>` and not `PosAt<B, ...>`. */
export type SeqBranchC<A extends Cont, B extends Cont> =
  A extends Fib<infer SA, infer PA>
    ? Fib<{ first: SA; next: (r: PA) => Shape<B> },
          { first: PA; second: Positions<B> }>
    : never;

export interface SeqBranch<A extends Cont, B extends Cont>
  extends Runner<SeqBranchC<A, B>> {
  /** The same introduction rule as `seqC.step`, with one relaxation. `next` is
   *  still contextually typed at the fibre of `first`, so it receives the
   *  positions of the shape you actually gave. What it may return is now any
   *  shape of `B`, including one chosen after reading the reply. */
  step<SA extends Shape<A>>(
    first: SA,
    next: (r: PosAt<A, SA>) => Shape<B>,
  ): { first: SA; next: (r: PosAt<A, SA>) => Shape<B> };
}

export function seqBranchC<A extends Cont, B extends Cont>(
  a: Runner<A>,
  b: Runner<B>,
): SeqBranch<A, B> {
  return {
    label: `(${a.label} <| ${b.label})`,
    step: (first, next) => ({ first, next }),
    async run<S extends Shape<SeqBranchC<A, B>>>(shape: S, depth: number) {
      const s = shape as { first: Shape<A>; next: (r: unknown) => Shape<B> };
      // Identical to `seqC.run`, line for line. The difference between the two
      // combinators is entirely in the types: what changes is not what happens
      // at run time but what may be written down beforehand.
      const first = await a.run(s.first, depth);
      const second = await b.run(s.next(first), depth);
      return { first, second } as PosAt<SeqBranchC<A, B>, S>;
    },
  };
}
