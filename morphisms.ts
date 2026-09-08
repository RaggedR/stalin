// morphisms.ts — container morphisms as values.
//
// `lib/algebra.ts` gives the four combinators and `Runner<C>`: a container
// together with a way of answering it. It gives no value for a general morphism
// of containers. Ghani's note writes one as a pair
//
//     u : S -> Q                        the delegate leg, shapes forward
//     f : (s : S) -> T (u s) -> P s     the amalgamate leg, positions back
//
// and the obstruction to holding that as a value is the second line. For a fixed
// `s` the pair (u s, f s) has type
//
//     Sigma (j : Q). (T j -> P s)
//
// where the FIRST component is chosen by the implementation and appears in the
// type of the second. That is an existential, and TypeScript has no existential
// types. `Runner<C>` escapes the problem by fixing Q to (1,1) — one prompt, one
// response — where the Sigma has a single summand and vanishes. It is the hom into
// (1,1) and nothing else.
//
// An existential is Church-encodable:
//
//     exists j. F j   ~=   forall Z. (forall j. F j -> Z) -> Z
//
// and the right-hand side needs only rank-2 polymorphism, which TypeScript has as
// a generic method signature in an object type. `Runner.run<S>` in lib/ is
// already that. So `j` never becomes a type; it becomes a scope. Everything below
// follows from that one move.
//
// This file is deliberately NOT in lib/. That directory is vendored verbatim from
// the tower project and records exactly one divergence from upstream. If the
// construction here is right it belongs upstream, but it is a game-level addition
// until someone decides that.

import type { Cont, Fib, PosAt, Runner, Shape } from "./lib/algebra.ts";

// ── The one-shape container, (1,1) ────────────────────────────────────
/** One shape, one position. Ghani writes it `I = (Unit, \_ => Unit)`; the Julia
 *  implementation of the same algebra calls it `Id` and writes the pair as
 *  `(1,1)`, which is the notation used here because it keeps three different
 *  empty-looking interfaces apart. `(1,1)` is the
 *  unit for the tensor and for sequencing; `(1,0)` — one prompt, NO valid response
 *  — is the unit for the product, and a morphism into that one is not an answerer
 *  but the unique map to a terminal object.
 *
 *  A morphism into `(1,1)` is exactly a direct answerer, which is what `asMorph`
 *  and `asRunner` below witness. */
export type IdC = Fib<"unit", null>;

export const idRunner: Runner<IdC> = {
  label: "I",
  run: <S extends Shape<IdC>>(_shape: S, _depth: number) =>
    Promise.resolve(null as PosAt<IdC, S>),
};

// ── A morphism ────────────────────────────────────────────────────────
/** `Morph<C, D>` — implement C's interface by delegating to D's.
 *
 *  `delegate` does not RETURN the codomain shape and the amalgamate leg; it
 *  passes them to a continuation `k`, which is generic in that shape. So `k`
 *  receives a `j` of some particular shape type `SD` together with the back-map
 *  for THAT `SD`, and the two cannot come apart. Reading the signature as the
 *  Sigma it encodes:
 *
 *      delegate(s, k)  ==  k  applied to  (j, back) : Sigma (j : Shape<D>).
 *                                            (PosAt<D,j> -> PosAt<C,s>)
 *
 *  `Z` is whatever the caller wants back. `drive` instantiates it to a promise;
 *  `composeM` and `tensorM` instantiate it to the outer continuation's own `Z`,
 *  which is why they need no promise of their own.
 *
 *  What this is for: a `Morph<C, D>` is a value even when nothing implements D.
 *  A `Runner<C>` cannot be — it holds the answers. */
export interface Morph<C extends Cont, D extends Cont> {
  /** Phantoms, never assigned. They exist so `C` and `D` occur in inferable
   *  positions; elsewhere they appear only inside conditional types, from which
   *  TypeScript cannot infer. `Runner.fibres` is there for the same reason. */
  readonly dom?: C;
  readonly cod?: D;
  readonly label: string;
  delegate<S extends Shape<C>, Z>(
    shape: S,
    k: <SD extends Shape<D>>(
      j: SD,
      back: (reply: PosAt<D, SD>) => PosAt<C, S>,
    ) => Z,
  ): Z;
}

