// algebra.ts — the four combinators of §5, first class.
//
// The note that accompanies the hand-wired tower ended by saying this was the
// hard part, because seqC's shape is a dependent pair
//
//     (s : c.Shape ** c.Pos s -> d.Shape)
//
// and TypeScript has no Sigma-types. That is true of Sigma over an arbitrary
// index. It is NOT true over a *finite* index, and every container here has a
// finite shape type — a tagged union. Over such an index,
//
//     Sigma (s : S). B s   =   union over s in S of  { s } x B s
//
// and a conditional type distributes over a union. So the whole construction
// works if a container is presented not as a pair (Shape, Pos) but as its
// GRAPH: the union of its fibres.

import { delegate, trace } from "./wire.ts";

// ── A container is a union of fibres ──────────────────────────────────
/** One fibre: a shape, and the type of positions over it. Never constructed —
 *  this is a type-level record, the object-language of Fam(Set^op). */
export interface Fib<S, P> {
  readonly shape: S;
  readonly pos: P;
}

export type Cont = Fib<unknown, unknown>;

/** The shape type: the union of the fibres' shapes. */
export type Shape<C extends Cont> = C extends Fib<infer S, unknown> ? S : never;

/** R applied: the positions over ONE shape. This is the dependent lookup.
 *
 *  Note the direction of the test. `Extract<C, Fib<S, unknown>>` would keep the
 *  fibres assignable TO the query, but a shape you actually hold is usually
 *  NARROWER than its fibre's declared shape (literal types, a specific tag).
 *  What we want is the fibre this shape lies in — `S extends S1`, not the
 *  reverse. It picks out exactly one fibre because the shapes are disjoint. */
export type PosAt<C extends Cont, S> =
  C extends Fib<infer S1, infer P> ? (S extends S1 ? P : never) : never;

type TagOf<S> = S extends { tag: infer T extends string } ? T : never;

// ── The four monoidal structures, as type-level operations ────────────
// Each is a distributive conditional type, so each computes the union of
// fibres of the composite. Read them beside Appendix B: the shape line and
// the position line of each definition are the two `Fib` arguments.

/** sum (+) — routing. Shapes are a disjoint union; each keeps its own positions. */
export type SumC<A extends Cont, B extends Cont> =
  | (A extends Fib<infer S, infer P> ? Fib<{ side: "left"; value: S }, P> : never)
  | (B extends Fib<infer S, infer P> ? Fib<{ side: "right"; value: S }, P> : never);

/** tensor (⊠) — parallelisation. Shapes multiply AND positions multiply. */
export type TensorC<A extends Cont, B extends Cont> =
  A extends Fib<infer SA, infer PA>
    ? B extends Fib<infer SB, infer PB>
      ? Fib<{ left: SA; right: SB }, { left: PA; right: PB }>
      : never
    : never;

/** product (×) — the pattern the maths predicted. Shapes multiply exactly as
 *  for the tensor; positions are a SUM. Prompt both sides, answer one. */
export type ProductC<A extends Cont, B extends Cont> =
  A extends Fib<infer SA, infer PA>
    ? B extends Fib<infer SB, infer PB>
      ? Fib<{ a: SA; b: SB }, { side: "a"; value: PA } | { side: "b"; value: PB }>
      : never
    : never;

/** sequential composition (◁) — the dependent pair, fibrewise.
 *
 *  Note what `next` receives in each fibre: `PA`, the positions of THAT shape,
 *  not the union of all of A's positions. That is the dependency, and it is
 *  the thing the previous note said TypeScript could not express.
 *
 *  The fibres are indexed by PAIRS (SA, SB): a first shape, together with a
 *  function landing in one particular second shape. Appendix B's ◁ is slightly
 *  larger — there, `next` may return a different shape of `d` for different
 *  positions, so the composite position is a genuine
 *
 *      Sigma (p : c.Pos s). d.Pos (v p)
 *
 *  and Sigma over `c.Pos s` is Sigma over an INFINITE index, which does not
 *  distribute. Restricting `next` to a single fibre is what buys the position
 *  type back: it becomes the plain product below. What is lost is a `next`
 *  that branches between shapes of `d`; such a function has a union return
 *  type and lies in no single fibre. See §"where it still leaks" in the note. */
export type SeqC<A extends Cont, B extends Cont> =
  A extends Fib<infer SA, infer PA>
    ? B extends Fib<infer SB, infer PB>
      ? Fib<{ first: SA; next: (r: PA) => SB }, { first: PA; second: PB }>
      : never
    : never;

// ── Runners: a container together with a way of answering it ──────────
/** A container that can actually be prompted. `run` is `(p : P) -> R p`:
 *  give it a shape, get back a position OVER THAT SHAPE. */
export interface Runner<C extends Cont> {
  /** Phantom; never assigned. It exists so that `C` occurs in an INFERABLE
   *  position. Everywhere else `C` is mentioned only inside conditional types
   *  (`Shape<C>`, `PosAt<C, S>`), and TypeScript cannot infer a type argument
   *  from a conditional type — without this line, `seqC(a, b)` silently infers
   *  `A = Cont` and every position downstream becomes `unknown`. */
  readonly fibres?: C;
  readonly label: string;
  run<S extends Shape<C>>(shape: S, depth: number): Promise<PosAt<C, S>>;
}

/** The container a runner serves. `Of<typeof gather>` reads back the fibres. */
export type Of<R> = R extends Runner<infer C> ? C : never;

/** Per-shape decoders for a leaf. Keyed by tag, so each entry is checked
 *  against its own concrete position type — the Handlers pattern again. */
