# stalin

The First Five-Year Plan as a container. Five servers, ten decisions, one
reckoning.

A year is two turns. In **spring** you fix where the hands go and how hard the
villages are squeezed — before you know the weather. In **autumn** the harvest
comes in graded, and you dispose of it knowing exactly what it was. A quota set
in March against a harvest that fails in August is not a game mechanic; it is
how a famine is administered.

Built on the four combinators of §5 of Neil Ghani's *Containers for Typed
Agentic AI* — `+`, `⊠`, `◁`, `×` as first-class values, vendored unmodified
into [`lib/`](lib/). That reuse is itself the test of whether that library is
a library or just some code that worked once.

Requires [Deno](https://deno.com) 2.x. No install step, no lockfile, no
dependencies beyond the standard library.

```
  you ─$ stalin sow|reap ...─▶ [ 8801 gosplan ]                  the Plan
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

**Steel and soldiers are complements, and partly substitutes.** Combat power is
`men x manPower + steelPower x sqrt(steel x men)`. A man is worth something
holding nothing; a shell is worth nothing with nobody to fire it; and the more
steel each man already carries, the less the next ton adds. The same victory can
therefore be bought with more of one or more of the other, and the price of the
second is paid in lives — but neither ever fully replaces the other, and there
is no stockpile past which another ton buys nothing. So the question the game
asks is not *how much can I extract* but *which currency am I paying in*.

The trap is that the two costs are not independent. A peasant starved in 1932
is a soldier missing in 1941, so extracting harder to build steel shrinks the
army the steel was meant to protect. Push far enough and you lose the war
holding the largest stockpile in Europe.

**Tractors are not the goal.** They are how you raise the harvest *without*
taking the grain — the way to pay in machines instead of people. There are two
roads to them, and choosing between them is most of the early game:

- **Build them.** Hard currency buys a German engineer, the engineer raises the
  mill, the mill makes steel, 20 spare steel opens the works, and the works
  makes 20 tractors a year forever. Four steps, and the first tractor is years
  away.
- **Buy them.** Ten in hard currency each, ready to drive, needing no engineer
  and no mill and no works — and building none of those either. Every one is
  bought again next time.

The Fordsons came in by the thousand before Stalingrad opened.

| strategy | starved | fallen | **total dead** | war |
|---|---|---|---|---|
| tractors, then armaments | 0 | 16 | **16** | won |
| gentle arms *(found by search)* | `AJBEBJAJAJ` | 5 | 4 | **9** | won |
| brutalist mechanisation | `CMKEBIBJNJ` | 15 | 3 | **18** | won |
| no railway, so the grain rots | `KABEBIBJAJ` | 25 | 4 | **29** | won |
| partial armaments | `CABEBINJAA` | 21 | 14 | **35** | won |
| totally brutal | `KJBEAJBJAJ` | 44 | 5 | **49** | won |
| tractors bought abroad | `AMAMAFAMAF` | 3 | 57 | **60** | lost |
| never armed | `CAKEBINIAI` | 15 | 52 | **67** | lost |

Five of those win. **The two orderings disagree**: ranked by soldiers dead the
best plan is brutalist mechanisation — 3 fallen, because it ends holding more
armaments than anything else on the board and an army small enough to carry
them; ranked by everyone dead it comes second, because the fifteen it starved
outnumber the one soldier it saved. The game holds both numbers and does not
say which is the real one.

`calibrate.ts` is the design brief written as a test: eight things the game is
meant to say at once, measured together, because they are coupled and tuning
one at a time walks in circles. Seven hold. The eighth — that brutalist
mechanisation should be *optimal* — does not, and `implementation.pdf` explains
why it is a dependency length rather than a number: the mechanised economy
matures in 1932 and then the plan ends.

## Play

```
./play                    # interactive: a spiel, then lettered options each year
```

A plan keeps its letter for the whole game — unavailable ones stay in place,
greyed, with the reason. So a sequence of letters really is a strategy, and
`letters.ts` searches that space directly. Spring offers `A B C D K L N`,
autumn `A E F G I J M`; ten letters is a whole game.

Or drive it by flags, which is scriptable and deterministic:

```
./up.sh
deno run --allow-net stalin.ts new --seed 1928
deno run --allow-net stalin.ts sow  --labour 95,0,12,8 --procure firm
deno run --allow-net stalin.ts reap --export surplus --buy engineers \
    --build tractors
...five times each...
deno run --allow-net stalin.ts reckoning
./down.sh
```

`--labour F,D,M,R` sets Fields, Drivers, Mill, Rail. Drivers without
tractors are wasted; tractors without drivers are monuments. Everyone eats,
but only the first two grow anything — which is why moving a peasant into the
mill costs you twice.

`./playthrough.sh "<sow args>" "<reap args>" ...` scripts a whole game,
arguments alternating by season. Deterministic on the
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