// ── Driving a morphism against the level below ────────────────────────
/** Supply a morphism with an implementation of its codomain, and get an
 *  implementation of its domain. The prompt goes down through `j`; the reply
 *  comes back up through `back`. `Z` is instantiated to the promise here, which
 *  is the only place in this file that awaits anything. */
export function drive<C extends Cont, D extends Cont>(
  m: Morph<C, D>,
  below: Runner<D>,
  label = `${m.label}<-${below.label}`,
): Runner<C> {
  return {
    label,
    run: <S extends Shape<C>>(shape: S, depth: number): Promise<PosAt<C, S>> =>
      m.delegate<S, Promise<PosAt<C, S>>>(
        shape,
        async (j, back) => back(await below.run(j, depth)),
      ),
  };
}

// ── Runner is the hom into (1,1) ──────────────────────────────────────
/** A direct answerer, read as a morphism into (1,1). The delegate leg carries no
 *  information and the amalgamate leg ignores (1,1)'s single position, so all the
 *  content is the original `run`. */
export function asMorph<C extends Cont>(r: Runner<C>): Morph<C, IdC> {
  return {
    label: r.label,
    delegate: <S extends Shape<C>, Z>(
      shape: S,
      k: <SD extends Shape<IdC>>(
        j: SD,
        back: (reply: PosAt<IdC, SD>) => PosAt<C, S>,
      ) => Z,
    ) =>
      k(
        "unit" as Shape<IdC>,
        (_reply) => r.run(shape, 0) as unknown as PosAt<C, S>,
      ),
  };
}

/** And back the other way, which is what makes it an isomorphism rather than a
 *  one-way reading. */
export function asRunner<C extends Cont>(m: Morph<C, IdC>): Runner<C> {
  return {
    label: m.label,
    run: <S extends Shape<C>>(shape: S, depth: number) =>
      m.delegate<S, Promise<PosAt<C, S>>>(
        shape,
        async (j, back) => back(await idRunner.run(j, depth)),
      ),
  };
}

// ── The category ──────────────────────────────────────────────────────
/** The identity morphism: pass the shape straight down, pass the position
 *  straight back. */
export function idM<C extends Cont>(label = "id"): Morph<C, C> {
  return {
    label,
    delegate: <S extends Shape<C>, Z>(
      shape: S,
      k: <SD extends Shape<C>>(
        j: SD,
        back: (reply: PosAt<C, SD>) => PosAt<C, S>,
      ) => Z,
    ) => k(shape, (reply) => reply as unknown as PosAt<C, S>),
  };
}

/** `C -> D` followed by `D -> E`. The two delegate legs fire on the way down and
 *  the two amalgamate legs compose on the way back up. Note that the inner
 *  `delegate` is instantiated at the OUTER `Z`: the continuations nest, so the
 *  composite never has to name the intermediate shape. */
export function composeM<C extends Cont, D extends Cont, E extends Cont>(
  m: Morph<C, D>,
  n: Morph<D, E>,
): Morph<C, E> {
  return {
    label: `(${m.label} ; ${n.label})`,
    delegate: <S extends Shape<C>, Z>(
      shape: S,
      k: <SE extends Shape<E>>(
        j: SE,
        back: (reply: PosAt<E, SE>) => PosAt<C, S>,
      ) => Z,
    ) =>
      m.delegate<S, Z>(shape, (jd, backCD) =>
        n.delegate<typeof jd, Z>(jd, (je, backDE) =>
          k(je, (reply) => backCD(backDE(reply))))),
  };
}

// ── The tensor, on objects and on arrows ──────────────────────────────
/** The tensor of two containers: shapes multiply and positions multiply. Stated
 *  locally rather than imported so this file depends only on `lib/`'s type
 *  vocabulary, not on its export list. The arithmetic is `TensorC`'s. */
export type TensorOf<A extends Cont, B extends Cont> = A extends
  Fib<infer SA, unknown>
  ? B extends Fib<infer SB, unknown>
    ? A extends Fib<unknown, infer PA>
      ? B extends Fib<unknown, infer PB>
        ? Fib<{ left: SA; right: SB }, { left: PA; right: PB }>
      : never
    : never
  : never
  : never;

