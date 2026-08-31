# stalin

The First Five-Year Plan as a container. Five servers, five decisions, one
reckoning.

Built on the four combinators of §5 of Neil Ghani's *Containers for Typed
Agentic AI* — `+`, `⊠`, `◁`, `×` as first-class values, vendored unmodified
into [`lib/`](lib/). That reuse is itself the test of whether that library is
a library or just some code that worked once.

Requires [Deno](https://deno.com) 2.x. No install step, no lockfile, no
dependencies beyond the standard library.

```
  you ──$ stalin plan ...──▶ [ 8801 gosplan ]                    the Plan
                    ┌──────────────┼──────────────┐
        [8802 agriculture]  [8803 industry]  [8804 transport]    commissariats
                                   │
                          [8805 foreign trade]
```

The original design brief is in
[`game-description.txt`](game-description.txt); how Ghani's containers were
actually used to build it is in [`implementation.pdf`](implementation.pdf)
(source: `implementation.tex`, built with `tectonic`).

## The game

Industrialise, and win the war in 1941. Both are paid for in the same currency.

```
  grain ──sell──▶ gold ──hire──▶ engineers ──▶ STEEL ──┬──▶ tractors ──▶ more grain
    ▲                                                  ├──▶ railway ──▶ throughput
    │                                                  └──▶ war reserve ──▶ fewer soldiers die
  peasants eat it — and every one who starves is also
  a soldier absent from the line in 1941
```

**Steel and soldiers are substitutes.** The same victory can be bought with
more of one or more of the other, and the price of the second is paid in lives.
Less steel means more men in the line and more of them dead. More steel means
fewer. So the question the game asks is not *how much can I extract* but *which
currency am I paying in*.

The trap is that the two costs are not independent. A peasant starved in 1932
is a soldier missing in 1941, so extracting harder to build steel shrinks the
army the steel was meant to protect. Push far enough and you lose the war
holding the largest stockpile in Europe.

**Tractors are not the goal.** They are how you get the steel *without* taking
the grain — the way to pay in machines instead of people.

| strategy | starved | fallen | **total dead** | war |
|---|---|---|---|---|
| mechanise, arm late | 0 | 18 | **18** | won |
| build nothing | 0 | 60 | **60** | lost |
| strip the villages | 53 | 29 | **82** | lost |

## Play

```
./play                    # interactive: a spiel, then lettered options each year
```

Or drive it by flags, which is scriptable and deterministic:

```
./up.sh
deno run --allow-net stalin.ts new --seed 1928
deno run --allow-net stalin.ts plan --labour 95,0,12,8,0 --procure firm \
    --export surplus --buy engineers --build tractors
...five times...
deno run --allow-net stalin.ts reckoning
./down.sh
```

`--labour F,D,M,R,A` sets Fields, Drivers, Mill, Rail, Army. Drivers without
tractors are wasted; tractors without drivers are monuments. Everyone eats,
but only the first two grow anything — which is why moving a peasant into the
mill costs you twice.

`./playthrough.sh "<plan args>" ...` scripts a whole game. Deterministic on the
seed, so a playthrough is a regression test.

## Where the type system is doing the work

Two rules are carried by the checker rather than validated at run time.

**The harvest gate.** `ExportChoice<G>` is a conditional type over a finite
union, so it *computes* which export decisions exist at each grade:

```ts
type ExportChoice<G extends HarvestGrade> =
  G extends "failure"  ? "none"
: G extends "poor"     ? "none" | "surplus"
: G extends "adequate" ? "none" | "surplus" | "full"
:                        "none" | "surplus" | "full" | "maximum";

exportPlan("bumper", "maximum")   // fine
exportPlan("failure", "maximum")  // does not compile
```

Exporting grain during a failed harvest is not a move the engine rejects. It is
a move that cannot be written down.

**The steel gate**, which is the arc of the whole game:

```ts
type SteelTrade<P extends SteelPosition> =
  P extends "deficit"  ? "none" | "buy"
: P extends "balanced" ? "none"
:                        "none" | "sell";
```

You begin in deficit and buy steel with grain at a punitive rate; you end in
surplus and sell it. The transition Robin asked for — from exporting grain to
exporting steel — is a **change of fibre**, not an `if`. `balanced` is the
hinge, where neither trade exists.

Both work because the algebra gives Σ-types over *finite* index sets. A rule
over tonnages could not be typed; the same rule over grades can. That is also
how the apparatus actually worked: quotas were set against reported categories,
never measured tonnes.

`type-tests.ts` asserts all of this against the compiler and is mutation-tested
— widening the `failure` fibre by one option makes it stop compiling.

## The four combinators

| | where | why that one |
|---|---|---|
| `⊠` tensor | fields ⊠ mill ⊠ railway | all three work at once and **all three owe a report**; there is no partial year |
| `◁` chain | produce ◁ haul | what the railway is asked to move is computed **from what was reaped** |
| `×` product | tractors × armaments | the same steel, one decision: offer both, answer one |
| `+` sum | the branches of a year | the moves legal in trade are not those legal in winter |

And the progression Robin asked for — *export both grain and steel* — is a
change of combinator. While the line to the port is narrow the sale is a
**product** (one contract). Build enough rail and it becomes a **tensor**
(ship both). That is §5's own distinction between `×` and `⊠`, used as a
game mechanic.

## What the reports are worth

Each commissariat holds two things the Plan cannot see: how well it is actually
doing, and how much it inflates its dispatches. Gosplan keeps the true ledger,
because the grain physically exists. What diverges is the **report**, and you
plan against the report.

```
Narkomtiazhprom: quota fulfilled, with difficulties overcome.
```

This is §6's caveat about the untyped oracle, relocated. The type of a dispatch
guarantees its shape and says exactly nothing about its truth. The reckoning
prints both columns.

## Part II

Not built. The war is one computation, not a campaign — you commit the reserve
and the surviving population, and the arithmetic reports what it cost. The
Second and Third Plans, and the campaign itself, are the sequel.

## A note on the subject

This is a resource-allocation game about the First Five-Year Plan, and the
famine in it is not a scoring gimmick — it is the direct arithmetic consequence
of the extraction decision, which is what it was. The game keeps a body count
and reports it without commentary. Historical scaffolding: the 1930 collapse in
world grain prices is the Depression; German engineers at Magnitogorsk and
Albert Kahn's Detroit office at Stalingrad are why hard currency mattered; the
Turksib is why a railway is throughput and not just capital.
