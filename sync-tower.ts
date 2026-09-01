// sync-tower.ts — the same tower, with no async anywhere in the algebra.
// A hop blocks: outputSync spawns delegate.ts and waits for its stdout.
import type { Fib } from "./lib/algebra.ts";

type Cont = Fib<unknown, unknown>;
type Shape<C extends Cont> = C extends Fib<infer S, unknown> ? S : never;
type PosAt<C extends Cont, S> =
  C extends Fib<infer S1, infer P> ? (S extends S1 ? P : never) : never;

function delegateSync(port: number, prompt: unknown, depth: number): unknown {
  const script = new URL("./lib/delegate.ts", import.meta.url).pathname;
  const { code, stdout } = new Deno.Command("deno", {
    args: ["run", "--quiet", "--allow-net", "--allow-env",
           script, String(port), JSON.stringify(prompt), String(depth)],
    stdout: "piped", stderr: "inherit",
  }).outputSync();                      // <-- blocks. no Promise, no await.
  if (code !== 0) throw new Error(`delegate to :${port} exited ${code}`);
  return JSON.parse(new TextDecoder().decode(stdout));
}

interface SyncRunner<C extends Cont> {
  readonly fibres?: C;
  readonly label: string;
  run<S extends Shape<C>>(shape: S, depth: number): PosAt<C, S>;
}

function leafSync<C extends Cont>(label: string, port: number): SyncRunner<C> {
  return { label, run: <S extends Shape<C>>(shape: S, depth: number) =>
    delegateSync(port, shape, depth) as PosAt<C, S> };
}

/** Tensor, synchronously. Both shapes had to exist before the call, so their
 *  independence is enforced by the SHAPE TYPE, not by Promise.all. */
function tensorSync<A extends Cont, B extends Cont>(a: SyncRunner<A>, b: SyncRunner<B>) {
  return {
    label: `(${a.label} (x) ${b.label})`,
    both: <SA extends Shape<A>, SB extends Shape<B>>(left: SA, right: SB) => ({ left, right }),
    run<S extends { left: Shape<A>; right: Shape<B> }>(shape: S, depth: number) {
      const left = a.run(shape.left, depth);
      const right = b.run(shape.right, depth);   // one after the other
      return { left, right };
    },
  };
}

// ── run it against the live commissariats ────────────────────────────
type AgriC = Fib<{ tag: "Census" }, { trueOutput: number }>;
type IndC  = Fib<{ tag: "Census" }, { trueOutput: number }>;

const agri = leafSync<AgriC>("agri", 8802);
const ind  = leafSync<IndC>("industry", 8803);
const both = tensorSync(agri, ind);

const r = both.run(both.both({ tag: "Census" }, { tag: "Census" }), 0);
console.log("tensor over two real servers, no await:");
console.log("   agri.trueOutput     =", r.left.trueOutput);   // typed, uncast
console.log("   industry.trueOutput =", r.right.trueOutput);