/** `Morph<A,B> x Morph<C,D> -> Morph<A (x) C, B (x) D>` — the tensor's action on
 *  arrows, which is what makes it a bifunctor rather than a construction on
 *  objects. `lib/`'s `tensorC` is this map's special case at `B = D = I`.
 *
 *  This function is the reason the existential has to be reachable. Both
 *  codomain shapes must be in hand BEFORE either is fired, because the tensor
 *  supplies one prompt carrying both and owes one reply carrying both. An
 *  encoding that hides `j` inside a method taking the level below cannot write
 *  it: there is no way to split a `Runner<B (x) D>` into a `Runner<B>` and a
 *  `Runner<D>`, and inventing the other side's prompt is exactly what the tensor
 *  forbids.
 *
 *  Nesting the two continuations solves it. In the inner scope both `jb` and `jd`
 *  are bound, so they can be paired; the paired reply is then split and handed to
 *  the two amalgamate legs. */
export function tensorM<
  A extends Cont,
  B extends Cont,
  C extends Cont,
  D extends Cont,
>(m: Morph<A, B>, n: Morph<C, D>): Morph<TensorOf<A, C>, TensorOf<B, D>> {
  return {
    label: `(${m.label} (x) ${n.label})`,
    delegate: <S extends Shape<TensorOf<A, C>>, Z>(
      shape: S,
      k: <SBD extends Shape<TensorOf<B, D>>>(
        j: SBD,
        back: (reply: PosAt<TensorOf<B, D>, SBD>) => PosAt<TensorOf<A, C>, S>,
      ) => Z,
    ) => {
      const s = shape as { left: Shape<A>; right: Shape<C> };
      return m.delegate<Shape<A>, Z>(s.left, (jb, backAB) =>
        n.delegate<Shape<C>, Z>(s.right, (jd, backCD) =>
          k(
            { left: jb, right: jd } as unknown as Shape<TensorOf<B, D>>,
            (reply) => {
              const p = reply as unknown as { left: unknown; right: unknown };
              return {
                left: backAB(p.left as PosAt<B, typeof jb>),
                right: backCD(p.right as PosAt<D, typeof jd>),
              } as unknown as PosAt<TensorOf<A, C>, S>;
            },
          )));
    },
  };
}

// ── A coherence map ───────────────────────────────────────────────────
/** The associator for the tensor. Nothing else in this repository is a map
 *  between two composite containers, because until now there was no type whose
 *  values are such maps.
 *
 *  Its content is re-tupling: forward on shapes, and the mirror of that backward
 *  on positions. That it does nothing else is the point — a law needs an arrow to
 *  live in, and this is the arrow. */