export type Decoders<C extends Cont> = {
  [K in TagOf<Shape<C>>]: (u: unknown) => PosAt<C, Extract<Shape<C>, { tag: K }>> | null;
};

/** A leaf: a container served by a server on a port. Running it means firing
 *  the prompt down a CLI hop and validating what comes back. */
export function leaf<C extends Cont>(
  label: string,
  port: number,
  decoders: Decoders<C>,
): Runner<C> {
  return {
    label,
    async run<S extends Shape<C>>(shape: S, depth: number): Promise<PosAt<C, S>> {
      const raw = await delegate(port, shape, depth);
      const tag = (shape as { tag: TagOf<Shape<C>> }).tag;
      const decode = decoders[tag];
      const value = decode(raw);
      if (value === null) {
        throw new Error(`${label}/${String(tag)}: reply did not validate`);
      }
      return value as PosAt<C, S>;
    },
  };
}

// ── The combinators as values ─────────────────────────────────────────
// Each returns a Runner for the composite container, plus the introduction
// rule for its shapes. The shape constructors are where the typing is won:
// they are generic in the fibre, so the checker knows which fibre you are in.

export interface Sum<A extends Cont, B extends Cont> extends Runner<SumC<A, B>> {
  left<S extends Shape<A>>(value: S): { side: "left"; value: S };
  right<S extends Shape<B>>(value: S): { side: "right"; value: S };
}

export function sumC<A extends Cont, B extends Cont>(
  a: Runner<A>,
  b: Runner<B>,
): Sum<A, B> {
  return {
    label: `(${a.label} + ${b.label})`,
    left: (value) => ({ side: "left", value }),
    right: (value) => ({ side: "right", value }),
    async run<S extends Shape<SumC<A, B>>>(shape: S, depth: number) {
      const s = shape as { side: "left" | "right"; value: Shape<A> & Shape<B> };
      // The router reads which summand the prompt lies in. Note the position
      // is NOT re-tagged: pos (Left p) = c.Pos p, exactly as in Appendix B.
      const value = s.side === "left"
        ? await a.run(s.value, depth)
        : await b.run(s.value, depth);
      return value as PosAt<SumC<A, B>, S>;
    },
  };
}

export interface Tensor<A extends Cont, B extends Cont> extends Runner<TensorC<A, B>> {
  both<SA extends Shape<A>, SB extends Shape<B>>(
    left: SA, right: SB,
  ): { left: SA; right: SB };
}

export function tensorC<A extends Cont, B extends Cont>(
  a: Runner<A>,
  b: Runner<B>,
): Tensor<A, B> {
  return {
    label: `(${a.label} (x) ${b.label})`,
    both: (left, right) => ({ left, right }),
    async run<S extends Shape<TensorC<A, B>>>(shape: S, depth: number) {
      const s = shape as { left: Shape<A>; right: Shape<B> };
      // Both sides are prompted and BOTH replies are owed. The Promise.all is
      // not an optimisation here; it is the definition.
      const [left, right] = await Promise.all([
        a.run(s.left, depth),
        b.run(s.right, depth),
      ]);
      return { left, right } as PosAt<TensorC<A, B>, S>;
    },
  };
}

export interface Product<A extends Cont, B extends Cont> extends Runner<ProductC<A, B>> {
  offer<SA extends Shape<A>, SB extends Shape<B>>(a: SA, b: SB): { a: SA; b: SB };
}

/** The product needs a policy, because a container does not choose — the
 *  program implementing `(p : P) -> R p` does, and this runner is that
 *  program. Both sides are offered; exactly one is answered. */
export function productC<A extends Cont, B extends Cont>(
  a: Runner<A>,
  b: Runner<B>,
  choose: (shape: { a: Shape<A>; b: Shape<B> }) => "a" | "b",
): Product<A, B> {
  return {
    label: `(${a.label} x ${b.label})`,
    offer: (x, y) => ({ a: x, b: y }),
    async run<S extends Shape<ProductC<A, B>>>(shape: S, depth: number) {
      const s = shape as { a: Shape<A>; b: Shape<B> };
      const side = choose(s);
      const value = side === "a"
        ? await a.run(s.a, depth)
        : await b.run(s.b, depth);
      return { side, value } as PosAt<ProductC<A, B>, S>;
    },
  };
}

export interface Seq<A extends Cont, B extends Cont> extends Runner<SeqC<A, B>> {
  /** The dependent pair's introduction rule. `SA` is inferred from `first`,
   *  so `next` is contextually typed at THAT fibre: it receives the positions
   *  of the shape you actually gave, not a union over all of them. */
  step<SA extends Shape<A>, SB extends Shape<B>>(
    first: SA,
    next: (r: PosAt<A, SA>) => SB,
  ): { first: SA; next: (r: PosAt<A, SA>) => SB };
}

export function seqC<A extends Cont, B extends Cont>(
  a: Runner<A>,
  b: Runner<B>,
): Seq<A, B> {
  return {
    label: `(${a.label} <| ${b.label})`,
    step: (first, next) => ({ first, next }),
    async run<S extends Shape<SeqC<A, B>>>(shape: S, depth: number) {
      const s = shape as { first: Shape<A>; next: (r: unknown) => Shape<B> };
      // Prompt the first container; its reply CHOOSES the second prompt. That
      // application of `next` is the whole content of <| — the composite's
      // shape carried a function, and here is where it is used.
      const first = await a.run(s.first, depth);
      const second = await b.run(s.next(first), depth);
      return { first, second } as PosAt<SeqC<A, B>, S>;
    },
  };
}

/** Announce a composite before running it, so the trace shows the expression
 *  as well as the hops it turns into. */
export function announce(r: Runner<Cont>, depth: number): void {
  trace(depth, "down", "flow", r.label);
}