export function assocTensor<A extends Cont, B extends Cont, C extends Cont>():
  Morph<TensorOf<TensorOf<A, B>, C>, TensorOf<A, TensorOf<B, C>>> {
  type L = TensorOf<TensorOf<A, B>, C>;
  type R = TensorOf<A, TensorOf<B, C>>;
  return {
    label: "assoc",
    delegate: <S extends Shape<L>, Z>(
      shape: S,
      k: <SR extends Shape<R>>(
        j: SR,
        back: (reply: PosAt<R, SR>) => PosAt<L, S>,
      ) => Z,
    ) => {
      const s = shape as unknown as {
        left: { left: unknown; right: unknown };
        right: unknown;
      };
      const j = {
        left: s.left.left,
        right: { left: s.left.right, right: s.right },
      } as unknown as Shape<R>;
      return k(j, (reply) => {
        const p = reply as unknown as {
          left: unknown;
          right: { left: unknown; right: unknown };
        };
        return {
          left: { left: p.left, right: p.right.left },
          right: p.right.right,
        } as unknown as PosAt<L, S>;
      });
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// The example the note quotes. Three containers, none of them the game's.
// ══════════════════════════════════════════════════════════════════════

/** Ask a question, get prose back. */
type Ask = Fib<{ tag: "Ask"; q: string }, { answer: string }>;
/** Look a key up, get a number back. */
type Fetch = Fib<{ tag: "Fetch"; key: string }, { value: number }>;
/** Write a line, get an acknowledgement back. */
type Log = Fib<{ tag: "Log"; line: string }, { ok: boolean }>;

/** A morphism written with no implementation of `Fetch` in scope anywhere. The
 *  delegate leg turns the question into a lookup; the amalgamate leg turns the
 *  number into the prose that was owed. */
export const asking: Morph<Ask, Fetch> = {
  label: "asking",
  delegate: <S extends Shape<Ask>, Z>(
    shape: S,
    k: <SD extends Shape<Fetch>>(
      j: SD,
      back: (reply: PosAt<Fetch, SD>) => PosAt<Ask, S>,
    ) => Z,
  ) => {
    const s = shape as { tag: "Ask"; q: string };
    return k(
      { tag: "Fetch", key: s.q } as const,
      (reply) =>
        ({ answer: `${s.q} = ${reply.value}` }) as unknown as PosAt<Ask, S>,
    );
  },
};

/** A second morphism, so there is something to compose with. It answers a lookup
 *  by writing a line and counting the key's letters. */
export const fetchViaLog: Morph<Fetch, Log> = {
  label: "fetchViaLog",
  delegate: <S extends Shape<Fetch>, Z>(
    shape: S,
    k: <SD extends Shape<Log>>(
      j: SD,
      back: (reply: PosAt<Log, SD>) => PosAt<Fetch, S>,
    ) => Z,
  ) => {
    const s = shape as { tag: "Fetch"; key: string };
    return k(
      { tag: "Log", line: `fetch ${s.key}` } as const,
      (reply) =>
        ({ value: reply.ok ? s.key.length : -1 }) as unknown as PosAt<Fetch, S>,
    );
  },
};

const logger: Runner<Log> = {
  label: "logger",
  run: <S extends Shape<Log>>(shape: S, _depth: number) => {
    const p = shape as { tag: "Log"; line: string };
    console.log(`      [log] ${p.line}`);
    return Promise.resolve({ ok: true } as unknown as PosAt<Log, S>);
  },
};

const fetcher: Runner<Fetch> = {
  label: "fetcher",
  run: <S extends Shape<Fetch>>(_shape: S, _depth: number) =>
    Promise.resolve({ value: 42 } as unknown as PosAt<Fetch, S>),
};

/** A tensor of two lookups, answered by one server. It prints the single prompt
 *  it received, which is how the trace shows that both sides went down together. */
const pairedFetch: Runner<TensorOf<Fetch, Fetch>> = {
  label: "fetcher (x) fetcher",
  run: <S extends Shape<TensorOf<Fetch, Fetch>>>(shape: S, _depth: number) => {
    const p = shape as unknown as { left: { key: string }; right: { key: string } };
    console.log(`      [tensor] one prompt, both sides: ${p.left.key} & ${p.right.key}`);
    return Promise.resolve(
      { left: { value: 1 }, right: { value: 2 } } as unknown as PosAt<
        TensorOf<Fetch, Fetch>,
        S
      >,
    );
  },
};

export async function main() {
  console.log("1. drive a morphism against an implementation");
  console.log("  ", await drive(asking, fetcher).run({ tag: "Ask", q: "depth" }, 0));

  console.log("2. compose two morphisms, then drive the composite");
  const twoHops = composeM(asking, fetchViaLog);
  console.log("   label:", twoHops.label);
  console.log("  ", await drive(twoHops, logger).run({ tag: "Ask", q: "cadmium" }, 0));

  console.log("3. a Runner as a morphism into I, and back");
  console.log("  ", await asRunner(asMorph(fetcher)).run({ tag: "Fetch", key: "x" }, 0));

  console.log("4. the tensor acting on arrows");
  const both = tensorM(asking, asking);
  console.log("   label:", both.label);
  console.log(
    "  ",
    await drive(both, pairedFetch).run(
      { left: { tag: "Ask", q: "steel" }, right: { tag: "Ask", q: "grain" } } as unknown as Shape<
        TensorOf<Ask, Ask>
      >,
      0,
    ),
  );

  console.log("5. an associator, as a value");
  console.log("   label:", assocTensor<Ask, Fetch, Log>().label);
}

if (import.meta.main) await main();
